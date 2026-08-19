import { DateTime } from "luxon";

/**
 * La rejilla de un mes.
 *
 * Pura y sin reloj: recibe el mes y devuelve las semanas. Que no lea la hora
 * es lo que la hace testeable y lo que evita que el render dé un resultado en
 * el servidor y otro en el navegador.
 *
 * Las semanas empiezan en lunes porque es como está tu calendario de Notion y
 * como se lee una semana laboral: un domingo suelto al principio parte el fin
 * de semana en dos filas distintas.
 */

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  date: string;
  dayOfMonth: number;
  /** Falso para los días de relleno del mes anterior y el siguiente. */
  inMonth: boolean;
}

export const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** `month` es `YYYY-MM`. */
export function monthGrid(month: string): CalendarDay[][] {
  const first = DateTime.fromISO(`${month}-01`, { zone: "utc" });
  if (!first.isValid) return [];

  // `weekday` va de 1 (lunes) a 7 (domingo), así que restar uno da cuántos
  // días de relleno hacen falta delante.
  const start = first.minus({ days: first.weekday - 1 });
  const last = first.endOf("month");
  const end = last.plus({ days: 7 - last.weekday });

  const weeks: CalendarDay[][] = [];
  let cursor = start;

  while (cursor <= end) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({
        date: cursor.toISODate()!,
        dayOfMonth: cursor.day,
        inMonth: cursor.month === first.month,
      });
      cursor = cursor.plus({ days: 1 });
    }
    weeks.push(week);
  }

  return weeks;
}

/** El mes de una fecha: `2026-03-14` → `2026-03`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** El mes anterior o el siguiente, para las flechas del calendario. */
export function shiftMonth(month: string, months: number): string {
  const shifted = DateTime.fromISO(`${month}-01`, { zone: "utc" }).plus({ months });
  return shifted.isValid ? shifted.toFormat("yyyy-MM") : month;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function monthLabel(month: string): string {
  const parsed = DateTime.fromISO(`${month}-01`, { zone: "utc" });
  if (!parsed.isValid) return month;
  return `${MONTH_NAMES[parsed.month - 1]} de ${parsed.year}`;
}

/**
 * Los días que cubre una tarea con rango.
 *
 * Una tarea que dura del lunes al miércoles tiene que aparecer los tres días,
 * no sólo el último: aplanarla a su fecha de fin es lo que hacía que el
 * calendario mintiera sobre cuándo hay trabajo.
 */
export function daysBetween(start: string, end: string | null): string[] {
  if (!end || end <= start) return [start];

  const from = DateTime.fromISO(start, { zone: "utc" });
  const to = DateTime.fromISO(end, { zone: "utc" });
  if (!from.isValid || !to.isValid) return [start];

  // Un rango absurdamente largo -- por un dedazo al teclear el año -- llenaría
  // el calendario entero y dejaría la página inservible.
  const span = Math.min(to.diff(from, "days").days, 366);

  const days: string[] = [];
  for (let i = 0; i <= span; i += 1) days.push(from.plus({ days: i }).toISODate()!);
  return days;
}
