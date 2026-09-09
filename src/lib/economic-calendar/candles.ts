import "server-only";

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
const FALLBACK_PRODUCT = "BTC-USD";

/**
 * La ventana que se trae, en minutos alrededor de la publicación.
 *
 * Coinbase corta en 350 velas por petición, así que con velas de un minuto el
 * techo está en 350 minutos. Treinta antes y cuatro horas y media después son
 * 300: cubre el plazo más largo que se mide (cuatro horas) con margen para que
 * la última vela no caiga justo en el borde, y deja sitio por si algún día se
 * añade un plazo mayor sin tener que paginar.
 */
const ANTES_MIN = 30;
const DESPUES_MIN = 270;

export interface ReactionCandles {
  candles: ReactionCandle[];
  /** De qué producto son. Se dice en la pantalla: no es lo mismo el contrato que el contado. */
  productId: string;
}

interface RawCandle {
  start?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function mapCandles(raw: RawCandle[]): ReactionCandle[] {
  return raw
    .map((c) => {
      const time = num(c.start);
      const open = num(c.open);
      const high = num(c.high);
      const low = num(c.low);
      const close = num(c.close);
      if (time === null || open === null || high === null || low === null || close === null) return null;
      return { time, open, high, low, close };
    })
    .filter((c): c is ReactionCandle => c !== null)
    .sort((a, b) => a.time - b.time);
}

async function pedir(productId: string, from: Date, to: Date): Promise<ReactionCandle[]> {
  const url = new URL(`${ENDPOINT}/${encodeURIComponent(productId)}/candles`);
  url.searchParams.set("start", String(Math.floor(from.getTime() / 1000)));
  url.searchParams.set("end", String(Math.floor(to.getTime() / 1000)));
  url.searchParams.set("granularity", "ONE_MINUTE");

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

export async function fetchReactionCandles(at: Date): Promise<ReactionCandles | null> {
  const from = new Date(at.getTime() - ANTES_MIN * 60_000);
  const to = new Date(at.getTime() + DESPUES_MIN * 60_000);

  for (const productId of [chartProductId(), FALLBACK_PRODUCT]) {
    try {
      const candles = await pedir(productId, from, to);
      // Menos de un puñado de velas no da para medir nada: se prueba el
      // siguiente producto antes que enseñar un gráfico de tres barras.
      if (candles.length >= 10) return { candles, productId };
    } catch (error) {
      console.error(`[calendario] no se pudieron traer velas de ${productId}`, error);
    }
  }
  return null;
}
