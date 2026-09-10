import { NextResponse } from "next/server";

import { GRANULARITY_LABELS, GRANULARITY_SECONDS } from "@/lib/analytics/chart-window";
import { requireUser } from "@/lib/auth/require-user";
import { fetchCandlesRange, FALLBACK_PRODUCT, MAX_CANDLES } from "@/lib/economic-calendar/candles";
import { chartProductId } from "@/lib/economic-calendar/candles";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Velas de un tramo, para el gráfico de la reacción a una noticia.
 *
 * A diferencia de la ruta de velas de una operación, ésta sí acepta un rango
 * libre: el gráfico de una noticia se desplaza y se amplía, así que el cliente
 * pide lo que le falta al llegar al borde. Lo que no acepta es un rango
 * cualquiera de tamaño cualquiera -- el número de velas se acota abajo, que es
 * lo que impide convertir esto en un aspirador del histórico entero.
 *
 * No usa credenciales de Coinbase: lee el endpoint público de mercado. El
 * precio de Bitcoin del 13 de agosto no es de nadie.
 */

const VALID_GRANULARITIES = new Set(Object.keys(GRANULARITY_LABELS));

function esGranularidad(value: string): value is CoinbaseCandleGranularity {
  return VALID_GRANULARITIES.has(value);
}

export async function GET(request: Request) {
  const user = await requireUser();

  // Acota lo que una cuenta puede tirar por aquí por muchas pestañas que
  // tenga abiertas. Ver lib/rate-limit.ts.
  const limit = checkRateLimit(`calendar-candles:${user.id}`, { capacity: 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const granularity = url.searchParams.get("granularity") ?? "";
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  const pedido = url.searchParams.get("productId");

  if (!esGranularidad(granularity) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return NextResponse.json({ candles: null }, { status: 200 });
  }

  // El producto no lo elige el cliente entre cualquiera: o el que se opera o
  // el de referencia. Sin esto, la ruta sería un proxy abierto al catálogo
  // entero de Coinbase a costa de esta aplicación.
  const productId = pedido === FALLBACK_PRODUCT ? FALLBACK_PRODUCT : chartProductId();

  // El rango se recorta al máximo de velas por petición. Se recorta por el
  // final y no se rechaza: pedir de más es lo normal cuando el cliente
  // arrastra rápido, y devolver menos es una respuesta correcta.
  const segundos = GRANULARITY_SECONDS[granularity];
  const fin = Math.min(end, start + MAX_CANDLES * segundos);

  try {
    const candles = await fetchCandlesRange({
      productId,
      from: new Date(start * 1000),
      to: new Date(fin * 1000),
      granularity,
    });
    return NextResponse.json({ candles, productId });
  } catch (error) {
    console.error("[calendario] no se pudieron traer velas del tramo", error);
    // Un gráfico es contexto, no una cifra: si Coinbase no contesta, el
    // cliente se queda con lo que ya tenía dibujado.
    return NextResponse.json({ candles: null }, { status: 200 });
  }
}
