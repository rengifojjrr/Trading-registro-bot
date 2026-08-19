import { DateTime } from "luxon";

import { stretchPastMidnight } from "@/core/clock";

/**
 * Las cuatro preguntas que el sueño puede responder ahora que la duración es
 * un número y no una etiqueta de texto.
 *
 * Todo lo de aquí es puro: entra una lista de noches y sale algo dibujable.
 * Las páginas no calculan nada, sólo eligen qué preguntar.
 */

export interface AnalysableNight {
  sleepDate: string;
  sleptAt: string | null;
  wokeAt: string | null;
  durationMinutes: number | null;
  score: number | null;
  beforeBed: string[];
}

export interface Point {
  label: string;
  value: number;
}

/** «19 ago» -- la etiqueta corta del eje, que con treinta noches ya va justo. */
export function shortDayLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  return dt.isValid ? dt.toFormat("d LLL") : date;
}

/**
 * Cuánto dormiste cada noche, en horas con un decimal.
 *
 * En horas y no en minutos porque el eje tiene que leerse de un vistazo: «7,3»
 * se entiende y «438» hay que dividirlo mentalmente. Las noches sin registrar
 * no aparecen -- una barra a cero diría que no dormiste.
 *
 * Va de la más antigua a la más reciente, al revés de como llegan de la base
 * de datos: una serie temporal que avanza hacia la izquierda no se lee.
 */
export function durationSeries(nights: AnalysableNight[]): Point[] {
  return [...nights]
    .filter((n) => n.durationMinutes !== null)
    .sort((a, b) => a.sleepDate.localeCompare(b.sleepDate))
    .map((n) => ({
      label: shortDayLabel(n.sleepDate),
      value: Math.round(((n.durationMinutes as number) / 60) * 10) / 10,
    }));
}

/**
 * La hora de acostarse como número decimal, con la madrugada estirada por
 * encima de las 24 (ver `@/core/clock`): acostarse a la 01:00 es «las 25»,
 * para que la línea suba una hora en lugar de desplomarse veintitrés.
 */
export function clockHours(iso: string | null, timezone: string): number | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso).setZone(timezone);
  if (!dt.isValid) return null;
  return Math.round(stretchPastMidnight(dt.hour + dt.minute / 60) * 100) / 100;
}

/** La hora de levantarse, sin estirar: nadie se levanta de madrugada por costumbre. */
export function wakeHours(iso: string | null, timezone: string): number | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso).setZone(timezone);
  if (!dt.isValid) return null;
  return Math.round((dt.hour + dt.minute / 60) * 100) / 100;
}

export interface ScheduleSeries {
  bedtime: Point[];
  wake: Point[];
}

/**
 * A qué hora te acuestas y a qué hora te levantas, noche a noche.
 *
 * Son dos series y no una porque la pregunta que responden es la
 * regularidad, y la regularidad se ve en lo plana que está cada línea, no en
 * la distancia entre ellas -- esa distancia ya es la duración, que tiene su
 * propia gráfica.
 */
export function scheduleSeries(nights: AnalysableNight[], timezone: string): ScheduleSeries {
  const ordered = [...nights].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));

  const bedtime: Point[] = [];
  const wake: Point[] = [];

  for (const night of ordered) {
    const label = shortDayLabel(night.sleepDate);
    const bed = clockHours(night.sleptAt, timezone);
    const up = wakeHours(night.wokeAt, timezone);
    if (bed !== null) bedtime.push({ label, value: bed });
    if (up !== null) wake.push({ label, value: up });
  }

  return { bedtime, wake };
}

/**
 * Duración contra puntaje: ¿dormir más te hace valorar mejor la noche?
 *
 * Puede que la respuesta sea que no, y eso también es un hallazgo -- una nube
 * sin forma dice que lo que te arregla la noche no son las horas.
 */
export function durationVsScore(nights: AnalysableNight[]): { x: number; y: number }[] {
  return nights
    .filter((n) => n.durationMinutes !== null && n.score !== null)
    .map((n) => ({
      x: Math.round(((n.durationMinutes as number) / 60) * 10) / 10,
      y: n.score as number,
    }));
}

export interface TagEffect {
  tag: string;
  nights: number;
  averageMinutes: number;
  /** Diferencia con la media general, en minutos. Negativa = duermes menos. */
  deltaMinutes: number;
}

/**
 * Qué costumbre de antes de dormir acompaña a tus mejores noches.
 *
 * Dos decisiones que cambian lo que dice la gráfica:
 *
 * 1. Se muestra la diferencia contra tu media, no la duración absoluta. «7h
 *    40m tras leer» no significa nada sin saber cuánto duermes normalmente;
 *    «+25 min» sí.
 *
 * 2. Una etiqueta necesita un mínimo de noches para aparecer. Con una sola,
 *    la diferencia es ruido con aspecto de conclusión, y esta gráfica invita
 *    justo a sacar conclusiones.
 *
 * Y una advertencia que la página repite en voz alta: esto es coincidencia,
 * no causa. Trasnochar y dormir poco aparecen juntos porque son la misma
 * noche, no porque uno provoque al otro.
 */
export function tagEffects(nights: AnalysableNight[], minimumNights = 3): TagEffect[] {
  const measured = nights.filter((n) => n.durationMinutes !== null);
  if (measured.length === 0) return [];

  const overall =
    measured.reduce((sum, n) => sum + (n.durationMinutes as number), 0) / measured.length;

  const buckets = new Map<string, number[]>();
  for (const night of measured) {
    // Un mismo hábito repetido en la lista de una noche no cuenta dos veces.
    for (const tag of new Set(night.beforeBed)) {
      const bucket = buckets.get(tag) ?? [];
      bucket.push(night.durationMinutes as number);
      buckets.set(tag, bucket);
    }
  }

  return [...buckets.entries()]
    .filter(([, values]) => values.length >= minimumNights)
    .map(([tag, values]) => {
      const average = values.reduce((sum, v) => sum + v, 0) / values.length;
      return {
        tag,
        nights: values.length,
        averageMinutes: Math.round(average),
        deltaMinutes: Math.round(average - overall),
      };
    })
    .sort((a, b) => b.deltaMinutes - a.deltaMinutes);
}

/**
 * Cuánto varía la hora a la que te acuestas, en minutos.
 *
 * Es la desviación típica, y es la cifra que mejor resume si tienes horario o
 * no: se puede dormir ocho horas de media acostándose a las diez un día y a
 * las tres el siguiente, y esa media no lo delata.
 */
export function bedtimeSpread(nights: AnalysableNight[], timezone: string): number | null {
  const hours = nights
    .map((n) => clockHours(n.sleptAt, timezone))
    .filter((h): h is number => h !== null);
  if (hours.length < 2) return null;

  const mean = hours.reduce((sum, h) => sum + h, 0) / hours.length;
  const variance = hours.reduce((sum, h) => sum + (h - mean) ** 2, 0) / hours.length;
  return Math.round(Math.sqrt(variance) * 60);
}
