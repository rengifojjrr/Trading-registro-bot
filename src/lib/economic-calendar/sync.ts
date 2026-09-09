import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import { COUNTRIES } from "./relevance";
import { TradingViewCalendarAdapter } from "./tradingview";
import type { EconomicCalendarPort, EconomicEvent } from "./types";

/**
 * Traer el calendario y guardarlo.
 *
 * Dos cosas que no son obvias y que gobiernan el diseño:
 *
 * 1. **La fuente corta en 2000 resultados por petición.** Pedir trece meses de
 *    golpe devuelve 2000 eventos y se calla el resto, sin error y sin avisar:
 *    parecería que funcionó. Por eso la ventana se parte en tramos de sesenta
 *    días, que para un solo país deja cada tramo en unos doscientos.
 *
 * 2. **Un evento cambia después de existir.** Nace con previsión y dato
 *    previo, y el dato real le aparece el día que se publica. Así que esto no
 *    es «insertar lo nuevo» sino «volver a escribir la ventana entera», y la
 *    clave de idempotencia es (fuente, identificador de la fuente).
 */

/** Cuánto se retrocede mientras falte histórico. */
const BACKFILL_DAYS = 400;
/**
 * Hasta dónde tiene que llegar hacia atrás para considerarse completo. Menos
 * que `BACKFILL_DAYS` a propósito: si fueran iguales, la propia ventana que
 * acaba de traerse nunca llegaría a cumplir la condición y el relleno se
 * repetiría en cada sincronización para siempre.
 */
const HISTORY_TARGET_DAYS = 300;
/** La ventana de todos los días: lo justo para lo que acaba de salir y lo que viene. */
const ROUTINE_PAST_DAYS = 10;
const FUTURE_DAYS = 60;
/** Tramos por petición, para no chocar con el tope de la fuente. */
const CHUNK_DAYS = 60;
/** Por debajo de esto no se vuelve a preguntar. */
const MIN_MINUTES_BETWEEN_SYNCS = 15;

const DIA_MS = 86_400_000;

export interface CalendarSyncResult {
  ran: boolean;
  reason: "fresco" | "hecho" | "fallo";
  /** Cuántos eventos se escribieron (nuevos o actualizados). */
  events: number;
}

/**
 * Parte la ventana en tramos que la fuente pueda contestar enteros.
 *
 * Exportado sólo para poder probarlo: es la defensa contra el tope de 2000
 * resultados, y ese tope no da error -- devuelve una lista corta y se calla.
 * Un fallo aquí no se vería, se notaría meses después como huecos.
 */
export function chunks(from: Date, to: Date): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let cursor = from.getTime();
  const end = to.getTime();

  while (cursor < end) {
    const next = Math.min(cursor + CHUNK_DAYS * DIA_MS, end);
    out.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return out;
}

function toRow(event: EconomicEvent) {
  return {
    source: "TRADINGVIEW",
    source_event_id: event.sourceEventId,
    occurs_at: event.occursAt,
    country: event.country,
    currency: event.currency,
    title: event.title,
    indicator: event.indicator,
    category: event.category,
    importance: event.importance,
    period: event.period,
    actual: event.actual,
    forecast: event.forecast,
    previous: event.previous,
    unit: event.unit,
    scale: event.scale,
    comment: event.comment,
    source_name: event.sourceName,
    source_url: event.sourceUrl,
    raw_payload: event.raw as Json,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Cuándo se sincronizó por última vez.
 *
 * Sale de la propia tabla en vez de una tabla de estado aparte: cada
 * sincronización reescribe `fetched_at` de todos los eventos de la ventana,
 * así que el máximo **es** la hora de la última sincronización buena. Una
 * tabla de estado más sería una cosa más que puede quedarse desincronizada
 * con la realidad que dice describir.
 */
async function lastSyncedAt(): Promise<Date | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("economic_events")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.fetched_at ? new Date(data.fetched_at) : null;
}

/**
 * El evento más antiguo que hay guardado.
 *
 * Es lo que decide si toca traerse el histórico entero. La pregunta no es «¿hay
 * filas?» sino «¿llega hacia atrás lo suficiente?»: con una tabla sembrada a
 * medias -- o con un relleno que se quedó a mitad porque se agotó el tiempo de
 * la función -- «¿hay filas?» diría que sí y el histórico no se completaría
 * nunca. Así se arregla solo en la siguiente pasada.
 */
async function oldestEventAt(): Promise<Date | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("economic_events")
    .select("occurs_at")
    .order("occurs_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.occurs_at ? new Date(data.occurs_at) : null;
}

export async function syncEconomicCalendar(
  options: { force?: boolean; adapter?: EconomicCalendarPort } = {},
): Promise<CalendarSyncResult> {
  try {
    const ultima = await lastSyncedAt();

    if (!options.force && ultima) {
      const minutos = (Date.now() - ultima.getTime()) / 60_000;
      if (minutos < MIN_MINUTES_BETWEEN_SYNCS) return { ran: false, reason: "fresco", events: 0 };
    }

    // Mientras el histórico no llegue lo bastante atrás se trae entero, y no
    // sólo la primera vez: es lo que hace que «las últimas veces que salió
    // este dato» tenga algo que enseñar desde el principio en vez de dentro de
    // seis meses, y lo que deja que un relleno a medias se complete solo.
    const masAntiguo = await oldestEventAt();
    const faltaHistorico =
      masAntiguo === null || masAntiguo.getTime() > Date.now() - HISTORY_TARGET_DAYS * DIA_MS;
    const desde = new Date(Date.now() - (faltaHistorico ? BACKFILL_DAYS : ROUTINE_PAST_DAYS) * DIA_MS);
    const hasta = new Date(Date.now() + FUTURE_DAYS * DIA_MS);

    const adapter = options.adapter ?? new TradingViewCalendarAdapter();
    const supabase = createAdminClient();
    let escritos = 0;

    for (const tramo of chunks(desde, hasta)) {
      const eventos = await adapter.listEvents(tramo, [...COUNTRIES]);
      if (eventos.length === 0) continue;

      const { error } = await supabase
        .from("economic_events")
        .upsert(eventos.map(toRow), { onConflict: "source,source_event_id" });

      if (error) {
        // Un tramo que falla no invalida los que ya entraron: el calendario
        // queda incompleto, no roto, y el siguiente intento lo completa.
        console.error("[calendario] no se pudo guardar un tramo de eventos", error);
        continue;
      }
      escritos += eventos.length;
    }

    return { ran: true, reason: "hecho", events: escritos };
  } catch (error) {
    // Que el calendario no se pueda refrescar es un fastidio; que tumbe la
    // pantalla que lo enseña, no. Lo guardado sigue estando.
    console.error("[calendario] la sincronización no pudo completarse", error);
    return { ran: false, reason: "fallo", events: 0 };
  }
}
