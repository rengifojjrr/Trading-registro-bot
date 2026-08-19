import { DateTime } from "luxon";

/**
 * The date a log entry belongs to, in the user's own timezone.
 *
 * Everything in Vida is filed by day, and "day" is not UTC: logging a meal at
 * 21:00 in Bogotá is already tomorrow in UTC, and would land on the wrong
 * card. The trading module learned this the hard way with session
 * classification; the rest of the modules inherit the lesson rather than
 * rediscovering it.
 */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const dt = DateTime.fromJSDate(now).setZone(timezone);
  return (dt.isValid ? dt : DateTime.fromJSDate(now).setZone("UTC")).toISODate()!;
}

/** The ISO date `days` before `date`, used for streaks and ranges. */
export function shiftDate(date: string, days: number): string {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

/** e.g. "Martes, 19 de agosto" -- the home screen's subtitle. */
export function longDateLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  const text = dt.toFormat("cccc, d 'de' LLLL");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A night's date. Falling asleep at 02:00 on the 5th is still the night of
 * the 4th, which is what makes "how much did I sleep on Tuesday" answerable.
 */
export function nightOf(sleptAt: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(sleptAt).setZone(timezone);
  const anchored = dt.isValid ? dt : DateTime.fromJSDate(sleptAt).setZone("UTC");
  return (anchored.hour < 12 ? anchored.minus({ days: 1 }) : anchored).toISODate()!;
}
