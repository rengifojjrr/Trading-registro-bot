import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { EMPTY_RESULT, readNotionDatabase, type ImportResult } from "@/lib/notion/read-database";
import { createClient } from "@/lib/supabase/server";

import { mapNotionTask, projectsIn, type NotionMappedTask } from "./domain/notion-mapping";

/**
 * Trae las tareas de la «✅ To-Do Base de Datos».
 *
 * Casi todo se traduce literal. Lo único que cambia de sitio es el proyecto:
 * en Notion es una opción de una lista y aquí es una fila, para que se pueda
 * archivar sin que las tareas que colgaban de él se queden sin etiqueta.
 *
 * Se crean sólo los proyectos que alguna tarea usa de verdad, no las diez
 * opciones definidas en la lista. Un proyecto vacío en el desplegable es ruido
 * que hay que leer cada vez que se crea una tarea.
 */

export function tasksDatabaseId(): string | null {
  return serverEnv().NOTION_TASKS_DATABASE_ID ?? null;
}

export async function importTasksFromNotion(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  if (!env.NOTION_TASKS_DATABASE_ID) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_TASKS_DATABASE_ID en el servidor." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  // Con cuerpos: la explicación de cada tarea vive ahí y no en una propiedad.
  const read = await readNotionDatabase(env.NOTION_TASKS_DATABASE_ID, { withBodies: true });
  if (!read.ok) return { ...EMPTY_RESULT, error: read.error };

  const warnings = new Set<string>();
  const tasks: (NotionMappedTask & { createdTime: string | null })[] = [];
  let skipped = 0;

  for (const page of read.pages) {
    const mapped = mapNotionTask(page);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    for (const warning of mapped.warnings) warnings.add(warning);
    tasks.push({ ...mapped.task, createdTime: page.createdTime });
  }

  if (tasks.length === 0) {
    return { ...EMPTY_RESULT, skipped, warnings: [...warnings] };
  }

  const { data: current } = await supabase
    .from("tasks_projects")
    .select("id, name")
    .eq("user_id", user.id);

  const idByProject = new Map((current ?? []).map((p) => [p.name, p.id]));
  const missing = projectsIn(tasks).filter((name) => !idByProject.has(name));

  if (missing.length > 0) {
    const { data: created, error } = await supabase
      .from("tasks_projects")
      .insert(missing.map((name, index) => ({ user_id: user.id, name, sort_order: index })))
      .select("id, name");
    if (error) return { ...EMPTY_RESULT, error: "No se pudieron crear los proyectos." };
    for (const project of created ?? []) idByProject.set(project.name, project.id);
  }

  const rows = tasks.map((task) => ({
    user_id: user.id,
    notion_page_id: task.notion_page_id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    due_end: task.due_end,
    due_time: task.due_time,
    categories: task.categories,
    description: task.description,
    icon: task.icon,
    project_id: task.project ? (idByProject.get(task.project) ?? null) : null,
    // Notion no guarda cuándo se marcó una tarea, sólo que lo está. Se sella
    // con la fecha de vencimiento como aproximación, y sin ella se queda sin
    // fecha: inventar «hoy» metería cincuenta cierres falsos en la gráfica de
    // «entra y sale» justo el día de la importación.
    completed_at:
      task.status === "HECHA" && task.due_date ? `${task.due_date}T12:00:00Z` : null,
    // Cuándo se creó en Notion, no cuándo se importó. Sin esto la gráfica de
    // «entra y sale» dibuja un pico de cincuenta tareas el día de la
    // importación y ninguna antes.
    ...(task.createdTime ? { created_at: task.createdTime } : {}),
    updated_at: new Date().toISOString(),
  }));

  const { data: existing } = await supabase
    .from("tasks_items")
    .select("notion_page_id")
    .eq("user_id", user.id)
    .not("notion_page_id", "is", null);
  const known = new Set((existing ?? []).map((row) => row.notion_page_id));

  const { error } = await supabase
    .from("tasks_items")
    .upsert(rows, { onConflict: "user_id,notion_page_id" });
  if (error) {
    return { ...EMPTY_RESULT, error: "No se pudieron guardar las tareas importadas." };
  }

  const updated = rows.filter((row) => known.has(row.notion_page_id)).length;
  const doneWithoutDate = tasks.filter((t) => t.status === "HECHA" && !t.due_date).length;

  const notes: string[] = [];
  if (missing.length > 0) notes.push(`Proyectos creados: ${missing.join(", ")}.`);
  if (doneWithoutDate > 0) {
    notes.push(
      `${doneWithoutDate} ${doneWithoutDate === 1 ? "tarea hecha no tenía" : "tareas hechas no tenían"} fecha, así que se importan sin día de cierre.`,
    );
  }

  return {
    imported: rows.length - updated,
    updated,
    skipped,
    warnings: [...warnings],
    notes,
    error: null,
  };
}
