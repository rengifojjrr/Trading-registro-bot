import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Plantillas de creación.
 *
 * Crear algo aquí empezaba siempre en blanco, y ese blanco es justo lo que
 * hace que no se rellene. En Notion tienes «Nueva tarea» y tres plantillas
 * distintas de publicación, y lo que aportan no son los campos: es el
 * esqueleto del cuerpo -- HOOK, SCRIPT/NOTES, TAGS -- ya escrito, para que
 * escribir consista en rellenar huecos y no en recordar cuáles había.
 */

export interface Template {
  id: string;
  module: string;
  name: string;
  /** Valores precargados, con los mismos nombres que los campos del formulario. */
  payload: Record<string, unknown>;
  body: string | null;
  isDefault: boolean;
  sortOrder: number;
}

export async function fetchTemplates(module: string): Promise<Template[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_templates")
    .select("id, module, name, payload, body, is_default, sort_order")
    .eq("user_id", user.id)
    .eq("module", module)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    module: row.module,
    name: row.name,
    payload: row.payload,
    body: row.body,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
  }));
}

export interface TemplateResult {
  ok: boolean;
  error?: string;
}

export async function saveTemplate(
  module: string,
  name: string,
  payload: Record<string, unknown>,
  body: string | null,
  isDefault: boolean,
): Promise<TemplateResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 60) {
    return { ok: false, error: "Ponle un nombre a la plantilla." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  // El índice único deja una sola por defecto en cada módulo: hay que quitar
  // la anterior antes de poner la nueva, o la inserción choca.
  if (isDefault) await clearDefault(module);

  const { count } = await supabase
    .from("core_templates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("module", module);

  const { error } = await supabase.from("core_templates").insert({
    user_id: user.id,
    module,
    name: trimmed,
    payload,
    body,
    is_default: isDefault,
    sort_order: count ?? 0,
  });

  if (error) {
    return error.code === "23505"
      ? { ok: false, error: "Ya tienes una plantilla con ese nombre." }
      : { ok: false, error: "No se pudo guardar la plantilla." };
  }
  return { ok: true };
}

export async function setDefaultTemplate(module: string, id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await clearDefault(module);
  await supabase
    .from("core_templates")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", user.id);
}

async function clearDefault(module: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("core_templates")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("module", module)
    .eq("is_default", true);
}

export async function deleteTemplate(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("core_templates").delete().eq("id", id).eq("user_id", user.id);
}
