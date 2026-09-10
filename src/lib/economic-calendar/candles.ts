import "server-only";

import { GRANULARITY_SECONDS } from "@/lib/analytics/chart-window";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { serverEnv } from "@/lib/env";

import type { ReactionCandle } from "./market-reaction";

/**
 * Las velas de alrededor de una publicación.
 *
 * Usa el endpoint **público** de mercado de Coinbase, que no pide firma ni
 * clave. Es una decisión deliberada y no un atajo: el resto de la aplicación
 * necesita credenciales porque lee *tu* cuenta, pero el precio de Bitcoin del
 * 13 de agosto no es de nadie. Así, esta parte funciona aunque Coinbase no
 * esté configurado, y no gasta cuota de la clave privada en dibujar gráficos.
 *
 * Comprobado el 2026-09-09: devuelve velas de un minuto de fechas de hace más
 * de un año, tanto de `BTC-USD` como del contrato de futuros.
 *
 * Nunca lanza. Un gráfico es contexto, no una cifra de la que dependa nada;
 * si no se puede pintar, la ficha se lee igual.
 */

const ENDPOINT = "https://api.coinbase.com/api/v3/brokerage/market/products";

/** El mercado de referencia cuando el producto configurado no tiene velas. */
export const FALLBACK_PRODUCT = "BTC-USD";

/** Coinbase corta en 350 velas por petición. Se pide por debajo, con margen. */
export const MAX_CANDLES = 300;

interface RawCandle {
  start?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function mapCandles(raw: RawCandle[]): ReactionCandle[] {
  const out: ReactionCandle[] = [];
  for (const c of raw) {
    const time = num(c.start);
    const open = num(c.open);
    const high = num(c.high);
    const low = num(c.low);
    const close = num(c.close);
    // Una vela a la que le falte cualquier precio no se arregla poniéndole un
    // cero: se descarta, y el gráfico enseña el hueco que de verdad hay.
    if (time === null || open === null || high === null || low === null || close === null) continue;
    out.push({ time, open, high, low, close, volume: num(c.volume) ?? 0 });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Un tramo de velas de un producto.
 *
 * Recorta el final si el rango pedido daría más velas de las que Coinbase
 * devuelve de una vez: sin esto, la respuesta llegaría cortada por el lado que
 * decida el servidor y el gráfico enseñaría un hueco sin decir que lo hay.
 */
export async function fetchCandlesRange(params: {
  productId: string;
  from: Date;
  to: Date;
  granularity: CoinbaseCandleGranularity;
}): Promise<ReactionCandle[]> {
  const segundos = GRANULARITY_SECONDS[params.granularity];
  const desde = Math.floor(params.from.getTime() / 1000);
  const hastaPedido = Math.floor(params.to.getTime() / 1000);
  const hasta = Math.min(hastaPedido, desde + MAX_CANDLES * segundos);

  const url = new URL(`${ENDPOINT}/${encodeURIComponent(params.productId)}/candles`);
  url.searchParams.set("start", String(desde));
  url.searchParams.set("end", String(hasta));
  url.searchParams.set("granularity", params.granularity);

  // Las velas de una publicación pasada no cambian nunca, pero las de una de
  // hace diez minutos todavía sí. Una hora de caché sirve para las dos.
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`El histórico de velas respondió ${res.status}`);

  const body = (await res.json()) as { candles?: unknown };
  if (!Array.isArray(body.candles)) throw new Error("El histórico de velas devolvió algo que no se reconoce");
  return mapCandles(body.candles as RawCandle[]);
}

/**
 * El producto sobre el que se mide la reacción.
 *
 * El que operas, si está configurado: es el precio que de verdad te afecta, y
 * un futuro con vencimiento lejano cotiza muy por encima del contado -- 78.000
 * frente a 63.000 el mismo día de agosto -- así que enseñar el contado como si
 * fuera lo tuyo confundiría. Si ese producto no tiene velas de aquella fecha
 * (un contrato que aún no existía), se cae al contado y se dice cuál se usó.
 */
export function chartProductId(): string {
  return serverEnv().COINBASE_PRODUCT_ID ?? FALLBACK_PRODUCT;
}

/**
 * La ventana inicial de la ficha, en minutos alrededor de la publicación.
 *
 * Treinta antes y cuatro horas y media después caben en 300 velas de un
 * minuto y cubren el plazo más largo que se mide. A partir de ahí, desplazar
 * el gráfico pide más tramos por la ruta de velas.
 */
const ANTES_MIN = 30;
const DESPUES_MIN = 270;

export interface ReactionCandles {
  candles: ReactionCandle[];
  /** De qué producto son. Se dice en la pantalla: no es lo mismo el contrato que el contado. */
  productId: string;
}

export async function fetchReactionCandles(at: Date): Promise<ReactionCandles | null> {
  const from = new Date(at.getTime() - ANTES_MIN * 60_000);
  const to = new Date(at.getTime() + DESPUES_MIN * 60_000);

  for (const productId of [chartProductId(), FALLBACK_PRODUCT]) {
    try {
      const candles = await fetchCandlesRange({ productId, from, to, granularity: "ONE_MINUTE" });
      // Menos de un puñado de velas no da para medir nada: se prueba el
      // siguiente producto antes que enseñar un gráfico de tres barras.
      if (candles.length >= 10) return { candles, productId };
    } catch (error) {
      console.error(`[calendario] no se pudieron traer velas de ${productId}`, error);
    }
  }
  return null;
}
