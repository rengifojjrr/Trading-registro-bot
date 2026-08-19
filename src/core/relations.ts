import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { EntityKind } from "@/types/database";

import { ENTITIES } from "./entities";

/**
 * Vínculos entre módulos.
 *
 * En Notion tu base de tareas tiene una relación de verdad con otra base; aquí
 * los seis módulos eran islas, y eso obliga a repetir el contexto en cada
 * sitio: la tarea «grabar el vídeo del lunes» y la pieza «vídeo del lunes» no
 * se conocían, así que cerrar una no decía nada de la otra.
 *
 * Se guarda dirigido y se lee en las dos direcciones. Guardar el par una sola
 * vez -- ordenando tipo e identificador antes de insertar -- ahorra una fila y
 * obliga a leer al revés la mitad de las veces; no compensa.
 */

export interface RelatedRow {
  /** El identificador del vínculo, no el de la entidad. */
  linkId: string;
  kind: EntityKind;
  id: string;
  title: string;
  icon: string | null;
}

export async function fetchRelated(kind: EntityKind, entityId: string): Promise<RelatedRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [outgoing, incoming] = await Promise.all([
    supabase
      .from("core_relations")
      .select("id, to_kind, to_id")
      .eq("user_id", user.id)
      .eq("from_kind", kind)
      .eq("from_id", entityId),
    supabase
      .from("core_relations")
      .select("id, from_kind, from_id")
      .eq("user_id", user.id)
      .eq("to_kind", kind)
      .eq("to_id", entityId),
  ]);

  const targets: { linkId: string; kind: EntityKind; id: string }[] = [
    ...(outgoing.data ?? []).map((r) => ({ linkId: r.id, kind: r.to_kind, id: r.to_id })),
    ...(incoming.data ?? []).map((r) => ({ linkId: r.id, kind: r.from_kind, id: r.from_id })),
  ];

  if (targets.length === 0) return [];

  // Una consulta por tabla, no una por vínculo: cinco vínculos a cinco tareas
  // son una consulta, no cinco.
  const byKind = new Map<EntityKind, string[]>();
  for (const target of targets) {
    byKind.set(target.kind, [...(byKind.get(target.kind) ?? []), target.id]);
  }

  const titles = new Map<string, { title: string; icon: string | null }>();

  await Promise.all(
    [...byKind].map(async ([entityKind, ids]) => {
      const meta = ENTITIES[entityKind];
      const columns = ["id", meta.titleColumn, meta.iconColumn].filter(Boolean).join(", ");
      const { data } = await supabase
        .from(meta.table)
        .select(columns)
        .eq("user_id", user.id)
        .in("id", ids);

      for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
        titles.set(`${entityKind}:${row.id}`, {
          title: String(row[meta.titleColumn] ?? "").trim() || "Sin nombre",
          icon: meta.iconColumn ? (row[meta.iconColumn] ?? null) : null,
        });
      }
    }),
  );

  return targets
    .map((target) => {
      const found = titles.get(`${target.kind}:${target.id}`);
      // Un vínculo cuyo destino ya no existe se calla en lugar de pintar una
      // fila vacía: la entidad pudo irse a la papelera desde otra pantalla.
      if (!found) return null;
      return { linkId: target.linkId, kind: target.kind, id: target.id, ...found };
    })
    .filter((row): row is RelatedRow => row !== null);
}

export async function linkEntities(
  from: { kind: EntityKind; id: string },
  to: { kind: EntityKind; id: string },
): Promise<boolean> {
  if (from.kind === to.kind && from.id === to.id) return false;

  const user = await requireUser();
  const supabase = await createClient();

  // Si ya existe al revés, no se crea la de ida: son el mismo vínculo leído
  // desde el otro lado, y dos filas darían dos entradas idénticas en la ficha.
  const { data: reverse } = await supabase
    .from("core_relations")
    .select("id")
    .eq("user_id", user.id)
    .eq("from_kind", to.kind)
    .eq("from_id", to.id)
    .eq("to_kind", from.kind)
    .eq("to_id", from.id)
    .maybeSingle();

  if (reverse) return true;

  const { error } = await supabase.from("core_relations").insert({
    user_id: user.id,
    from_kind: from.kind,
    from_id: from.id,
    to_kind: to.kind,
    to_id: to.id,
  });

  // El índice único hace que enlazar dos veces lo mismo no sea un fallo.
  return !error || error.code === "23505";
}

export async function unlink(linkId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("core_relations").delete().eq("id", linkId).eq("user_id", user.id);
}

/** Quita los vínculos de una entidad que se va, en las dos direcciones. */
export async function removeRelationsFor(kind: EntityKind, entityId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("core_relations")
    .delete()
    .eq("user_id", user.id)
    .eq("from_kind", kind)
    .eq("from_id", entityId);

  await supabase
    .from("core_relations")
    .delete()
    .eq("user_id", user.id)
    .eq("to_kind", kind)
    .eq("to_id", entityId);
}

/**
 * Busca entidades por nombre para el selector de vínculos.
 *
 * Recorre las ocho tablas porque un vínculo puede ir a cualquiera de ellas, y
 * obligar a elegir primero el tipo convertiría dos clics en cuatro.
 */
export async function searchEntities(term: string, limit = 8): Promise<RelatedRow[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const user = await requireUser();
  const supabase = await createClient();

  const found = await Promise.all(
    Object.values(ENTITIES).map(async (meta) => {
      const columns = ["id", meta.titleColumn, meta.iconColumn].filter(Boolean).join(", ");
      const { data } = await supabase
        .from(meta.table)
        .select(columns)
        .eq("user_id", user.id)
        .ilike(meta.titleColumn, `%${trimmed}%`)
        .limit(limit);

      return ((data ?? []) as unknown as Record<string, string | null>[]).map((row) => ({
        linkId: "",
        kind: meta.kind,
        id: String(row.id),
        title: String(row[meta.titleColumn] ?? "").trim() || "Sin nombre",
        icon: meta.iconColumn ? (row[meta.iconColumn] ?? null) : null,
      }));
    }),
  );

  return found.flat().slice(0, limit * 2);
}
