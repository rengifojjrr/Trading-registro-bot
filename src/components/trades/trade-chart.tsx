"use client";

import { Maximize2, Minus, MousePointer2, Square, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRANULARITY_LABELS, GRANULARITY_ORDER, isGranularityViable } from "@/lib/analytics/chart-window";
import type { DrawingTool as PersistedDrawingTool } from "@/lib/chart-drawings";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { formatMoney } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { cn } from "@/lib/utils";

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

interface DrawingPoint {
  time: number; // unix seconds
  price: number;
}

export interface TradeChartDrawing {
  id: string;
  tool: PersistedDrawingTool;
  points: { price: number } | { p1: DrawingPoint; p2: DrawingPoint };
  color: string;
}

const CHART_HEIGHT = 360;
const DRAWING_COLOR = "#a78bfa"; // matches chart_drawings.color's DB default

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
  live: "hsl(215, 20%, 65%)", // --muted-foreground, for the "price right now" line
};

type ActiveTool = "CURSOR" | PersistedDrawingTool;

const TOOL_BUTTONS: { tool: ActiveTool; label: string; Icon: typeof MousePointer2 }[] = [
  { tool: "CURSOR", label: "Cursor", Icon: MousePointer2 },
  { tool: "HLINE", label: "Línea horizontal", Icon: Minus },
  { tool: "TRENDLINE", label: "Línea de tendencia", Icon: TrendingUp },
  { tool: "RECTANGLE", label: "Rectángulo", Icon: Square },
];

/**
 * Candlestick chart for the exact product/window a trade happened in, with
 * entry/exit markers -- built on TradingView's own open-source
 * lightweight-charts (self-hosted, no iframe) rather than embedding the
 * TradingView widget, since the widget can't reliably jump to a precise
 * historical window and likely has no matching symbol for this exact
 * futures contract anyway. Purely illustrative: never a source of truth for
 * P&L or any other figure shown elsewhere on the page.
 *
 * `initialCandles`/`initialGranularity` seed local state -- picking a
 * different granularity re-fetches the same fixed [windowStart, windowEnd]
 * window at that granularity via /api/coinbase/trade-candles rather than
 * recomputing the window, so the visible time range never jumps around.
 *
 * Basic markup tools (horizontal line / trend line / rectangle) persist to
 * chart_drawings and render on top of the candles: horizontal lines reuse
 * the same createPriceLine API as the entry/SL/TP lines below; trend lines
 * and rectangles are drawn on a separate absolutely-positioned <canvas>
 * overlay (lightweight-charts' own primitive/plugin API works too, but
 * needs its own fancy-canvas rendering target -- a plain overlay canvas,
 * redrawn from {time, price} on every pan/zoom/resize via the library's
 * own coordinate-conversion methods, is the simpler, equally-correct path
 * for a small, fixed set of shapes).
 */
