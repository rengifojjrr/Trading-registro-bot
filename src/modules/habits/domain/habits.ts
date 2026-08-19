import { DateTime } from "luxon";

/**
 * Hábitos, en su forma pura.
 *
 * En Notion cada hábito es una columna de la tabla diaria. Eso hace que
 * añadir uno obligue a cambiar el esquema y que el histórico no lo tenga
 * nunca -- y ya pasó: el rollup mensual todavía calcula 📵 y 🔞, dos hábitos
 * que ya no existen en la tabla de 2026. Aquí un hábito es una fila, así que
 * se puede crear, archivar y retomar sin tocar nada, y las rachas de los
 * meses en que sí lo hiciste siguen siendo ciertas.
 */

export interface HabitDefinition {
  id: string;
  name: string;
  emoji: string | null;
  archivedAt: string | null;
}

/** Un día marcado. La ausencia de fila significa "no hecho", no "sin datos". */
export interface HabitEntry {
  habitId: string;
  date: string;
}

/**
 * Días seguidos hasta hoy, contando hacia atrás.
 *
 * Hoy sin marcar no rompe la racha: a media mañana todavía no has hecho lo
 * de hoy, y enseñar un cero ahí castiga por la hora que es. Se empieza a
 * contar desde ayer, y si hoy está marcado, suma.
 */
export function currentStreak(dates: Iterable<string>, today: string): number {
  const marked = new Set(dates);
  let streak = 0;
  let cursor = DateTime.fromISO(today);

  if (marked.has(cursor.toISODate()!)) {
    streak += 1;
  }
  cursor = cursor.minus({ days: 1 });

  while (marked.has(cursor.toISODate()!)) {
    streak += 1;
    cursor = cursor.minus({ days: 1 });
  }
  return streak;
}

/** La racha más larga que ha habido, para saber contra qué compites. */
export function longestStreak(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous: DateTime | null = null;

  for (const iso of sorted) {
    const day = DateTime.fromISO(iso);
    run = previous && day.diff(previous, "days").days === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

export interface DayCompletion {
  done: number;
  total: number;
  /** 0-100. Null cuando no hay ningún hábito activo, que no es lo mismo que 0 %. */
  percent: number | null;
}

export function completionFor(
  activeHabitIds: string[],
  entriesForDay: HabitEntry[],
): DayCompletion {
  const total = activeHabitIds.length;
  if (total === 0) return { done: 0, total: 0, percent: null };

  const active = new Set(activeHabitIds);
  const done = new Set(entriesForDay.filter((e) => active.has(e.habitId)).map((e) => e.habitId)).size;

  return { done, total, percent: Math.round((done / total) * 100) };
}

/**
 * Porcentaje de cumplimiento de un hábito sobre una ventana de días.
 *
 * El denominador son los días transcurridos, no los días con fila: si no
 * marcaste, no lo hiciste. Esa es la diferencia con el sueño, donde una
 * noche sin apuntar sí es un dato que falta.
 */
export function rateOver(dates: Iterable<string>, fromDate: string, toDate: string): number {
  const from = DateTime.fromISO(fromDate);
  const to = DateTime.fromISO(toDate);
  const days = Math.max(1, Math.floor(to.diff(from, "days").days) + 1);

  const marked = [...new Set(dates)].filter((d) => d >= fromDate && d <= toDate).length;
  return Math.round((marked / days) * 100);
}
