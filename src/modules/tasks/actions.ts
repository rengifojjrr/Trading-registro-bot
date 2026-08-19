"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { PRIORITIES, STATUSES, countTasks } from "@/modules/tasks/domain/tasks";

export type TaskFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  title: z.string().trim().min(1, "Escribe la tarea.").max(300),
  project_id: emptyToNull(z.string().uuid()),
  priority: z.enum(PRIORITIES).default("MEDIA"),
  due_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: emptyToNull(z.string().max(4000)),
});

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    title: formData.get("title"),
    project_id: formData.get("project_id"),
    priority: formData.get("priority") || "MEDIA",
    due_date: formData.get("due_date"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks_items").insert({
    user_id: user.id,
    title: parsed.data.title,
    project_id: parsed.data.project_id,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date,
    notes: parsed.data.notes,
    categories: formData.getAll("categories").map(String),
  });
  if (error) return { error: "No se pudo crear la tarea.", success: false };

  await republish();
  revalidatePath("/tareas");
  revalidatePath("/");
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
  revalidatePath("/tareas");
  revalidatePath("/");
}

export async function deleteTask(taskId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("tasks_items").delete().eq("id", taskId).eq("user_id", user.id);

  await republish();
  revalidatePath("/tareas");
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
