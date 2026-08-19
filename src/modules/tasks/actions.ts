"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { PROJECT_COLORS, colorForName } from "@/core/notion-colors";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { PRIORITIES, STATUSES, countTasks } from "@/modules/tasks/domain/tasks";
import type { ImportResult } from "@/lib/notion/read-database";
import { importTasksFromNotion } from "@/modules/tasks/notion-import";
import type { ProjectColor } from "@/types/database";

export type TaskFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  title: z.string().trim().min(1, "Escribe la tarea.").max(300),
  project_id: emptyToNull(z.string().uuid()),
  priority: z.enum(PRIORITIES).default("MEDIA"),
  due_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  // Tus tareas de Notion admiten fecha de inicio a fin y hora concreta; aquí
  // todo se aplanaba al último día, así que lo que duraba tres días se
  // archivaba como si ocurriera entero el jueves.
  due_end: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  due_time: emptyToNull(z.string().regex(/^\d{2}:\d{2}$/)),
  notes: emptyToNull(z.string().max(4000)),
  description: emptyToNull(z.string().max(20000)),
  icon: emptyToNull(z.string().max(8)),
});

/** Los campos que comparten crear y editar, ya validados. */
function readForm(formData: FormData) {
  return schema.safeParse({
    title: formData.get("title"),
    project_id: formData.get("project_id"),
    priority: formData.get("priority") || "MEDIA",
    due_date: formData.get("due_date"),
    due_end: formData.get("due_end"),
    due_time: formData.get("due_time"),
    notes: formData.get("notes"),
    description: formData.get("description"),
    icon: formData.get("icon"),
  });
}

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const user = await requireUser();

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks_items").insert({
    user_id: user.id,
    ...parsed.data,
    categories: formData.getAll("categories").map(String),
  });
  if (error) return { error: "No se pudo crear la tarea.", success: false };

  await republish();
  revalidateTasks();
  return { error: null, success: true };
}

/**
 * Edita una tarea entera.
 *
 * No existía: la lista sólo sabía girar el estado y borrar, así que el título,
 * la fecha, el proyecto, la prioridad, las categorías y las notas quedaban
 * congelados en el momento de crearla, y un error de escritura obligaba a
 * borrar y volver a empezar.
 */
export async function updateTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Tarea no encontrada.", success: false };
  }

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks_items")
    .update({
      ...parsed.data,
      categories: formData.getAll("categories").map(String),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la tarea.", success: false };

  await republish();
  revalidateTasks();
  revalidatePath(`/tareas/${id}`);
  return { error: null, success: true };
}

export async function setTaskStatus(taskId: string, status: string): Promise<void> {
  const user = await requireUser();
  if (!(STATUSES as readonly string[]).includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("tasks_items")
    .update({
      status: status as (typeof STATUSES)[number],
      // Se sella cuándo se terminó, no sólo que está terminada: sin eso no
      // se puede saber cuántas cerraste esta semana.
      completed_at: status === "HECHA" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  await republish();
  revalidateTasks();
}

/**
 * Recuenta después de borrar.
 *
 * Borrar ya no vive aquí: lo hace `DeleteButton` contra la papelera común, que
 * es lo que da el «deshacer». Lo que sí sigue haciendo falta es rehacer las
 * cuentas de la tarjeta de inicio, porque la papelera no sabe nada de ellas.
 */
export async function afterTaskRemoved(): Promise<void> {
  await requireUser();
  await republish();
  revalidateTasks();
}

/**
 * Crea un proyecto.
 *
 * Un proyecto es sólo un nombre bajo el que agrupar tareas; todo lo demás
 * -- fechas, avance, responsables -- se deduce de las tareas que cuelgan de
 * él, así que pedirlo por separado sería pedir dos veces lo mismo.
 */
export async function createProject(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireUser();

  const parsed = z
    .string()
    .trim()
    .min(1, "Ponle nombre al proyecto.")
    .max(120)
    .safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nombre no válido.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks_projects").insert({
    user_id: user.id,
    name: parsed.data,
    // En Notion cada proyecto tiene su color y por eso reconoces una tarjeta
    // sin leerla. Se asigna uno de entrada -- determinista a partir del
    // nombre -- para que la lista nazca ya legible en lugar de gris entera.
    color: colorForName(parsed.data),
  });
  if (error) return { error: "No se pudo crear el proyecto.", success: false };

  revalidateTasks();
  return { error: null, success: true };
}

/** Cambia el color o el icono de un proyecto. */
export async function updateProject(
  projectId: string,
  patch: { color?: ProjectColor; icon?: string | null },
): Promise<void> {
  const user = await requireUser();

  if (patch.color !== undefined && !PROJECT_COLORS.includes(patch.color)) return;

  const supabase = await createClient();
  await supabase
    .from("tasks_projects")
    .update(patch)
    .eq("id", projectId)
    .eq("user_id", user.id);

  revalidateTasks();
}

/**
 * Archiva o reactiva un proyecto.
 *
 * Archivar no borra: las tareas que colgaban de él siguen colgando, con su
 * historial intacto. Borrar el proyecto dejaría huérfanas unas tareas que sí
 * pasaron.
 */
export async function setProjectActive(projectId: string, isActive: boolean): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("tasks_projects")
    .update({ is_active: isActive })
    .eq("id", projectId)
    .eq("user_id", user.id);

  revalidateTasks();
}

/** Las cuatro pantallas del módulo miran las mismas tareas. */
function revalidateTasks(): void {
  revalidatePath("/tareas");
  revalidatePath("/tareas/todas");
  revalidatePath("/tareas/proyectos");
  revalidatePath("/tareas/analisis");
  revalidatePath("/");
}

/**
 * Publica el estado de hoy.
 *
 * A diferencia del resto de módulos, aquí la métrica no describe lo que
 * hiciste hoy sino lo que queda pendiente ahora mismo, que es lo que se
 * quiere ver en la tarjeta.
 */
async function republish(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayIn(await userTimezone());

  const { data } = await supabase
    .from("tasks_items")
    .select("status, priority, due_date")
    .eq("user_id", user.id);

  const counts = countTasks(
    (data ?? []).map((t) => ({ status: t.status, priority: t.priority, dueDate: t.due_date })),
    today,
  );

  await publishDailyMetrics(today, [
    { module: "tasks", key: "pendientes", value: counts.open },
    { module: "tasks", key: "vencidas", value: counts.overdue },
  ]);
}

/**
 * Trae los datos desde Notion.
 *
 * Se dispara a mano y no por cron: la importación es de sentido único y pisa
 * lo que haya, así que una automática que cambie algo mientras se está
 * mirando la pantalla hace que la aplicación parezca embrujada.
 */
export async function runTasksFromNotion(): Promise<ImportResult> {
  await requireUser();
  const result = await importTasksFromNotion();
  if (result.error === null) revalidateTasks();
  return result;
}
