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
  // El estado se edita aquí y no en la lista: allí el círculo marca hecha de
  // un toque, y «en curso» es la respuesta a una pregunta que sólo se hace
  // teniendo la tarea delante.
  status: z.enum(STATUSES).default("NO_INICIADA"),
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
    status: formData.get("status") || "NO_INICIADA",
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

/** Las preguntas de la encuesta de la ficha, que aquí son las columnas. */
const CAMPOS_TAREA = [
  "title",
  "status",
  "priority",
  "project_id",
  "due_date",
  "due_time",
  "due_end",
  "categories",
  "notes",
  "description",
  "icon",
] as const;

type CampoTarea = (typeof CAMPOS_TAREA)[number];

const respuestaTareaSchema = z.object({
  task_id: z.string().uuid("Tarea no encontrada."),
  campo: z.enum(CAMPOS_TAREA, { message: "Pregunta desconocida." }),
  valor: z.union([z.string().max(20000), z.array(z.string().max(200)).max(40), z.number(), z.null()]),
});

export type RespuestaTarea = z.infer<typeof respuestaTareaSchema>["valor"];

/** Un texto, o null si está en blanco. */
function textoTarea(valor: RespuestaTarea): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t === "" ? null : t;
}

function coincide<T extends string>(valores: readonly T[], valor: RespuestaTarea): T | null {
  const t = textoTarea(valor);
  return t !== null && (valores as readonly string[]).includes(t) ? (t as T) : null;
}

function fechaTarea(valor: RespuestaTarea): string | null {
  const t = textoTarea(valor);
  return t !== null && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

type ParcheTarea = Partial<{
  title: string;
  status: (typeof STATUSES)[number];
  priority: (typeof PRIORITIES)[number];
  project_id: string | null;
  due_date: string | null;
  due_end: string | null;
  due_time: string | null;
  categories: string[];
  notes: string | null;
  description: string | null;
  icon: string | null;
}>;

/**
 * La columna que toca esta respuesta, y sólo ella.
 *
 * El título, el estado y la prioridad son `not null`: una respuesta que no
 * vale devuelve un parche vacío en vez de escribir null, porque el `update`
 * fallaría entero. Es la misma regla que en comidas.
 */
function columnaDeTarea(campo: CampoTarea, valor: RespuestaTarea): ParcheTarea {
  switch (campo) {
    case "title": {
      const titulo = textoTarea(valor);
      return titulo === null ? {} : { title: titulo.slice(0, 300) };
    }
    case "status": {
      const estado = coincide(STATUSES, valor);
      return estado === null ? {} : { status: estado };
    }
    case "priority": {
      const prioridad = coincide(PRIORITIES, valor);
      return prioridad === null ? {} : { priority: prioridad };
    }
    case "project_id": {
      const id = textoTarea(valor);
      // Un id que no es un uuid es la ficha de un proyecto que ya no existe:
      // se guarda como «sin proyecto» en vez de reventar la fila.
      return { project_id: id !== null && z.string().uuid().safeParse(id).success ? id : null };
    }
    case "due_date":
      return { due_date: fechaTarea(valor) };
    case "due_end":
      return { due_end: fechaTarea(valor) };
    case "due_time": {
      const hora = textoTarea(valor);
      return { due_time: hora !== null && /^\d{2}:\d{2}$/.test(hora) ? hora : null };
    }
    case "categories":
      return { categories: Array.isArray(valor) ? valor.map(String) : [] };
    case "notes":
      return { notes: textoTarea(valor) };
    case "description":
      return { description: textoTarea(valor) };
    case "icon":
      return { icon: textoTarea(valor) };
  }
}

/**
 * Una respuesta de la encuesta de la ficha, guardada en cuanto se contesta.
 *
 * Más simple que en lecturas y comidas: aquí la fila **siempre existe**. Una
 * tarea nace de un campo y un botón (`ui/new-task.tsx`), que es lo más rápido
 * que puede ser apuntar algo antes de que se te olvide; la encuesta es para
 * rellenarla después, que es cuando hay diez campos y ninguna prisa.
 */
export async function saveTaskAnswer(
  taskId: string,
  campo: string,
  valor: RespuestaTarea,
): Promise<TaskFormState> {
  const user = await requireUser();

  const parsed = respuestaTareaSchema.safeParse({ task_id: taskId, campo, valor });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const parche = columnaDeTarea(parsed.data.campo, parsed.data.valor);
  if (Object.keys(parche).length === 0) return { error: null, success: true };

  const supabase = await createClient();

  // Marcar «hecha» desde la ficha tiene que sellar el cierre igual que lo hace
  // el círculo de la lista, o la gráfica de «entra y sale» se quedaría sin la
  // mitad de los cierres. Y desmarcarla tiene que borrar el sello.
  if (parche.status !== undefined) {
    const { data: antes } = await supabase
      .from("tasks_items")
      .select("completed_at")
      .eq("id", parsed.data.task_id)
      .eq("user_id", user.id)
      .maybeSingle();

    Object.assign(parche, {
      completed_at:
        parche.status === "HECHA" ? (antes?.completed_at ?? new Date().toISOString()) : null,
    });
  }

  const { error } = await supabase
    .from("tasks_items")
    .update({ ...parche, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.task_id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la tarea.", success: false };

  await republish();
  revalidateTasks();
  revalidatePath(`/tareas/${parsed.data.task_id}`);
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
 * Cambiar el estado de varias tareas a la vez.
 *
 * Doce tareas pasadas de fecha se despachan de una revisión, no de doce: las
 * que ya no aplican se cierran juntas y las que siguen vivas se dejan. Ir una
 * por una es lo que hace que la lista de vencidas crezca hasta que se ignora
 * entera -- que es el mismo problema que tenía apuntar operaciones.
 *
 * Se actualiza en una sola consulta con `in`, no en un bucle: doce viajes a la
 * base de datos para doce filas de la misma tabla es trabajo que no hace falta,
 * y a mitad de un bucle un fallo deja la mitad cambiada.
 */
export async function setTasksStatus(
  taskIds: string[],
  status: string,
): Promise<{ error: string | null; changed: number }> {
  const user = await requireUser();

  if (!(STATUSES as readonly string[]).includes(status)) {
    return { error: "Estado no reconocido.", changed: 0 };
  }
  // Un tope para que un clic no dispare una escritura enorme por accidente.
  const ids = taskIds.filter((id) => z.uuid().safeParse(id).success).slice(0, 200);
  if (ids.length === 0) return { error: "No hay tareas seleccionadas.", changed: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks_items")
    .update({
      status: status as (typeof STATUSES)[number],
      completed_at: status === "HECHA" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id");

  if (error) return { error: "No se pudieron cambiar las tareas.", changed: 0 };

  await republish();
  revalidateTasks();
  return { error: null, changed: (data ?? []).length };
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
