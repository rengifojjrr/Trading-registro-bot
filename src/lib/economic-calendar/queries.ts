import "server-only";

import { createClient } from "@/lib/supabase/server";

import { isKeyForBitcoin } from "./relevance";
import { isEventImportance, type EventImportance } from "./types";

/**
 * Lo que la pantalla lee. Siempre de la tabla, nunca de la fuente: una página
 * que depende de que un tercero responda es una página que a veces no carga.
 */

const COLUMNS =
  "id, source_event_id, occurs_at, country, currency, title, indicator, category, importance, period, actual, forecast, previous, unit, scale, comment, source_name, source_url";

/** Un evento tal y como lo usa la interfaz: los números ya son números. */
export interface CalendarEvent {
  id: string;
  occursAt: string;
  country: string;
  title: string;
  indicator: string | null;
  category: string | null;
  importance: EventImportance;
  period: string | null;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string | null;
  scale: string | null;
  comment: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** De los que se miran para Bitcoin. Ver `relevance.ts`. */
  key: boolean;
}

interface Row {
  id: string;
  occurs_at: string;
  country: string;
  title: string;
  indicator: string | null;
  category: string | null;
  importance: number;
  period: string | null;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  scale: string | null;
  comment: string | null;
  source_name: string | null;
  source_url: string | null;
}

/**
 * Las columnas `numeric` llegan como texto por el cliente de Supabase (ver
 * docs/DATABASE.md). Aquí sí se convierten a número: son datos macro para
 * comparar y enseñar, no dinero que haya que sumar sin perder un céntimo.
 */
function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toEvent(row: Row): CalendarEvent {
  const importance = isEventImportance(row.importance) ? row.importance : 0;
  return {
    id: row.id,
    occursAt: row.occurs_at,
    country: row.country,
    title: row.title,
    indicator: row.indicator,
    category: row.category,
    importance,
    period: row.period,
    actual: toNumber(row.actual),
    forecast: toNumber(row.forecast),
    previous: toNumber(row.previous),
    unit: row.unit,
    scale: row.scale,
    comment: row.comment,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    key: isKeyForBitcoin({ title: row.title, indicator: row.indicator, importance }),
  };
}

/** Los eventos de una ventana de fechas, en orden de publicación. */
export async function fetchEventsBetween(params: {
  from: Date;
  to: Date;
  /** Deja fuera lo que la fuente marca por debajo de esto. */
  minImportance?: EventImportance;
  /** Sólo esta importancia exacta. Manda sobre `minImportance` cuando se da. */
  exactImportance?: EventImportance;
  /** Sólo esta categoría de la fuente ('prce', 'lbr'…). */
  category?: string;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  let query = supabase
    .from("economic_events")
    .select(COLUMNS)
    .gte("occurs_at", params.from.toISOString())
    .lte("occurs_at", params.to.toISOString())
    .order("occurs_at", { ascending: true })
    .limit(params.limit ?? 500);

  if (params.exactImportance !== undefined) {
    query = query.eq("importance", params.exactImportance);
  } else if (params.minImportance !== undefined) {
    query = query.gte("importance", params.minImportance);
  }

  if (params.category) query = query.eq("category", params.category);

  const { data, error } = await query;
  if (error) throw new Error(`fetchEventsBetween: ${error.message}`);
  return (data ?? []).map((row) => toEvent(row as unknown as Row));
}

/** Un evento por su identificador, para la ficha. Null si no existe. */
export async function fetchEventById(id: string): Promise<CalendarEvent | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("economic_events")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`fetchEventById: ${error.message}`);
  return data ? toEvent(data as unknown as Row) : null;
}

/**
 * Las categorías que de verdad hay en la ventana que se está mirando.
 *
 * Se calculan de los datos en vez de listar las doce posibles: un filtro que
 * ofrece «Energía» y al pulsarlo no enseña nada es un filtro roto.
 */
export async function fetchCategoriesBetween(params: {
  from: Date;
  to: Date;
  minImportance?: EventImportance;
}): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase
    .from("economic_events")
    .select("category")
    .gte("occurs_at", params.from.toISOString())
    .lte("occurs_at", params.to.toISOString())
    .not("category", "is", null);

  if (params.minImportance !== undefined) query = query.gte("importance", params.minImportance);

  const { data, error } = await query;
  if (error) throw new Error(`fetchCategoriesBetween: ${error.message}`);

  return [...new Set((data ?? []).map((r) => (r as { category: string }).category))].sort();
}

/**
 * El próximo evento que merece que lo mires.
 *
 * Sólo de alto impacto: el objetivo es la frase «esto sale dentro de X», y
 * decirla de una subasta de letras a cuatro semanas enseña a ignorarla.
 */
export async function fetchNextKeyEvent(now = new Date()): Promise<CalendarEvent | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("economic_events")
    .select(COLUMNS)
    .gte("occurs_at", now.toISOString())
    .eq("importance", 1)
    .order("occurs_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`fetchNextKeyEvent: ${error.message}`);
  return data ? toEvent(data as unknown as Row) : null;
}

/**
 * Las veces anteriores que salió este mismo indicador.
 *
 * Es lo que convierte una previsión en algo que se puede juzgar: saber que se
 * espera un 0,3 % no dice nada hasta que ves que las tres veces pasadas salió
 * por encima de lo previsto. Se agrupa por `indicator` y no por `title`
 * porque el título corto cambia de forma entre publicaciones.
 */
export async function fetchIndicatorHistory(params: {
  indicator: string;
  before: Date;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("economic_events")
    .select(COLUMNS)
    .eq("indicator", params.indicator)
    .lt("occurs_at", params.before.toISOString())
    .not("actual", "is", null)
    .order("occurs_at", { ascending: false })
    .limit(params.limit ?? 4);

  if (error) throw new Error(`fetchIndicatorHistory: ${error.message}`);
  return (data ?? []).map((row) => toEvent(row as unknown as Row));
}
