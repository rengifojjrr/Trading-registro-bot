"use client";

import { Grafico } from "@/components/charts/grafico";
import type {
  TradeChartCandle,
  TradeChartDrawing,
  TradeChartFill,
  TradeChartMarker,
} from "@/components/charts/grafico";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";

export type {
  TradeChartCandle,
  TradeChartDrawing,
  TradeChartFill,
  TradeChartMarker,
} from "@/components/charts/grafico";

/**
 * El gráfico de **una operación**.
 *
 * Es una envoltura de tres líneas sobre `charts/grafico.tsx`, que es el mismo
 * gráfico que usa una publicación macro. Lo único que pone aquí es de quién son
 * los dibujos y qué se marca encima de las velas: dónde entraste, dónde
 * saliste y cuál era tu plan.
 *
 * Existe en vez de montar `Grafico` directamente en la ficha para que la página
 * no tenga que saber nada de fuentes ni de dueños: pide el gráfico de una
 * operación y le dan el gráfico de una operación.
 */
export function TradeChart({
  tradeId,
  productId,
  direction,
  openedAtUnix,
  closedAtUnix,
  initialCandles,
  initialGranularity,
  initialDrawings,
  entry,
  exit,
  fills,
  isOpen = false,
  stopLoss = null,
  takeProfit = null,
}: {
  tradeId: string;
  productId: string;
  direction: "LONG" | "SHORT";
  /** Los extremos de la operación: deciden qué temporalidades la caben entera. */
  openedAtUnix: number;
  closedAtUnix: number;
  initialCandles: TradeChartCandle[];
  initialGranularity: CoinbaseCandleGranularity;
  initialDrawings: TradeChartDrawing[];
  entry: TradeChartMarker;
  exit: TradeChartMarker | null;
  fills?: TradeChartFill[];
  isOpen?: boolean;
  stopLoss?: number | null;
  takeProfit?: number | null;
}) {
  return (
    <Grafico
      fuente={{ tipo: "operacion", id: tradeId, desde: openedAtUnix, hasta: closedAtUnix }}
      productId={productId}
      initialCandles={initialCandles}
      initialGranularity={initialGranularity}
      initialDrawings={initialDrawings}
      operacion={{ direction, entry, exit, fills, isOpen, stopLoss, takeProfit }}
    />
  );
}
