/**
 * El calendario económico, en los términos de la aplicación.
 *
 * Estos tipos son la frontera con la fuente: `tradingview.ts` traduce su
 * esquema a esto, y nada más en la aplicación sabe cómo es esa respuesta. El
 * día que la fuente cambie o se sustituya, cambia ese archivo y no éste.
 */

/**
 * -1 baja, 0 media, 1 alta. Es la escala de la fuente, sin traducir.
 *
 * Se guarda como número y no como `"ALTA" | "MEDIA" | "BAJA"` porque ordenar
 * por importancia es la operación más común, y un texto obligaría a mantener
 * un mapa de orden aparte que puede desincronizarse.
 */
export type EventImportance = -1 | 0 | 1;

export function isEventImportance(value: number): value is EventImportance {
  return value === -1 || value === 0 || value === 1;
}

/** Una publicación macro: qué es, cuándo sale y qué números lleva. */
export interface EconomicEvent {
  /** El identificador que le da la fuente. Único dentro de ella. */
  sourceEventId: string;
  /** Instante de publicación, en UTC (ISO 8601). */
  occursAt: string;
  country: string;
  currency: string | null;
  /** El nombre corto, como lo enseña un calendario: «PPI MoM». */
  title: string;
  /** El nombre largo: «Producer Price Inflation MoM». Agrupa las publicaciones de un mismo indicador. */
  indicator: string | null;
  category: string | null;
  importance: EventImportance;
  /** El periodo al que se refiere el dato («Ago»), que no es la fecha de publicación. */
  period: string | null;
  /** Null mientras no haya salido. Nunca 0 por defecto: no es lo mismo. */
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  /** '%' y similares. */
  unit: string | null;
  /** 'K', 'M', 'B'. */
  scale: string | null;
  comment: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** La respuesta cruda, para poder volver a mirar qué decía exactamente. */
  raw: unknown;
}

/** Ventana de fechas a pedir, en ISO 8601. */
export interface CalendarWindow {
  from: string;
  to: string;
}

/**
 * De dónde salen los eventos.
 *
 * Existe por lo mismo que `MarketDataPort` en Coinbase: la fuente de hoy es un
 * endpoint público sin documentar, y aislarla detrás de una interfaz es lo que
 * permite cambiarla sin tocar ni la pantalla ni la tabla.
 */
export interface EconomicCalendarPort {
  listEvents(window: CalendarWindow, countries: string[]): Promise<EconomicEvent[]>;
}
