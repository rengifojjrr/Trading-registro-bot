import "server-only";

import {
  isEventImportance,
  type CalendarWindow,
  type EconomicCalendarPort,
  type EconomicEvent,
  type EventImportance,
} from "./types";

/**
 * El calendario económico de TradingView.
 *
 * Es el endpoint que usa su widget público de calendario -- el mismo que
 * cualquiera puede incrustar en una web -- así que no pide clave ni cuenta.
 * A cambio **no está documentado**, y eso condiciona todo lo que sigue:
 *
 * - Cada campo se lee a la defensiva. Si un día devuelve un número donde hoy
 *   hay un texto, el evento se descarta; no se cuela un `NaN` hasta la
 *   pantalla.
 * - Lo que llega se guarda en `economic_events` (ver la migración). La
 *   pantalla lee de la tabla, nunca de aquí, así que el día que este endpoint
 *   deje de responder se deja de saber lo que viene -- pero no se pierde nada
 *   de lo que ya se sabía.
 * - Todo el conocimiento de su esquema vive en este archivo, detrás de
 *   `EconomicCalendarPort`. Sustituirlo por una fuente de pago con contrato es
 *   cambiar un archivo.
 */

const ENDPOINT = "https://economic-calendar.tradingview.com/events";

/** Sin esto el endpoint responde 403: es el origen de su propio widget. */
const HEADERS = {
  Origin: "https://www.tradingview.com",
  Referer: "https://www.tradingview.com/",
} as const;

const TIMEOUT_MS = 15_000;

/**
 * El esquema observado del endpoint, con todo `unknown` porque no hay
 * documentación que garantice ninguno de los tipos.
 *
 * Incluye los campos que la fuente devuelve y la aplicación **no** usa
 * (`ticker`, `referenceDate`): dejarlos declarados es lo que permite
 * reconocerlos al leer una respuesta real, y evita que un objeto de prueba
 * copiado tal cual del endpoint no compile.
 */
export interface RawEvent {
  id?: unknown;
  ticker?: unknown;
  /** El periodo al que se refiere el dato, como fecha. Distinto de `date`. */
  referenceDate?: unknown;
  title?: unknown;
  country?: unknown;
  indicator?: unknown;
  category?: unknown;
  period?: unknown;
  date?: unknown;
  importance?: unknown;
  actual?: unknown;
  forecast?: unknown;
  previous?: unknown;
  currency?: unknown;
  unit?: unknown;
  scale?: unknown;
  comment?: unknown;
  source?: unknown;
  source_url?: unknown;
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Un número, o nada.
 *
 * `null` significa «todavía no ha salido» y es la respuesta correcta para el
 * dato real de un evento futuro. Convertirlo a 0 diría que salió y dio cero,
 * que es una afirmación completamente distinta.
 */
function numero(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function importancia(value: unknown): EventImportance {
  if (typeof value === "number" && isEventImportance(value)) return value;
  // Ante la duda, media: ni se esconde ni se grita.
  return 0;
}

/** Traduce un evento crudo, o lo descarta si le falta lo imprescindible. */
export function mapRawEvent(raw: RawEvent): EconomicEvent | null {
  const sourceEventId = texto(raw.id) ?? (typeof raw.id === "number" ? String(raw.id) : null);
  const title = texto(raw.title);
  const country = texto(raw.country);
  const date = texto(raw.date);
  if (!sourceEventId || !title || !country || !date) return null;

  // Una fecha que no es una fecha convierte todo lo demás en ruido: el evento
  // aparecería en la agenda en un momento inventado.
  const occurs = new Date(date);
  if (Number.isNaN(occurs.getTime())) return null;

  return {
    sourceEventId,
    occursAt: occurs.toISOString(),
    country,
    currency: texto(raw.currency),
    title,
    indicator: texto(raw.indicator),
    category: texto(raw.category),
    importance: importancia(raw.importance),
    period: texto(raw.period),
    actual: numero(raw.actual),
    forecast: numero(raw.forecast),
    previous: numero(raw.previous),
    unit: texto(raw.unit),
    scale: texto(raw.scale),
    comment: texto(raw.comment),
    sourceName: texto(raw.source),
    sourceUrl: texto(raw.source_url),
    raw,
  };
}

export class TradingViewCalendarAdapter implements EconomicCalendarPort {
  async listEvents(window: CalendarWindow, countries: string[]): Promise<EconomicEvent[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("from", new Date(window.from).toISOString());
    url.searchParams.set("to", new Date(window.to).toISOString());
    if (countries.length > 0) url.searchParams.set("countries", countries.join(","));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal, cache: "no-store" });
      if (!res.ok) {
        throw new Error(`El calendario económico respondió ${res.status}`);
      }

      const body = (await res.json()) as { status?: unknown; result?: unknown };
      if (body.status !== "ok" || !Array.isArray(body.result)) {
        throw new Error("El calendario económico devolvió algo que no se reconoce");
      }

      return body.result
        .map((raw) => mapRawEvent(raw as RawEvent))
        .filter((event): event is EconomicEvent => event !== null);
    } finally {
      clearTimeout(timeout);
    }
  }
}