export function TradeChart({
  tradeId,
  productId,
  direction,
  windowStart,
  windowEnd,
  initialCandles,
  initialGranularity,
  initialDrawings,
  entry,
  exit,
  isOpen = false,
  stopLoss = null,
  takeProfit = null,
}: {
  tradeId: string;
  productId: string;
  /** Drives which way the entry/exit markers point -- a SHORT entry is a sell, so an up arrow below the bar reads as the opposite of what happened. */
  direction: "LONG" | "SHORT";
  windowStart: number; // unix seconds
  windowEnd: number; // unix seconds
  initialCandles: TradeChartCandle[];
  initialGranularity: CoinbaseCandleGranularity;
  initialDrawings: TradeChartDrawing[];
  entry: TradeChartMarker;
  exit: TradeChartMarker | null;
  /** Only an open position has a meaningful "price right now" line to draw. */
  isOpen?: boolean;
  /** From journal_entries -- the trader's own planned level, not something Coinbase reports. Drawn as a dashed reference line when present. */
  stopLoss?: number | null;
  takeProfit?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestIdRef = useRef(0);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingPriceLinesRef = useRef<IPriceLine[]>([]);
  const hoverPointRef = useRef<DrawingPoint | null>(null);

  const [candles, setCandles] = useState(initialCandles);
  const [granularity, setGranularity] = useState(initialGranularity);
  const [isLoading, setIsLoading] = useState(false);
  const [drawings, setDrawings] = useState(initialDrawings);
  const [activeTool, setActiveTool] = useState<ActiveTool>("CURSOR");
  const [pendingPoint, setPendingPoint] = useState<DrawingPoint | null>(null);

  // Only polled for a still-open position; the hook is called
  // unconditionally (hooks can't be conditional) but its result is ignored
  // unless isOpen, and the live line effect below bails out otherwise.
  const { price: polledPrice } = useCurrentPrice(productId);
  const livePrice = isOpen ? polledPrice : null;

  function resetView() {
    chartRef.current?.timeScale().fitContent();
  }

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startPoint: DrawingPoint; original: TradeChartDrawing } | null>(null);

  async function handleGranularityChange(next: string) {
    const nextGranularity = next as CoinbaseCandleGranularity;
    setGranularity(nextGranularity);
    setIsLoading(true);
    const requestId = ++requestIdRef.current;

    try {
      const query = new URLSearchParams({
        productId,
        start: String(windowStart),
        end: String(windowEnd),
        granularity: nextGranularity,
      });
      const res = await fetch(`/api/coinbase/trade-candles?${query.toString()}`);
      const data = (await res.json()) as { candles: TradeChartCandle[] | null };
      if (requestId !== requestIdRef.current) return; // superseded by a newer selection
      if (data.candles) setCandles(data.candles);
    } catch {
      // Keep showing the last-known candles -- see the route's own
      // never-throws contract; this only guards the fetch() call itself.
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  function selectTool(tool: ActiveTool) {
    setActiveTool(tool);
    setPendingPoint(null);
  }

  async function saveDrawing(tool: PersistedDrawingTool, points: TradeChartDrawing["points"]) {
    try {
      const res = await fetch(`/api/trades/${tradeId}/drawings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, points }),
      });
      const result = (await res.json()) as { error: string | null; id: string | null };
      if (!result.id) {
        toast.error(result.error ?? "No se pudo guardar el dibujo.");
        return;
      }
      setDrawings((prev) => [...prev, { id: result.id!, tool, points, color: DRAWING_COLOR }]);
    } catch {
      toast.error("No se pudo guardar el dibujo.");
    }
  }

  /** Persists a drag. The optimistic local move already happened during the drag itself. */
  async function persistMovedDrawing(drawing: TradeChartDrawing) {
    try {
      const res = await fetch(`/api/trades/${tradeId}/drawings/${drawing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: drawing.tool, points: drawing.points }),
      });
      const result = (await res.json()) as { error: string | null };
      if (result.error) toast.error(result.error);
    } catch {
      toast.error("No se pudo mover el dibujo.");
    }
  }

  async function handleDeleteDrawing(id: string) {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/trades/${tradeId}/drawings/${id}`, { method: "DELETE" });
      const result = (await res.json()) as { error: string | null };
      if (result.error) toast.error(result.error);
    } catch {
      toast.error("No se pudo eliminar el dibujo.");
    }
  }

  // Escape backs out of whichever tool/pending point is active, same as
  // most chart-annotation tools -- without this, a stray first click on
  // TRENDLINE/RECTANGLE has no way to cancel short of reloading the page.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") selectTool("CURSOR");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Chart + candlestick series creation. Deliberately does NOT depend on
  // `drawings` -- adding/deleting a drawing shouldn't tear down and
  // recreate the whole chart, only the effect below re-renders them.
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

    // A LONG is entered by buying (arrow up, drawn under the bar) and exited
    // by selling; a SHORT is the exact mirror. Previously both directions
    // rendered the LONG pair, so every short trade's chart pointed the wrong
    // way.
    const isLong = direction === "LONG";
    const markers: SeriesMarker<Time>[] = [
      {
        time: entry.time as UTCTimestamp,
        position: isLong ? "belowBar" : "aboveBar",
        shape: isLong ? "arrowUp" : "arrowDown",
        color: THEME.entry,
        text: `Entrada ${formatMoney(entry.price)}`,
      },
    ];
    if (exit) {
      markers.push({
        time: exit.time as UTCTimestamp,
        position: isLong ? "aboveBar" : "belowBar",
        shape: isLong ? "arrowDown" : "arrowUp",
        color: THEME.exit,
        text: `Salida ${formatMoney(exit.price)}`,
      });
    }
    createSeriesMarkers(series, markers);

    // A solid line, not just the arrow marker -- extends across the whole
    // visible width so it's obvious at a glance whether later price action
    // (including the live edge, for a still-open trade) sits above or below
    // entry, not just where the fill happened.
    series.createPriceLine({
      price: entry.price,
      color: THEME.entry,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Entrada",
    });

    if (stopLoss !== null) {
      series.createPriceLine({
        price: stopLoss,
        color: THEME.down,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SL",
      });
    }
    if (takeProfit !== null) {
      series.createPriceLine({
        price: takeProfit,
        color: THEME.up,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TP",
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const first = entries[0];
      if (!first) return;
      chart.resize(first.contentRect.width, CHART_HEIGHT);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      drawingPriceLinesRef.current = [];
    };
    // entry/exit are compared by their primitive fields, not object identity --
    // page.tsx builds a new {time, price} literal on every server render, and
    // recreating the whole chart (and orphaning the click-drawing subscriptions
    // below, which don't re-run just because the chart did) on an identical-
    // but-new-reference entry/exit would silently break mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, direction, entry.time, entry.price, exit?.time, exit?.price, stopLoss, takeProfit]);

  // Live "price right now" line, only for a still-open position. Kept in
  // its own effect and updated in place via applyOptions rather than
  // recreating the chart: the price polls every few seconds, and tearing
  // the chart down that often would fight the drawing interaction below
  // and reset the user's pan/zoom on every tick.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !isOpen || livePrice === null) return;

    const line = series.createPriceLine({
      price: livePrice,
      color: THEME.live,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: "Ahora",
    });
    return () => {
      // The chart may already have been disposed (its own effect's cleanup
      // runs first on unmount), which makes removePriceLine throw.
      try {
        series.removePriceLine(line);
      } catch {
        /* chart already disposed */
      }
    };
  }, [isOpen, livePrice, candles]);

  // Drawing interaction (click-to-place) + rendering (HLINE price lines,
  // TRENDLINE/RECTANGLE overlay canvas). Re-subscribes whenever drawings,
  // the active tool, or a pending first click changes -- all infrequent,
  // so a fresh closure each time is simpler and safer than stale-closure-
  // prone refs for values a mouse handler needs to read.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!chart || !series || !canvas || !container) return;

    for (const line of drawingPriceLinesRef.current) series.removePriceLine(line);
    drawingPriceLinesRef.current = drawings
      .filter((d) => d.tool === "HLINE")
      .map((d) =>
        series.createPriceLine({
          price: (d.points as { price: number }).price,
          color: d.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        }),
      );

    function toPixel(p: DrawingPoint): { x: number; y: number } | null {
      const x = chart!.timeScale().timeToCoordinate(p.time as UTCTimestamp);
      const y = series!.priceToCoordinate(p.price);
      if (x === null || y === null) return null;
      return { x, y };
    }

    function redraw() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container!.clientWidth;
      const height = CHART_HEIGHT;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (const drawing of drawings) {
        if (drawing.tool === "HLINE") continue; // rendered via createPriceLine above
        const { p1, p2 } = drawing.points as { p1: DrawingPoint; p2: DrawingPoint };
        const a = toPixel(p1);
        const b = toPixel(p2);
        if (!a || !b) continue;
        drawShape(ctx, drawing.tool, a, b, drawing.color, false);
        if (drawing.id === selectedDrawingId) {
          // Endpoint handles, so it's obvious which shape is grabbed.
          ctx.fillStyle = drawing.color;
          for (const point of [a, b]) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (pendingPoint && hoverPointRef.current && activeTool !== "CURSOR" && activeTool !== "HLINE") {
        const a = toPixel(pendingPoint);
        const b = toPixel(hoverPointRef.current);
        if (a && b) drawShape(ctx, activeTool, a, b, DRAWING_COLOR, true);
      }
    }

    function handleClick(param: MouseEventParams<Time>) {
      if (activeTool === "CURSOR" || !param.point) return;
      const price = series!.coordinateToPrice(param.point.y);
      const time = chart!.timeScale().coordinateToTime(param.point.x);
      if (price === null || time === null) return;
      const point: DrawingPoint = { time: Number(time), price };

      if (activeTool === "HLINE") {
        void saveDrawing("HLINE", { price });
        selectTool("CURSOR");
        return;
      }

      if (!pendingPoint) {
        setPendingPoint(point);
        return;
      }
      void saveDrawing(activeTool, { p1: pendingPoint, p2: point });
      selectTool("CURSOR");
    }

    function handleCrosshairMove(param: MouseEventParams<Time>) {
      if (!param.point) {
        hoverPointRef.current = null;
      } else {
        const price = series!.coordinateToPrice(param.point.y);
        const time = chart!.timeScale().coordinateToTime(param.point.x);
        hoverPointRef.current = price !== null && time !== null ? { time: Number(time), price } : null;
      }
      if (pendingPoint) redraw();
    }

    /**
     * Drag-to-move for existing shapes. Runs on the container in the
     * capture phase so that, when the pointer actually lands on a drawing,
     * the event can be stopped before lightweight-charts starts panning the
     * chart -- otherwise grabbing a shape would scroll the chart instead.
     * Anywhere that isn't a drawing falls through untouched, so normal
     * pan/zoom still works everywhere else.
     */
    function handlePointerDown(event: PointerEvent) {
      if (activeTool !== "CURSOR") return;
      const rect = container!.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      // Topmost (most recently drawn) shape wins, matching what's painted.
      for (let i = drawings.length - 1; i >= 0; i--) {
        const drawing = drawings[i];
        let hit = false;
        if (drawing.tool === "HLINE") {
          const y = series!.priceToCoordinate((drawing.points as { price: number }).price);
          hit = y !== null && Math.abs(pointer.y - y) <= HIT_TOLERANCE_PX;
        } else {
          const { p1, p2 } = drawing.points as { p1: DrawingPoint; p2: DrawingPoint };
          const a = toPixel(p1);
          const b = toPixel(p2);
          hit = Boolean(a && b && hitsShape(drawing.tool, pointer, a, b));
        }
        if (!hit) continue;

        const price = series!.coordinateToPrice(pointer.y);
        const time = chart!.timeScale().coordinateToTime(pointer.x);
        if (price === null || time === null) return;

        event.preventDefault();
        event.stopPropagation();
        setSelectedDrawingId(drawing.id);
        dragRef.current = {
          id: drawing.id,
          startPoint: { time: Number(time), price },
          original: drawing,
        };
        return;
      }
      setSelectedDrawingId(null);
    }

    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = container!.getBoundingClientRect();
      const price = series!.coordinateToPrice(event.clientY - rect.top);
      const time = chart!.timeScale().coordinateToTime(event.clientX - rect.left);
      if (price === null || time === null) return;

      const moved = translateDrawing(
        drag.original,
        Number(time) - drag.startPoint.time,
        price - drag.startPoint.price,
      );
      setDrawings((prev) => prev.map((d) => (d.id === drag.id ? moved : d)));
    }

    function handlePointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      // Read the just-updated shape out of state rather than recomputing it.
      setDrawings((prev) => {
        const moved = prev.find((d) => d.id === drag.id);
        if (moved && moved !== drag.original) void persistMovedDrawing(moved);
        return prev;
      });
    }

    redraw();
    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw);
    container.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(redraw);
      container.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- candles isn't read here; re-running when it changes (chart re-init) is handled by chartRef/seriesRef being reassigned first.
  }, [drawings, activeTool, pendingPoint, selectedDrawingId]);

  if (candles.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay datos de velas disponibles de Coinbase para esta operación.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={granularity} onValueChange={handleGranularityChange}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANULARITY_ORDER.map((g) => {
                // The default window now spans at least a week of pre-entry
                // context, so a fine granularity like 1-minute would need far
                // more candles than Coinbase returns from a single request --
                // disable rather than let it silently fetch a truncated chart.
                const viable = isGranularityViable(windowEnd - windowStart, g);
                return (
                  <SelectItem key={g} value={g} disabled={!viable}>
                    {GRANULARITY_LABELS[g]}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
            {TOOL_BUTTONS.map(({ tool, label, Icon }) => (
              <button
                key={tool}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={activeTool === tool}
                onClick={() => selectTool(tool)}
                className={cn(
                  "flex size-7 items-center justify-center rounded transition-colors",
                  activeTool === tool
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Restablecer vista"
            aria-label="Restablecer vista"
            onClick={resetView}
            className="flex size-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="size-4" aria-hidden />
          </button>
        </div>
        {isLoading ? <span className="text-xs text-muted-foreground">Cargando…</span> : null}
      </div>
      {activeTool !== "CURSOR" ? (
        <p className="text-xs text-primary">
          {activeTool === "HLINE"
            ? "Haz clic en el gráfico para colocar la línea horizontal."
            : pendingPoint
              ? "Haz clic de nuevo para completar el dibujo (Esc para cancelar)."
              : "Haz clic para el primer punto (Esc para cancelar)."}
        </p>
      ) : null}
      <div className="relative">
        <div ref={containerRef} className="w-full" />
        {/* z-10: lightweight-charts' own internal canvases set explicit
            z-index (1/2) on themselves; since their non-positioned parent
            (containerRef's div) doesn't isolate a stacking context, those
            positive z-indexes compete directly with this canvas's siblings
            here -- z-index: auto always loses to an explicit positive value
            regardless of DOM order, so without this the overlay silently
            painted underneath the chart's own canvases. */}
        <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 z-10" />
      </div>
      <p className="text-xs text-muted-foreground">
        Velas de {GRANULARITY_LABELS[granularity]} · datos de Coinbase
        {drawings.length > 0 ? " · arrastra un dibujo para moverlo" : ""}
      </p>
      {drawings.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">Dibujos</p>
          {drawings.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{describeDrawing(d)}</span>
              <button
                type="button"
                aria-label="Eliminar dibujo"
                onClick={() => handleDeleteDrawing(d.id)}
                className="text-muted-foreground transition-colors hover:text-negative"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Pixel tolerance for grabbing a drawing -- generous enough for a fingertip, not so wide that shapes fight each other. */
const HIT_TOLERANCE_PX = 8;

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Projection of p onto the segment, clamped to its endpoints.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitsShape(
  tool: PersistedDrawingTool,
  pointer: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  if (tool === "TRENDLINE") return distanceToSegment(pointer, a, b) <= HIT_TOLERANCE_PX;
  if (tool === "RECTANGLE") {
    // Anywhere inside counts, so a rectangle is easy to grab rather than
    // requiring a precise hit on a 1.5px edge.
    const minX = Math.min(a.x, b.x) - HIT_TOLERANCE_PX;
    const maxX = Math.max(a.x, b.x) + HIT_TOLERANCE_PX;
    const minY = Math.min(a.y, b.y) - HIT_TOLERANCE_PX;
    const maxY = Math.max(a.y, b.y) + HIT_TOLERANCE_PX;
    return pointer.x >= minX && pointer.x <= maxX && pointer.y >= minY && pointer.y <= maxY;
  }
  return false;
}

/** Shifts every point of a drawing by a delta expressed in data space (time seconds / price), not pixels, so a shape keeps its shape across zoom levels. */
function translateDrawing(
  drawing: TradeChartDrawing,
  deltaTime: number,
  deltaPrice: number,
): TradeChartDrawing {
  if (drawing.tool === "HLINE") {
    const { price } = drawing.points as { price: number };
    return { ...drawing, points: { price: price + deltaPrice } };
  }
  const { p1, p2 } = drawing.points as { p1: DrawingPoint; p2: DrawingPoint };
  return {
    ...drawing,
    points: {
      p1: { time: p1.time + deltaTime, price: p1.price + deltaPrice },
      p2: { time: p2.time + deltaTime, price: p2.price + deltaPrice },
    },
  };
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  tool: PersistedDrawingTool,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  dashed: boolean,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(dashed ? [4, 4] : []);

  if (tool === "TRENDLINE") {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (tool === "RECTANGLE") {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (!dashed) {
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  }
  ctx.setLineDash([]);
}

function describeDrawing(d: TradeChartDrawing): string {
  if (d.tool === "HLINE") {
    return `Línea horizontal @ ${formatMoney((d.points as { price: number }).price)}`;
  }
  const { p1, p2 } = d.points as { p1: DrawingPoint; p2: DrawingPoint };
  const label = d.tool === "TRENDLINE" ? "Línea de tendencia" : "Rectángulo";
  return `${label}: ${formatMoney(p1.price)} → ${formatMoney(p2.price)}`;
}
