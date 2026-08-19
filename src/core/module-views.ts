import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Vistas guardadas por módulo.
 *
 * En «To-Do» tienes siete y en el calendario de contenido cinco; aquí había
 * pestañas fijas que no se podían cambiar, duplicar ni crear. Una vista no es
 * un capricho: «Esta semana» y «Próximas tareas» son dos preguntas distintas
 * sobre la misma tabla, y tener que reconstruir los filtros cada vez es lo que
 * hace que uno deje de preguntarlas.
 *
 * Se guarda la query string entera y no una columna por filtro, igual que en
 * las vistas de trading: cualquier filtro que se añada más adelante queda
 * soportado sin volver a tocar el esquema.
 */

export interface ModuleView {
  id: string;
  name: string;
  path: string;
  query: string;
  sortOrder: number;
}

export async function fetchModuleViews(module: string): Promise<ModuleView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_module_views")
    .select("id, name, path, query, sort_order")
    .eq("user_id", user.id)
    .eq("module", module)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    query: row.query,
    sortOrder: row.sort_order,
  }));
}

export interface SaveViewResult {
  ok: boolean;
  error?: string;
}

export async function saveModuleView(
  module: string,
  name: string,
  path: string,
  query: string,
): Promise<SaveViewResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "Ponle un nombre a la vista." };
  if (trimmed.length > 60) return { ok: false, error: "El nombre es demasiado largo." };
  if (!path.startsWith("/")) return { ok: false, error: "Ruta no válida." };

  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("core_module_views")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("module", module);

  const { error } = await supabase.from("core_module_views").insert({
    user_id: user.id,
    module,
    name: trimmed,
    path,
    query: query.replace(/^\?/, ""),
    sort_order: count ?? 0,
  });

  if (error) {
    return error.code === "23505"
      ? { ok: false, error: "Ya tienes una vista con ese nombre." }
      : { ok: false, error: "No se pudo guardar la vista." };
  }

  return { ok: true };
}

export async function renameModuleView(id: string, name: string): Promise<SaveViewResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 60) {
    return { ok: false, error: "Nombre no válido." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("core_module_views")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return error.code === "23505"
      ? { ok: false, error: "Ya tienes una vista con ese nombre." }
      : { ok: false, error: "No se pudo renombrar." };
  }
  return { ok: true };
}

export async function deleteModuleView(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("core_module_views").delete().eq("id", id).eq("user_id", user.id);
}
