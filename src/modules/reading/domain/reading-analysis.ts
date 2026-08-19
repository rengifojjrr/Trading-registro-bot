import { DateTime } from "luxon";

import { shiftDate } from "@/core/today";

/**
 * Lo que se puede preguntar a un histórico de lecturas.
 *
 * En Notion no se podía preguntar nada: «Cuánto tiempo leí» guardaba géneros
 * y «Cuántas hojas» tenía como única opción «40 minutos». Con los campos
 * cruzados no hay serie, ni ritmo, ni reparto por género.
 */

export interface AnalysableSession {
  sessionDate: string;
  startedAt: string | null;
  minutes: number | null;
  pages: number | null;
  bookTitle: string | null;
  bookGenres: string[];
}

export interface Point {
  label: string;
  value: number;
}

function shortDayLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  return dt.isValid ? dt.toFormat("d LLL") : date;
}

/**
 * Minutos leídos cada día de la ventana, incluidos los días a cero.
 *
 * Los ceros se dibujan a propósito, al revés que en sueño: un día sin leer es
 * un día sin leer, no un dato que falta. Los huecos son justo lo que hay que
 * ver.
 */
export function minutesByDay(
  sessions: AnalysableSession[],
  fromDate: string,
  toDate: string,
): Point[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.sessionDate < fromDate || s.sessionDate > toDate) continue;
    byDate.set(s.sessionDate, (byDate.get(s.sessionDate) ?? 0) + (s.minutes ?? 0));
  }

  const points: Point[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    points.push({ label: shortDayLabel(cursor), value: byDate.get(cursor) ?? 0 });
    cursor = shiftDate(cursor, 1);
  }
  return points;
}

/**
 * Cuántos minutos van a cada género.
 *
 * El género es del libro, no de la sesión, así que una sesión reparte sus
 * minutos entre todos los géneros de su libro: un libro de «Crecimiento
 * personal» y «Espiritual» suma sus cuarenta minutos a los dos. Es
 * intencionado -- la pregunta es «de qué leo», no «cómo reparto mis horas» --
 * y por eso la suma de la gráfica puede pasar del total real.
 */
export function minutesByGenre(sessions: AnalysableSession[]): Point[] {
  const byGenre = new Map<string, number>();
  for (const s of sessions) {
    const minutes = s.minutes ?? 0;
    if (minutes === 0) continue;
    for (const genre of new Set(s.bookGenres)) {
      byGenre.set(genre, (byGenre.get(genre) ?? 0) + minutes);
    }
  }

  return [...byGenre.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Minutos por libro, para ver en qué se va el tiempo de verdad. */
export function minutesByBook(sessions: AnalysableSession[]): Point[] {
  const byBook = new Map<string, number>();
  for (const s of sessions) {
    const minutes = s.minutes ?? 0;
    if (minutes === 0 || !s.bookTitle) continue;
    byBook.set(s.bookTitle, (byBook.get(s.bookTitle) ?? 0) + minutes);
  }

  return [...byBook.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * A qué hora del día lees, en franjas de dos horas.
 *
 * En franjas y no hora a hora porque veinticuatro barras casi vacías no
 * enseñan una costumbre; doce sí. Sólo cuentan las sesiones con hora de
 * inicio: registrar una lectura sin decir cuándo es normal, y meterla en una
 * franja inventada movería el resultado entero.
 */
export function minutesByTimeOfDay(sessions: AnalysableSession[], timezone: string): Point[] {
  const buckets = new Array(12).fill(0) as number[];
  let measured = 0;

  for (const s of sessions) {
    if (!s.startedAt) continue;
    const dt = DateTime.fromISO(s.startedAt).setZone(timezone);
    if (!dt.isValid) continue;
    buckets[Math.floor(dt.hour / 2)] += s.minutes ?? 0;
    measured += 1;
  }

  if (measured === 0) return [];

  return buckets.map((value, index) => ({
    label: `${String(index * 2).padStart(2, "0")}-${String(index * 2 + 2).padStart(2, "0")}`,
    value,
  }));
}

/**
 * Tu ritmo real, en páginas por hora.
 *
 * Se calcula sobre el total y no como media de los ritmos de cada sesión:
 * promediar ritmos da el mismo peso a una sesión de cinco minutos que a una
 * de dos horas, y las cortas son justo las que dan ritmos disparatados.
 */
export function overallPace(sessions: AnalysableSession[]): number | null {
  const minutes = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const pages = sessions.reduce((sum, s) => sum + (s.pages ?? 0), 0);
  if (minutes < 10 || pages === 0) return null;
  return Math.round((pages / minutes) * 60);
}
