import { DateTime } from "luxon";

import { shiftDate } from "@/core/today";

/**
 * Las preguntas que un hábito responde cuando lleva semanas registrado.
 *
 * El rollup mensual de Notion daba una sola: el porcentaje del mes. Lo que
 * no daba -- y es lo que de verdad cambia una costumbre -- es *cuándo*
 * fallas, y si fallas en todo a la vez o sólo en uno.
 */

export interface HabitHistory {
  id: string;
  name: string;
  emoji: string | null;
  dates: string[];
}

export interface Point {
  label: string;
  value: number;
}

/** Los días de una ventana, del más antiguo al más reciente. */
export function daysBetween(fromDate: string, toDate: string): string[] {
  const days: string[] = [];
  let cursor = fromDate;
  // Con un rango invertido no se devuelve nada en lugar de girar para siempre.
  while (cursor <= toDate) {
    days.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return days;
}

/**
 * Qué porcentaje de tus hábitos cumpliste cada día.
 *
 * Es la línea que enseña las rachas malas: un hábito suelto puede caerse sin
 * que pase nada, pero tres días seguidos por debajo del veinte por ciento es
 * una semana que se te fue, y eso no se ve mirando los hábitos de uno en uno.
 */
export function dailyCompletion(
  habits: HabitHistory[],
  fromDate: string,
  toDate: string,
): Point[] {
  if (habits.length === 0) return [];

  const marked = new Map<string, number>();
  for (const habit of habits) {
    for (const date of new Set(habit.dates)) {
      marked.set(date, (marked.get(date) ?? 0) + 1);
    }
  }

  return daysBetween(fromDate, toDate).map((date) => ({
    label: shortDayLabel(date),
    value: Math.round(((marked.get(date) ?? 0) / habits.length) * 100),
  }));
}

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * En qué día de la semana cumples y en cuál se te cae todo.
 *
 * Casi siempre hay una forma -- el domingo, o el viernes por la noche -- y
 * verla es lo que permite cambiar el plan en lugar de insistir en el mismo.
 *
 * El denominador es cuántos lunes ha habido en la ventana, no cuántos días:
 * si la ventana tiene trece lunes y marcaste diez, es un 77 %.
 */
export function weekdayRates(
  habits: HabitHistory[],
  fromDate: string,
  toDate: string,
): Point[] {
  if (habits.length === 0) return [];

  const days = daysBetween(fromDate, toDate);
  const opportunities = new Array(7).fill(0) as number[];
  const completed = new Array(7).fill(0) as number[];

  const markedBy = new Map<string, number>();
  for (const habit of habits) {
    for (const date of new Set(habit.dates)) {
      markedBy.set(date, (markedBy.get(date) ?? 0) + 1);
    }
  }

  for (const date of days) {
    const index = DateTime.fromISO(date).weekday - 1; // 1 = lunes
    opportunities[index] += habits.length;
    completed[index] += markedBy.get(date) ?? 0;
  }

  return WEEKDAYS.map((label, index) => ({
    label,
    value: opportunities[index] === 0 ? 0 : Math.round((completed[index] / opportunities[index]) * 100),
  }));
}

/** El cumplimiento de cada hábito en la ventana, del que mejor va al que peor. */
export function habitRanking(
  habits: HabitHistory[],
  fromDate: string,
  toDate: string,
): Point[] {
  const total = daysBetween(fromDate, toDate).length;
  if (total === 0) return [];

  return habits
    .map((habit) => {
      const marked = [...new Set(habit.dates)].filter((d) => d >= fromDate && d <= toDate).length;
      return {
        label: habit.emoji ? `${habit.emoji} ${habit.name}` : habit.name,
        value: Math.round((marked / total) * 100),
      };
    })
    .sort((a, b) => b.value - a.value);
}

/** «19 ago» -- la etiqueta corta del eje. */
export function shortDayLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  return dt.isValid ? dt.toFormat("d LLL") : date;
}
