"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { formatMoney } from "@/lib/format";

export interface TradeChartCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeChartMarker {
  time: number; // unix seconds
  price: number;
}

const CHART_HEIGHT = 360;

// Mirrors the tokens in src/app/globals.css -- lightweight-charts renders
// to <canvas>, which can't read CSS custom properties, so these are kept as
// literal values. The app has a single fixed dark theme (no light mode), so
// there's no runtime theme to react to; if globals.css's palette ever
// changes, update these too.
const THEME = {
  background: "hsl(222, 44%, 9%)", // --card
  text: "hsl(215, 20%, 65%)", // --muted-foreground
  grid: "hsl(217, 28%, 18%)", // --border
  up: "hsl(142, 71%, 45%)", // --positive
  down: "hsl(0, 72%, 51%)", // --negative
  entry: "hsl(199, 89%, 48%)", // --primary
  exit: "hsl(38, 92%, 50%)", // --warning
};

/**
 * Candlestick chart for the exact product/window a trade happened in, with
 * entry/exit markers -- built on TradingView's own open-source
 * lightweight-charts (self-hosted, no iframe) rather than embedding the
 * TradingView widget, since the widget can't reliably jump to a precise
 * historical window and likely has no matching symbol for this exact
 * futures contract anyway. Purely illustrative: never a source of truth for
 * P&L or any other figure shown elsewhere on the page.
 */
export function TradeChart({
  candles,
  granularityLabel,
  entry,
  exit,
}: {
  candles: TradeChartCandle[];
  granularityLabel: string;
  entry: TradeChartMarker;
  exit: TradeChartMarker | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: THEME.background },
        textColor: THEME.text,
      },
      grid: {
        vertLines: { color: THEME.grid },
        horzLines: { color: THEME.grid },
      },
      rightPriceScale: { borderColor: THEME.grid },
      timeScale: { borderColor: THEME.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      // Explicit rather than the library's default (the visiting browser's
      // own navigator.language) -- matches the hardcoded "en-US" already
      // used throughout lib/format.ts, and avoids depending on every
      // visitor's browser reporting a well-formed locale tag.
      localization: { locale: "en-US" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: THEME.up,
      downColor: THEME.down,
      borderUpColor: THEME.up,
      borderDownColor: THEME.down,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
    });

    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const markers: SeriesMarker<Time>[] = [
      {
        time: entry.time as UTCTimestamp,
        position: "belowBar",
        shape: "arrowUp",
        color: THEME.entry,
        text: `Entrada ${formatMoney(entry.price)}`,
      },
    ];
    if (exit) {
      markers.push({
        time: exit.time as UTCTimestamp,
        position: "aboveBar",
        shape: "arrowDown",
        color: THEME.exit,
        text: `Salida ${formatMoney(exit.price)}`,
      });
    }
    createSeriesMarkers(series, markers);

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      const first = entries[0];
      if (!first) return;
      chart.resize(first.contentRect.width, CHART_HEIGHT);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, entry, exit]);

  if (candles.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay datos de velas disponibles de Coinbase para esta operación.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="w-full" />
      <p className="text-xs text-muted-foreground">Velas de {granularityLabel} · datos de Coinbase</p>
    </div>
  );
}
