import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { Tema } from "./temas";

/**
 * Lo que lee la pantalla de titulares.
 *
 * Siempre de la tabla, nunca de la fuente: una pantalla que depende de un
 * endpoint sin documentar es una pantalla que un día está en blanco.
 */

export interface NewsItem {
  id: string;
  publishedAt: string;
  title: string;
  provider: string | null;
  url: string | null;
  summary: string | null;
  topics: string[];
  /** Dónde acabó el precio una hora después, en %. Null si no se pudo medir. */
  movePct1h: number | null;
  /** Cuánto llegó a alejarse dentro de esa hora, en %. */
  maxMovePct1h: number | null;
  measuredAt: string | null;
}

const COLUMNAS =
  "id, published_at, title, provider, url, summary, topics, move_pct_1h, max_move_pct_1h, measured_at";

interface FilaTitular {
  id: string;
  published_at: string;
  title: string;
  provider: string | null;
  url: string | null;
  summary: string | null;
  topics: string[] | null;
  move_pct_1h: string | number | null;
  max_move_pct_1h: string | number | null;
  measured_at: string | null;
}

/** Postgres devuelve `numeric` como cadena para no perder precisión. */
function numero(valor: string | number | null): number | null {
  if (valor === null) return null;
  const n = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(n) ? n : null;
}

function mapear(fila: FilaTitular): NewsItem {
  return {
    id: fila.id,
    publishedAt: fila.published_at,
    title: fila.title,
    provider: fila.provider,
    url: fila.url,
    summary: fila.summary,
    topics: fila.topics ?? [],
    movePct1h: numero(fila.move_pct_1h),
    maxMovePct1h: numero(fila.max_move_pct_1h),
    measuredAt: fila.measured_at,
  };
}

export async function fetchNews(params: {
  /** Cuántos días hacia atrás. */
  days?: number;
  limit?: number;
  tema?: Tema | null;
  /**
   * Sólo los que movieron el precio al menos esto, en % absoluto.
   *
   * Es el filtro que de verdad hace falta: veinticinco titulares al día no se
   * leen, y «los tres que movieron más de medio punto» sí.
   */
  minMovimiento?: number | null;
} = {}): Promise<NewsItem[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - (params.days ?? 7) * 24 * 60 * 60 * 1000).toISOString();

  let consulta = supabase
    .from("market_news")
    .select(COLUMNAS)
    .gte("published_at", desde)
    .order("published_at", { ascending: false })
    .limit(params.limit ?? 60);

  if (params.tema) consulta = consulta.contains("topics", [params.tema]);

  const { data, error } = await consulta;
  if (error || !data) return [];

  const items = (data as FilaTitular[]).map(mapear);
  if (params.minMovimiento === null || params.minMovimiento === undefined) return items;

  const minimo = params.minMovimiento;
  return items.filter((i) => i.maxMovePct1h !== null && Math.abs(i.maxMovePct1h) >= minimo);
}

export async function fetchNewsById(id: string): Promise<NewsItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("market_news").select(COLUMNAS).eq("id", id).maybeSingle();
  return data ? mapear(data as FilaTitular) : null;
}

/**
 * Los titulares que más movieron el precio en una ventana.
 *
 * Ordenados por el movimiento medido y no por la hora: la pregunta que
 * responde esta lista es «qué pasó ayer», y la respuesta no es el último
 * titular sino el que dejó marca.
 */
export async function fetchNewsQueMovieron(params: {
  days?: number;
  limit?: number;
} = {}): Promise<NewsItem[]> {
  const items = await fetchNews({ days: params.days ?? 3, limit: 200 });
  return items
    .filter((i) => i.maxMovePct1h !== null)
    .sort((a, b) => Math.abs(b.maxMovePct1h ?? 0) - Math.abs(a.maxMovePct1h ?? 0))
    .slice(0, params.limit ?? 5);
}
