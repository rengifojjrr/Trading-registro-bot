import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { EntityKind, Json, TrashPayload } from "@/types/database";

import { ENTITIES } from "./entities";

/**
 * Borrar con red debajo.
 *
 * Antes, borrar era inmediato y definitivo, con el botón justo al lado del que
 * cambia el estado: un dedo torcido en el móvil era una pérdida real. Ahora la
 * fila se archiva entera antes de desaparecer y se puede devolver con su mismo
 * identificador, que es lo que hace que lo que colgaba de ella -- comentarios,
 * adjuntos, vínculos -- siga colgando al volver.
 *
 * No hay borrado lógico (una columna «borrado» en cada tabla) a propósito:
 * obligaría a que las veinte consultas de los módulos recordaran filtrarla, y
 * la que se olvidara enseñaría filas fantasma. Mover la fila fuera de su tabla
 * hace que olvidarse sea imposible.
 */

const RETENTION_DAYS = 30;

/**
 * Insertar en una tabla cuyo nombre sólo se conoce al ejecutar.
 *
 * `from()` necesita el nombre como literal para resolver el tipo de la fila;
 * con una variable colapsa `Insert` a `never` y no deja insertar nada. Esta
 * función recorre once tablas por diseño, así que el tipo se pierde aquí, en
 * una línea y con el motivo escrito, en vez de con `as never` repartidos por
 * el archivo. Lo que se inserta salió de un `select *` de esa misma tabla, así
 * que la forma está garantizada por construcción.
 */
interface UntypedInsert {
  insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }>;
}

function untyped(builder: unknown): UntypedInsert {
  return builder as UntypedInsert;
}

export interface TrashRow {
  id: string;
  kind: EntityKind;
  entityId: string;
  label: string;
  deletedAt: string;
}

/**
 * Archiva una fila y la borra de su tabla.
 *
 * Devuelve el identificador de la entrada de papelera, que es lo que el aviso
 * de «deshacer» necesita para poder revertirlo.
 */
export async function moveToTrash(kind: EntityKind, id: string): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const meta = ENTITIES[kind];

  const { data: row } = await supabase
    .from(meta.table)
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return null;

  const children: Record<string, Record<string, Json>[]> = {};
  for (const child of meta.children ?? []) {
    const { data } = await supabase
      .from(child.table)
      .select("*")
      .eq(child.foreignKey, id)
      .eq("user_id", user.id);
    if (data && data.length > 0) children[child.table] = data as Record<string, Json>[];
  }

  const payload: TrashPayload = {
    row: row as Record<string, Json>,
    ...(Object.keys(children).length > 0 ? { children } : {}),
  };

  const label = String((row as Record<string, unknown>)[meta.titleColumn] ?? "").trim();

  const { data: entry, error } = await supabase
    .from("core_trash")
    .insert({
      user_id: user.id,
      entity_kind: kind,
      entity_id: id,
      label: label.length > 0 ? label.slice(0, 200) : "Sin nombre",
      payload,
    })
    .select("id")
    .single();

  if (error || !entry) return null;

  // Sólo se borra de verdad cuando la copia ya está a salvo. Al revés, un
  // fallo entre las dos operaciones perdería la fila para siempre.
  await supabase.from(meta.table).delete().eq("id", id).eq("user_id", user.id);

  return entry.id;
}

/** Devuelve una fila archivada a su tabla, con sus hijos. */
export async function restoreFromTrash(trashId: string): Promise<boolean> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("core_trash")
    .select("entity_kind, payload")
    .eq("id", trashId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!entry) return false;

  const meta = ENTITIES[entry.entity_kind];
  const payload = entry.payload;

  const { error } = await untyped(supabase.from(meta.table)).insert(payload.row);
  if (error) return false;

  for (const [table, rows] of Object.entries(payload.children ?? {})) {
    await untyped(supabase.from(table)).insert(rows);
  }

  await supabase.from("core_trash").delete().eq("id", trashId).eq("user_id", user.id);
  return true;
}

export async function listTrash(limit = 100): Promise<TrashRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_trash")
    .select("id, entity_kind, entity_id, label, deleted_at")
    .eq("user_id", user.id)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.entity_kind,
    entityId: row.entity_id,
    label: row.label,
    deletedAt: row.deleted_at,
  }));
}

/** Vacía lo que lleva más de treinta días archivado, como hace Notion. */
export async function purgeExpiredTrash(now = new Date()): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from("core_trash")
    .delete()
    .eq("user_id", user.id)
    .lt("deleted_at", cutoff.toISOString())
    .select("id");

  return (data ?? []).length;
}

/** Borra una entrada concreta sin devolverla. */
export async function purgeOne(trashId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("core_trash").delete().eq("id", trashId).eq("user_id", user.id);
}
