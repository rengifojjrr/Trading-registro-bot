import { DateTime } from "luxon";

import { shiftDate } from "@/core/today";

import { CATEGORIES, type TaskPriority, type TaskStatus } from "./tasks";

/**
 * Lo que se puede saber de un histórico de tareas.
 *
 * La tabla de Notion tiene siete vistas y todas responden lo mismo con otro
 * filtro: qué me queda. Ninguna responde qué termino, ni cuánto tarda en
 * terminarse, ni qué se me queda siempre atrás -- porque para eso hace falta
 * la fecha en que se completó, y una casilla marcada no la guarda.
 */

export interface AnalysableTask {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  categories: string[];
  projectName: string | null;
}

export interface Point {
  label: string;
  value: number;
}

function shortDayLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  return dt.isValid ? dt.toFormat("d LLL") : date;
}

/** El día del calendario del usuario en el que cayó un instante. */
function dayOf(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso).setZone(timezone);
  return dt.isValid ? dt.toISODate() : null;
}

/**
 * Cuántas tareas creaste y cuántas terminaste cada día.
 *
 * Las dos líneas juntas contestan la única pregunta que importa de una lista
 * de tareas: si crece o mengua. Una sola de las dos no lo dice -- terminar
 * cinco al día suena bien hasta que se ve que entran ocho.
 */
export function flowSeries(
  tasks: AnalysableTask[],
  fromDate: string,
  toDate: string,
  timezone: string,
): { label: string; creadas: number; terminadas: number }[] {
  const created = new Map<string, number>();
  const completed = new Map<string, number>();

  for (const task of tasks) {
    const born = dayOf(task.createdAt, timezone);
    if (born && born >= fromDate && born <= toDate) {
      created.set(born, (created.get(born) ?? 0) + 1);
    }
    const done = dayOf(task.completedAt, timezone);
    if (done && done >= fromDate && done <= toDate) {
      completed.set(done, (completed.get(done) ?? 0) + 1);
    }
  }

  const rows: { label: string; creadas: number; terminadas: number }[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    rows.push({
      label: shortDayLabel(cursor),
      creadas: created.get(cursor) ?? 0,
      terminadas: completed.get(cursor) ?? 0,
    });
    cursor = shiftDate(cursor, 1);
  }
  return rows;
}

/**
 * Cuántos días pasan entre crear una tarea y terminarla, de media.
 *
 * Sólo cuenta las terminadas, y eso sesga el número hacia abajo a propósito:
 * las que llevan meses abiertas no han tardado nada todavía porque no han
 * terminado. Para esas está `stalest`.
 */
export function averageDaysToDone(tasks: AnalysableTask[]): number | null {
  const durations = tasks
    .filter((t) => t.completedAt !== null)
    .map((t) => DateTime.fromISO(t.completedAt!).diff(DateTime.fromISO(t.createdAt), "days").days)
    .filter((d) => Number.isFinite(d) && d >= 0);

  if (durations.length === 0) return null;
  return Math.round((durations.reduce((sum, d) => sum + d, 0) / durations.length) * 10) / 10;
}

export interface StaleTask {
  title: string;
  days: number;
}

/**
 * Lo que lleva más tiempo abierto sin terminarse.
 *
 * Es la lista incómoda, y por eso está: una tarea que lleva cuatro meses
 * abierta casi nunca es una tarea pendiente, es una decisión sin tomar.
 */
export function stalest(
  tasks: (AnalysableTask & { title: string })[],
  today: string,
  timezone: string,
  limit = 5,
): StaleTask[] {
  const reference = DateTime.fromISO(today, { zone: timezone });

  return tasks
    .filter((t) => t.status !== "HECHA")
    .map((t) => ({
      title: t.title,
      days: Math.floor(reference.diff(DateTime.fromISO(t.createdAt).setZone(timezone), "days").days),
    }))
    .filter((t) => t.days >= 1)
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}

/**
 * Reparto por categoría de lo que queda pendiente.
 *
 * Pendientes y no todas: el reparto de lo hecho es historia, y el de lo
 * pendiente es la semana que viene. Se enseñan todas las categorías con algo
 * abierto, en el orden fijo de la lista, para que la gráfica no se reordene
 * sola cada vez que se marca una tarea.
 */
export function openByCategory(tasks: AnalysableTask[]): Point[] {
  const open = tasks.filter((t) => t.status !== "HECHA");

  const counts = new Map<string, number>();
  for (const task of open) {
    // Una tarea sin categoría existe y hay que contarla en algún sitio.
    const labels = task.categories.length > 0 ? new Set(task.categories) : new Set(["Sin categoría"]);
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const ordered = [...CATEGORIES, "Sin categoría"];
  return ordered
    .filter((label) => (counts.get(label) ?? 0) > 0)
    .map((label) => ({ label, value: counts.get(label)! }));
}

/** Pendientes por proyecto, de más cargado a menos. */
export function openByProject(tasks: AnalysableTask[]): Point[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.status === "HECHA") continue;
    const label = task.projectName ?? "Sin proyecto";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
