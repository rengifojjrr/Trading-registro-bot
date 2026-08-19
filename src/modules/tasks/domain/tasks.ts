/**
 * Tareas, en su forma pura.
 *
 * El módulo mejor montado de los que venían de Notion, así que aquí se
 * conserva lo que ya funcionaba -- estados, prioridades, proyectos y
 * categorías -- y sólo se añade lo que una base de datos puede hacer y una
 * tabla de Notion no: agrupar por urgencia real en lugar de por fecha.
 */

export const STATUSES = ["NO_INICIADA", "EN_CURSO", "HECHA"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  NO_INICIADA: "Sin empezar",
  EN_CURSO: "En curso",
  HECHA: "Hecha",
};

export const PRIORITIES = ["ALTA", "MEDIA", "BAJA"] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

/** Las categorías tal cual están en la To-Do de Notion. */
export const CATEGORIES = [
  "Trabajo",
  "Estudio",
  "Familia",
  "Quehaceres domésticos",
  "Deporte",
  "Ocio",
  "Viaje",
  "Otro",
] as const;

export type Urgency = "VENCIDA" | "HOY" | "PRONTO" | "DESPUES" | "SIN_FECHA";

export const URGENCY_LABELS: Record<Urgency, string> = {
  VENCIDA: "Vencidas",
  HOY: "Para hoy",
  PRONTO: "Esta semana",
  DESPUES: "Más adelante",
  SIN_FECHA: "Sin fecha",
};

/**
 * En qué cubo cae una tarea.
 *
 * Comparación de cadenas ISO, no de objetos Date: las fechas de vencimiento
 * son días del calendario del usuario, y convertirlas a Date las ancla a una
 * zona horaria que no es necesariamente la suya, con lo que "hoy" se
 * convierte en "ayer" a partir de cierta hora.
 */
export function urgencyOf(dueDate: string | null, today: string): Urgency {
  if (!dueDate) return "SIN_FECHA";
  if (dueDate < today) return "VENCIDA";
  if (dueDate === today) return "HOY";

  // Siete días naturales, contando hoy.
  const soonLimit = addDaysIso(today, 7);
  return dueDate <= soonLimit ? "PRONTO" : "DESPUES";
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** El orden en que conviene mirarlas: primero lo vencido, luego lo de hoy. */
export const URGENCY_ORDER: Urgency[] = ["VENCIDA", "HOY", "PRONTO", "DESPUES", "SIN_FECHA"];

export interface TaskLike {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

export interface TaskCounts {
  open: number;
  done: number;
  overdue: number;
  dueToday: number;
}

export function countTasks(tasks: TaskLike[], today: string): TaskCounts {
  const open = tasks.filter((t) => t.status !== "HECHA");
  return {
    open: open.length,
    done: tasks.filter((t) => t.status === "HECHA").length,
    overdue: open.filter((t) => urgencyOf(t.dueDate, today) === "VENCIDA").length,
    dueToday: open.filter((t) => urgencyOf(t.dueDate, today) === "HOY").length,
  };
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Ordena dentro de un grupo: primero la prioridad, y a igual prioridad, lo
 * que vence antes. Sin fecha va al final -- no es urgente por definición.
 */
export function compareWithinGroup(a: TaskLike, b: TaskLike): number {
  const byPriority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}
