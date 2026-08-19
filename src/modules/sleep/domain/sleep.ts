import { DateTime } from "luxon";

/**
 * El módulo de sueño, en su forma pura.
 *
 * Existe sobre todo para arreglar una cosa: en Notion la duración del sueño
 * se guardaba como texto dentro de una lista de opciones («8 horas»,
 * «-4 horas», «+8 horas») y las horas de acostarse y levantarse eran también
 * opciones fijas. Con eso no se puede sacar una media ni una gráfica -- el
 * dato existía pero no se podía medir. Aquí se guardan dos marcas de tiempo
 * reales y la duración es una resta.
 */

/** Las opciones tal cual están hoy en la base de datos «Dormir» de Notion. */
export const MOOD_ON_WAKING = [
  "Alegre",
  "Con energía",
  "Relajado",
  "Agradecido",
  "Cansado",
  "Con sueño",
  "Apurado",
  "Amargado",
  "Con hambre",
  "Dolor de espalda",
] as const;

export const WOKE_HOW = [
  "Solo",
  "Con alarma",
  "Me despertaron",
  "Desperté durante la noche",
  "La alarma sonó y no me desperté",
  "Pesadilla",
  "Karim me despertó",
] as const;

export const BEFORE_BED = [
  "Leer",
  "Ejercicio",
  "Bañarme",
  "Cepillarme los dientes",
  "Ver serie",
  "Ver redes sociales",
  "Jugar",
  "Escribir",
  "Grabar",
  "Llamada",
  "Hacer trading",
  "Trabajar hasta tarde",
  "Trasnochar",
  "Hablar con Luisa",
] as const;

/**
 * Qué noche propone el formulario al abrirlo.
 *
 * El sueño se registra por la mañana, después de dormirlo, y a esa hora la
 * noche que acaba de terminar es la de *ayer*: dormirse el 18 a las 23:00 y
 * levantarse el 19 a las 7:00 es la noche del 18. Proponer el día en curso
 * archivaba cada mañana bajo la noche siguiente, que aún no ha pasado.
 *
 * El corte está a las 18:00: antes de esa hora lo que se registra es la
 * noche anterior; a partir de ahí ya se está pensando en la de hoy.
 */
export function defaultNightToLog(now: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(now).setZone(timezone);
  const anchored = dt.isValid ? dt : DateTime.fromJSDate(now).setZone("UTC");
  return (anchored.hour < 18 ? anchored.minus({ days: 1 }) : anchored).toISODate()!;
}

/** «Noche del martes 18» -- cómo se nombra una noche en pantalla. */
export function nightLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  if (!dt.isValid) return date;
  return `Noche del ${dt.toFormat("cccc d 'de' LLLL")}`;
}

/**
 * Convierte lo que se teclea en el formulario -- una noche y dos horas del
 * reloj -- en dos instantes.
 *
 * Cruzar la medianoche es el caso normal, no la excepción, así que se
 * resuelve con una regla explícita en lugar de dejarlo a la interpretación:
 * una hora de acostarse antes del mediodía pertenece ya al día siguiente
 * (acostarse a las 2am de la «noche del 19» es el día 20), y si la hora de
 * despertar no es posterior a la de acostarse, es que amaneció.
 *
 * Devuelve null cuando falta un dato en lugar de inventarse un instante.
 */
export function resolveSleepTimestamps(params: {
  /** La noche a la que pertenece, en formato ISO. */
  sleepDate: string;
  /** HH:mm, tal cual sale de un <input type="time">. */
  bedtime: string | null;
  wakeTime: string | null;
  timezone: string;
}): { sleptAt: string | null; wokeAt: string | null } {
  const { sleepDate, bedtime, wakeTime, timezone } = params;
  if (!bedtime || !wakeTime) return { sleptAt: null, wokeAt: null };

  const bed = parseClock(bedtime);
  const wake = parseClock(wakeTime);
  if (!bed || !wake) return { sleptAt: null, wokeAt: null };

  const base = DateTime.fromISO(sleepDate, { zone: timezone });
  if (!base.isValid) return { sleptAt: null, wokeAt: null };

  // Antes del mediodía ya es el día siguiente de esa noche.
  const sleptDay = bed.hour < 12 ? base.plus({ days: 1 }) : base;
  const sleptAt = sleptDay.set({ hour: bed.hour, minute: bed.minute, second: 0, millisecond: 0 });

  let wokeAt = sleptAt.set({ hour: wake.hour, minute: wake.minute, second: 0, millisecond: 0 });
  if (wokeAt <= sleptAt) wokeAt = wokeAt.plus({ days: 1 });

  return { sleptAt: sleptAt.toISO(), wokeAt: wokeAt.toISO() };
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** «7h 20m». La unidad de siempre para hablar de sueño son horas y minutos, no minutos sueltos. */
export function formatSleepDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "--";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Vuelve a HH:mm para rellenar el formulario al editar. */
export function clockFromTimestamp(iso: string | null, timezone: string): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso).setZone(timezone);
  return dt.isValid ? dt.toFormat("HH:mm") : "";
}

export interface SleepStat {
  nights: number;
  averageMinutes: number | null;
  averageScore: number | null;
}

/**
 * La media que hoy no puedes calcular.
 *
 * Ignora las noches sin duración en lugar de contarlas como cero: una noche
 * sin registrar no es una noche sin dormir, y tratarlas igual hundiría la
 * media justo cuando se te olvida apuntar.
 */
export function summarise(entries: { durationMinutes: number | null; score: number | null }[]): SleepStat {
  const withDuration = entries.filter((e) => e.durationMinutes !== null);
  const withScore = entries.filter((e) => e.score !== null);

  return {
    nights: entries.length,
    averageMinutes:
      withDuration.length === 0
        ? null
        : Math.round(
            withDuration.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / withDuration.length,
          ),
    averageScore:
      withScore.length === 0
        ? null
        : Math.round(
            (withScore.reduce((sum, e) => sum + (e.score ?? 0), 0) / withScore.length) * 10,
          ) / 10,
  };
}
