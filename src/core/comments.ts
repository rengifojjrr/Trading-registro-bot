import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { EntityKind } from "@/types/database";

/**
 * Comentarios sobre cualquier cosa.
 *
 * Notion deja abrir un hilo en cualquier página, y esa es la vía por la que
 * alguien que no eres tú -- un editor, por ejemplo -- deja una nota sin tocar
 * el contenido. Sin eso, la única forma de anotar una pieza es reescribir sus
 * campos, y entonces la nota y el dato quedan mezclados para siempre.
 */

export interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchComments(kind: EntityKind, entityId: string): Promise<CommentRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_comments")
    .select("id, body, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Cuántos comentarios tiene cada entidad de una lista, para el contador. */
export async function countComments(
  kind: EntityKind,
  entityIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (entityIds.length === 0) return counts;

  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_comments")
    .select("entity_id")
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .in("entity_id", entityIds);

  for (const row of data ?? []) {
    counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
  }
  return counts;
}

export async function addComment(
  kind: EntityKind,
  entityId: string,
  body: string,
): Promise<boolean> {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 5000) return false;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("core_comments").insert({
    user_id: user.id,
    entity_kind: kind,
    entity_id: entityId,
    body: trimmed,
  });

  return !error;
}

export async function editComment(id: string, body: string): Promise<boolean> {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 5000) return false;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("core_comments")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return !error;
}

export async function removeComment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("core_comments").delete().eq("id", id).eq("user_id", user.id);
}

/**
 * Borra los comentarios de una entidad que se va.
 *
 * Los llama quien borra la fila: no hay clave foránea contra once tablas
 * distintas, así que la cascada se hace a mano y en un sitio.
 */
export async function removeCommentsFor(kind: EntityKind, entityId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("core_comments")
    .delete()
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .eq("entity_id", entityId);
}
