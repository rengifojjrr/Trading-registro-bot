"use client";

import {
  BarChart3,
  Camera,
  Eye,
  EyeOff,
  Maximize2,
  Minus,
  MousePointer2,
  MoveVertical,
  Pause,
  Play,
  Ruler,
  Scaling,
  Square,
  Trash2,
  TrendingUp,
  Undo2,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  PriceScaleMode,
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
import { coversWholeTrade, GRANULARITY_LABELS, GRANULARITY_ORDER } from "@/lib/analytics/chart-window";
import { FIB_LEVELS, type DrawingTool as PersistedDrawingTool } from "@/lib/chart-drawings";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { uploadTradeScreenshot } from "@/app/(dashboard)/trades/[tradeId]/actions";
import { formatMoney } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { cn } from "@/lib/utils";

export interface TradeChartCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  points: { price: number } | { time: number } | { p1: DrawingPoint; p2: DrawingPoint };
  color: string;
}

const CHART_HEIGHT = 360;
/** How often an open position's candles are re-fetched. One request a minute is nothing against Coinbase's limits, and it's the granularity at which new candles actually appear. */
const CANDLE_REFRESH_MS = 60_000;
/** One candle per second: fast enough not to be boring, slow enough to read. */
const REPLAY_STEP_MS = 1000;
const DRAWING_COLOR = "#a78bfa"; // matches chart_drawings.color's DB default
const MEASURE_COLOR = "#38bdf8";

/**
 * lightweight-charts renders to <canvas>, which cannot read CSS custom
 * properties -- so the palette is resolved from the live computed styles
 * instead of being duplicated as literals. That matters now that the app
 * has a light theme: hardcoded dark values would leave the chart a black
 * rectangle on a white page, with P&L colours that no longer pass contrast.
 *
 * The fallbacks are the dark palette, used only if a token is missing (an
 * older cached stylesheet, or a test environment with no real CSS).
 */
const THEME_FALLBACK = {
  background: "hsl(222, 44%, 9%)",
  text: "hsl(215, 20%, 65%)",
  grid: "hsl(217, 28%, 18%)",
  up: "hsl(142, 71%, 45%)",
  down: "hsl(0, 72%, 51%)",
  entry: "hsl(199, 89%, 48%)",
  exit: "hsl(38, 92%, 50%)",
  live: "hsl(215, 20%, 65%)",
};

type ChartTheme = typeof THEME_FALLBACK;

/**
 * A translucent variant of a resolved palette token.
 *
 * The volume bars have to sit behind the candles without competing with
 * them, and they have to follow the theme -- a hardcoded green stays green
 * on a white background even when the P&L colours darken for contrast.
 * Tokens arrive as whatever form globals.css declares (hex today, hsl in
 * the fallbacks), so both are handled; anything unrecognised is returned
 * unchanged, which merely loses the transparency rather than the bar.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const fn = color.trim().match(/^(hsl|rgb)\((.+)\)$/i);
  if (fn) return `${fn[1].toLowerCase()}a(${fn[2]}, ${alpha})`;
  return color;
}

function resolveTheme(): ChartTheme {
  if (typeof window === "undefined") return THEME_FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;
  return {
    background: read("--card", THEME_FALLBACK.background),
    text: read("--muted-foreground", THEME_FALLBACK.text),
    grid: read("--border", THEME_FALLBACK.grid),
    up: read("--positive", THEME_FALLBACK.up),
    down: read("--negative", THEME_FALLBACK.down),
    entry: read("--primary", THEME_FALLBACK.entry),
    exit: read("--warning", THEME_FALLBACK.exit),
    live: read("--muted-foreground", THEME_FALLBACK.live),
  };
}

/** Resolved once per chart creation; the effect re-runs when the theme attribute changes. */
let THEME: ChartTheme = THEME_FALLBACK;

/** MEASURE never persists -- see the migration note; it answers a question you're asking right now. */
type ActiveTool = "CURSOR" | "MEASURE" | PersistedDrawingTool;

const TOOL_BUTTONS: { tool: ActiveTool; label: string; Icon: typeof MousePointer2 }[] = [
  { tool: "CURSOR", label: "Cursor", Icon: MousePointer2 },
  { tool: "HLINE", label: "Línea horizontal (precio)", Icon: Minus },
  { tool: "VLINE", label: "Línea vertical (momento)", Icon: MoveVertical },
  { tool: "TRENDLINE", label: "Línea de tendencia", Icon: TrendingUp },
  { tool: "RECTANGLE", label: "Rectángulo", Icon: Square },
  { tool: "FIB", label: "Retroceso de Fibonacci", Icon: Waves },
  { tool: "MEASURE", label: "Medir movimiento (no se guarda)", Icon: Ruler },
];

/** Tools that need two clicks; the rest resolve on the first one. */
const TWO_POINT_TOOLS: ActiveTool[] = ["TRENDLINE", "RECTANGLE", "FIB", "MEASURE"];

interface Measurement {
  p1: DrawingPoint;
  p2: DrawingPoint;
}

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
  openedAtUnix,
  closedAtUnix,
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
  /** The trade's own bounds -- what decides which granularities can show it. */
  openedAtUnix: number;
  closedAtUnix: number;
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
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [showVolume, setShowVolume] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [showDrawings, setShowDrawings] = useState(true);
  const legendRef = useRef<HTMLDivElement>(null);

  // Every timeframe is selectable. This only tracks whether the chosen one
  // fits the whole trade, so a zoomed-in view can say the entry is off
  // screen instead of leaving the user hunting for a missing marker.
  const showsWholeTrade = useMemo(
    () => coversWholeTrade(new Date(openedAtUnix * 1000), new Date(closedAtUnix * 1000), granularity),
    [openedAtUnix, closedAtUnix, granularity],
  );

  // Only polled for a still-open position; the hook is called
  // unconditionally (hooks can't be conditional) but its result is ignored
  // unless isOpen, and the live line effect below bails out otherwise.
  const { price: polledPrice } = useCurrentPrice(productId);
  const livePrice = isOpen ? polledPrice : null;

  function resetView() {
    chartRef.current?.timeScale().fitContent();
  }

  const [capturing, setCapturing] = useState(false);

  /**
   * Replay: how many candles are revealed. null means replay is off and the
   * whole trade is visible, which is the normal state.
   *
   * The point of a replay is to practise reading the chart without already
   * knowing how it ended, so while it runs the exit marker and the exit
   * price line are hidden -- leaving them would hand over the answer before
   * the question. `replaying` (a boolean) rather than the index goes into
   * the chart-creation dependencies, so the chart is rebuilt when replay
   * starts and stops, not once per step.
   */
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const replaying = replayIndex !== null;

  const visibleCandles = useMemo(
    () => (replayIndex === null ? candles : candles.slice(0, replayIndex + 1)),
    [candles, replayIndex],
  );

  /**
   * Saves the chart exactly as it looks right now into the trade's
   * screenshots.
   *
   * Capturing on the client rather than rendering the chart server-side:
   * the interesting image is the one with the user's own drawings,
   * timeframe and zoom, and that state only exists in this browser. A
   * server-side render would have to reproduce all of it and would still
   * miss what the user was actually looking at.
   *
   * takeScreenshot() gives back the composed candles, but the markup
   * overlay is a separate canvas stacked on top, so the two are flattened
   * here -- otherwise the saved image would be missing precisely the
   * annotations that made it worth saving.
   */
  async function captureChart() {
    const chart = chartRef.current;
    if (!chart || capturing) return;

    setCapturing(true);
    try {
      const base = chart.takeScreenshot();
      const flat = document.createElement("canvas");
      flat.width = base.width;
      flat.height = base.height;
      const ctx = flat.getContext("2d");
      if (!ctx) throw new Error("sin contexto 2d");
      ctx.drawImage(base, 0, 0);

      const overlay = overlayCanvasRef.current;
      if (overlay && showDrawings) {
        ctx.drawImage(overlay, 0, 0, flat.width, flat.height);
      }

      const blob = await new Promise<Blob | null>((resolve) => flat.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("sin imagen");

      const formData = new FormData();
      formData.set("tradeId", tradeId);
      formData.set("file", new File([blob], "grafico.png", { type: "image/png" }));
      formData.set("caption", `Gráfico ${GRANULARITY_LABELS[granularity]}`);
      // An open position's chart is still a "before" view -- the outcome
      // hasn't happened yet. A closed one is "after".
      formData.set("phase", isOpen ? "BEFORE" : "AFTER");

      const result = await uploadTradeScreenshot({ error: null, success: false }, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Gráfico guardado en las capturas de la operación.");
      }
    } catch {
      toast.error("No se pudo guardar la imagen del gráfico.");
    } finally {
      setCapturing(false);
    }
  }

  /**
   * Advances the replay while it is playing.
   *
   * Stops on its own at the last candle rather than looping: a replay that
   * silently restarts makes it impossible to tell "the end" from "the
   * beginning again".
   */
  useEffect(() => {
    if (!playing || replayIndex === null) return;
    const id = setInterval(() => {
      setReplayIndex((current) => {
        if (current === null) return current;
        if (current >= candles.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, REPLAY_STEP_MS);
    return () => clearInterval(id);
  }, [playing, replayIndex, candles.length]);

  // Bumped whenever the theme class on <html> changes, so the chart is
  // rebuilt with the new palette. A canvas can't inherit CSS the way the
  // rest of the UI does, so switching to light mode would otherwise leave a
  // black rectangle in the middle of a white page.
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startPoint: DrawingPoint; original: TradeChartDrawing } | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // Read by the crosshair legend and by the chart-creation effect, neither
  // of which should re-run just because a candle ticked.
  const candlesRef = useRef(candles);
  // fitContent() belongs on a new chart or a new timeframe, never on a
  // routine refresh -- doing it every minute would yank the view back while
  // the user is zoomed in.
  const fittedGranularityRef = useRef<string | null>(null);

  /**
   * Fetches the candle set for a granularity. Shared by the timeframe
   * selector and the background refresh so both go through one path.
   * `silent` keeps the background refresh from flashing a spinner or
   * complaining about a blip -- it'll simply try again a minute later.
   */
  async function loadCandles(nextGranularity: CoinbaseCandleGranularity, silent = false) {
    if (!silent) setIsLoading(true);
    const requestId = ++requestIdRef.current;

    try {
      // Only the trade and the granularity: the route derives the window
      // from the trade's own timestamps, so a finer candle zooms in instead
      // of overrunning a fixed window's candle budget.
      const query = new URLSearchParams({ tradeId, granularity: nextGranularity });
      const res = await fetch(`/api/coinbase/trade-candles?${query.toString()}`);
      const data = (await res.json()) as { candles: TradeChartCandle[] | null };
      if (requestId !== requestIdRef.current) return; // superseded by a newer request
      if (data.candles && data.candles.length > 0) {
        setCandles(data.candles);
      } else if (!silent) {
        // Say so rather than leaving the previous timeframe's candles on
        // screen under the new label, which would misrepresent the chart.
        toast.error("Coinbase no devolvió velas para ese intervalo.");
      }
    } catch {
      if (!silent) toast.error("No se pudieron cargar las velas.");
    } finally {
      if (requestId === requestIdRef.current && !silent) setIsLoading(false);
    }
  }

  async function handleGranularityChange(next: string) {
    const nextGranularity = next as CoinbaseCandleGranularity;
    setGranularity(nextGranularity);
    await loadCandles(nextGranularity);
  }

  function selectTool(tool: ActiveTool) {
    setActiveTool(tool);
    setPendingPoint(null);
    if (tool !== "MEASURE") setMeasurement(null);
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

  async function handleClearDrawings() {
    const previous = drawings;
    setDrawings([]);
    setSelectedDrawingId(null);
    const results = await Promise.all(
      previous.map((d) =>
        fetch(`/api/trades/${tradeId}/drawings/${d.id}`, { method: "DELETE" })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    // Put back whatever genuinely failed to delete, so the list on screen
    // keeps matching what's actually stored.
    const failed = previous.filter((_, i) => !results[i]);
    if (failed.length > 0) {
      setDrawings(failed);
      toast.error(`No se pudieron eliminar ${failed.length} dibujo(s).`);
    }
  }

  // Declared before every chart effect on purpose: effects run in
  // declaration order, so the crosshair legend's closure always reads the
  // candles from this same commit rather than the previous one.
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

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
    if (!container || candlesRef.current.length === 0) return;

    THEME = resolveTheme();

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
      rightPriceScale: {
        borderColor: THEME.grid,
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
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

    // Data itself is pushed by the effect below, not here: candles refresh
    // while a position is open, and recreating the whole chart on every
    // refresh would throw away the user's pan/zoom (and their drawings'
    // event handlers) once a minute.
    if (showVolume) {
      // Its own price scale, pinned to the bottom fifth, so volume never
      // competes with price for vertical room.
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    } else {
      volumeSeriesRef.current = null;
    }

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
    if (exit && !replaying) {
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

    // The exit deserves the same full-width line as the entry: the arrow
    // marker says where the fill happened, but only a line lets you see at a
    // glance which later candles traded above or below where you got out.
    // Hidden during a replay for the same reason the exit marker is.
    if (exit && !replaying) {
      series.createPriceLine({
        price: exit.price,
        color: THEME.exit,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "Salida",
      });
    }

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

    // OHLC readout. Written straight to the DOM instead of through state:
    // this fires on every pointer move, and a re-render per mouse pixel
    // would make the whole chart stutter.
    function updateLegend(param: MouseEventParams<Time>) {
      const node = legendRef.current;
      if (!node) return;
      // Read through the ref so the readout follows refreshed candles
      // without this closure (and the whole chart) being rebuilt.
      const current = candlesRef.current;
      const hovered = param.time ? current.find((c) => c.time === Number(param.time)) : undefined;
      const shown = hovered ?? current[current.length - 1];
      if (!shown) return;
      const change = shown.close - shown.open;
      const changePct = shown.open === 0 ? 0 : (change / shown.open) * 100;
      const sign = change >= 0 ? "+" : "";
      node.textContent =
        `A ${formatMoney(shown.open)}  M ${formatMoney(shown.high)}  ` +
        `m ${formatMoney(shown.low)}  C ${formatMoney(shown.close)}  ` +
        `${sign}${changePct.toFixed(2)}%  Vol ${shown.volume.toLocaleString("en-US")}`;
      node.style.color = change >= 0 ? THEME.up : THEME.down;
    }
    updateLegend({} as MouseEventParams<Time>);
    chart.subscribeCrosshairMove(updateLegend);

    chartRef.current = chart;
    seriesRef.current = series;
    // A brand new chart has no data yet; the data effect below fills it and
    // frames it.
    fittedGranularityRef.current = null;

    const resizeObserver = new ResizeObserver((entries) => {
      const first = entries[0];
      if (!first) return;
      chart.resize(first.contentRect.width, CHART_HEIGHT);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(updateLegend);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      drawingPriceLinesRef.current = [];
    };
    // entry/exit are compared by their primitive fields, not object identity --
    // page.tsx builds a new {time, price} literal on every server render, and
    // recreating the whole chart (and orphaning the click-drawing subscriptions
    // below, which don't re-run just because the chart did) on an identical-
    // but-new-reference entry/exit would silently break mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    direction,
    entry.time,
    entry.price,
    exit?.time,
    exit?.price,
    stopLoss,
    takeProfit,
    showVolume,
    logScale,
    themeVersion,
    replaying,
  ]);

  // Candle data, pushed into the existing series. Separate from creation
  // above so a refresh replaces the data without rebuilding the chart --
  // that's what keeps pan/zoom and drawings intact while a position is open.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || visibleCandles.length === 0) return;

    series.setData(
      visibleCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeSeriesRef.current?.setData(
      visibleCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: withAlpha(c.close >= c.open ? THEME.up : THEME.down, 0.5),
      })),
    );

    // Frame the data on a new chart or a new timeframe only. A background
    // refresh must leave the view exactly where the user put it.
    // Keyed on replay too: entering or leaving a replay changes how much
    // of the trade is on screen, so the view has to be reframed. A routine
    // refresh still must not, which is what the key comparison protects.
    const fitKey = `${granularity}:${replaying}`;
    if (fittedGranularityRef.current !== fitKey) {
      chartRef.current?.timeScale().fitContent();
      fittedGranularityRef.current = fitKey;
    }
    // themeVersion: the volume bars carry their colour per-point, so they
    // have to be rewritten when the palette changes -- unlike the candle
    // series, whose colours live in its options.
  }, [visibleCandles, granularity, showVolume, logScale, themeVersion, replaying]);

  /**
   * Keeps an open position's chart current.
   *
   * Without this the candles were fetched once, when the page was rendered,
   * and never again -- so the chart's right edge froze at whatever the price
   * was on page load while the "Ahora" line kept moving. The two then showed
   * different prices for the same instant, which is what looked broken.
   */
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => void loadCandles(granularity, true), CANDLE_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCandles is stable enough; only the granularity being polled matters.
  }, [isOpen, granularity, tradeId]);

  /**
   * Extends the newest candle with the live price between refreshes, so the
   * right edge tracks the market continuously instead of stepping once a
   * minute. Costs nothing extra: it reuses the price already being polled
   * for the "Ahora" line.
   */
  useEffect(() => {
    const series = seriesRef.current;
    const last = candles[candles.length - 1];
    if (!series || !isOpen || livePrice === null || !last) return;

    series.update({
      time: last.time as UTCTimestamp,
      open: last.open,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    });
  }, [isOpen, livePrice, candles]);

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

    const visibleDrawings = showDrawings ? drawings : [];

    for (const line of drawingPriceLinesRef.current) series.removePriceLine(line);
    drawingPriceLinesRef.current = visibleDrawings
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

      for (const drawing of visibleDrawings) {
        if (drawing.tool === "HLINE") continue; // rendered via createPriceLine above

        if (drawing.tool === "VLINE") {
          const x = chart!.timeScale().timeToCoordinate(
            (drawing.points as { time: number }).time as UTCTimestamp,
          );
          if (x !== null) {
            drawVerticalLine(ctx, x, height, drawing.color);
            if (drawing.id === selectedDrawingId) {
              ctx.fillStyle = drawing.color;
              ctx.beginPath();
              ctx.arc(x, height / 2, 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          continue;
        }

        const { p1, p2 } = drawing.points as { p1: DrawingPoint; p2: DrawingPoint };
        const a = toPixel(p1);
        const b = toPixel(p2);
        if (!a || !b) continue;

        if (drawing.tool === "FIB") {
          drawFib(ctx, a, b, p1.price, p2.price, drawing.color, false);
        } else {
          drawShape(ctx, drawing.tool, a, b, drawing.color, false);
        }

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

      // Preview of the shape being placed, between the first click and the second.
      const hover = hoverPointRef.current;
      if (pendingPoint && hover && TWO_POINT_TOOLS.includes(activeTool)) {
        const a = toPixel(pendingPoint);
        const b = toPixel(hover);
        if (a && b) {
          if (activeTool === "FIB") {
            drawFib(ctx, a, b, pendingPoint.price, hover.price, DRAWING_COLOR, true);
          } else if (activeTool === "MEASURE") {
            drawMeasure(ctx, a, b, pendingPoint, hover);
          } else {
            drawShape(ctx, activeTool as PersistedDrawingTool, a, b, DRAWING_COLOR, true);
          }
        }
      }

      if (measurement) {
        const a = toPixel(measurement.p1);
        const b = toPixel(measurement.p2);
        if (a && b) drawMeasure(ctx, a, b, measurement.p1, measurement.p2);
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
      if (activeTool === "VLINE") {
        void saveDrawing("VLINE", { time: Math.floor(point.time) });
        selectTool("CURSOR");
        return;
      }

      if (!pendingPoint) {
        setPendingPoint(point);
        return;
      }

      if (activeTool === "MEASURE") {
        // Stays on screen until dismissed, and never reaches the database.
        setMeasurement({ p1: pendingPoint, p2: point });
        setPendingPoint(null);
        return;
      }

      void saveDrawing(activeTool as PersistedDrawingTool, { p1: pendingPoint, p2: point });
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
      for (let i = visibleDrawings.length - 1; i >= 0; i--) {
        const drawing = visibleDrawings[i];
        let hit = false;
        if (drawing.tool === "HLINE") {
          const y = series!.priceToCoordinate((drawing.points as { price: number }).price);
          hit = y !== null && Math.abs(pointer.y - y) <= HIT_TOLERANCE_PX;
        } else if (drawing.tool === "VLINE") {
          const x = chart!.timeScale().timeToCoordinate(
            (drawing.points as { time: number }).time as UTCTimestamp,
          );
          hit = x !== null && Math.abs(pointer.x - x) <= HIT_TOLERANCE_PX;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drawings,
    activeTool,
    pendingPoint,
    selectedDrawingId,
    measurement,
    showDrawings,
    // Mirrors the chart-creation effect's deps. Not redundancy: when that
    // effect tears the chart down and builds a new one, this effect has to
    // re-attach to it. Without these, the handlers stayed bound to a
    // destroyed chart, so drawing silently stopped working after changing
    // timeframe or toggling volume.
    candles,
    showVolume,
    logScale,
    direction,
    entry.time,
    entry.price,
    exit?.time,
    exit?.price,
    stopLoss,
    takeProfit,
    themeVersion,
  ]);

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
              {GRANULARITY_ORDER.map((g) => (
                <SelectItem key={g} value={g}>
                  {GRANULARITY_LABELS[g]}
                </SelectItem>
              ))}
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
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
            <ToggleButton
              label="Volumen"
              Icon={BarChart3}
              pressed={showVolume}
              onClick={() => setShowVolume((v) => !v)}
            />
            <ToggleButton
              label="Escala logarítmica"
              Icon={Scaling}
              pressed={logScale}
              onClick={() => setLogScale((v) => !v)}
            />
            <ToggleButton
              label={showDrawings ? "Ocultar dibujos" : "Mostrar dibujos"}
              Icon={showDrawings ? Eye : EyeOff}
              pressed={!showDrawings}
              onClick={() => setShowDrawings((v) => !v)}
              disabled={drawings.length === 0}
            />
            <ToggleButton
              label="Deshacer último dibujo"
              Icon={Undo2}
              pressed={false}
              onClick={() => {
                const last = drawings[drawings.length - 1];
                if (last) void handleDeleteDrawing(last.id);
              }}
              disabled={drawings.length === 0}
            />
            <ToggleButton label="Restablecer vista" Icon={Maximize2} pressed={false} onClick={resetView} />
            <ToggleButton
              label="Reproducir la operación vela a vela"
              Icon={Play}
              pressed={replaying}
              onClick={() => {
                if (replaying) {
                  setPlaying(false);
                  setReplayIndex(null);
                } else {
                  // Starts a third of the way in, so there is some context to
                  // read before the first new candle appears.
                  setReplayIndex(Math.max(Math.floor(candles.length / 3), 0));
                }
              }}
              disabled={candles.length < 2}
            />
            <ToggleButton
              label="Guardar imagen del gráfico"
              Icon={Camera}
              pressed={false}
              onClick={() => void captureChart()}
              disabled={capturing}
            />
          </div>
        </div>
        {isLoading ? <span className="text-xs text-muted-foreground">Cargando…</span> : null}
      </div>

      {replaying ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-accent"
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {playing ? "Pausa" : "Reproducir"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setReplayIndex((i) => (i === null ? null : Math.min(i + 1, candles.length - 1)));
            }}
            disabled={replayIndex >= candles.length - 1}
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Vela siguiente
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {replayIndex + 1} / {candles.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setReplayIndex(null);
            }}
            className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Salir de la reproducción
          </button>
          <p className="w-full text-xs text-muted-foreground">
            La salida está oculta mientras dura la reproducción: se trata de leer el gráfico sin saber ya
            cómo terminó.
          </p>
        </div>
      ) : null}

      {activeTool !== "CURSOR" ? (
        <p className="text-xs text-primary">
          {activeTool === "HLINE"
            ? "Haz clic en el gráfico para colocar la línea horizontal."
            : activeTool === "VLINE"
              ? "Haz clic para marcar un momento en el tiempo."
              : pendingPoint
                ? "Haz clic de nuevo para completar (Esc para cancelar)."
                : activeTool === "MEASURE"
                  ? "Haz clic en el inicio del movimiento que quieres medir (Esc para salir)."
                  : "Haz clic para el primer punto (Esc para cancelar)."}
        </p>
      ) : null}
      <div className="relative">
        <div
          ref={legendRef}
          className="pointer-events-none absolute left-2 top-2 z-20 font-mono text-[11px] tabular-nums"
        />
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Velas de {GRANULARITY_LABELS[granularity]} · datos de Coinbase
          {drawings.length > 0 ? " · arrastra un dibujo para moverlo" : ""}
          {showsWholeTrade
            ? ""
            : " · a este intervalo solo cabe el tramo final de la operación, así que la entrada queda fuera de la vista"}
        </p>
        {measurement ? (
          <button
            type="button"
            onClick={() => setMeasurement(null)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Quitar medición
          </button>
        ) : null}
      </div>
      {drawings.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Dibujos</p>
            <button
              type="button"
              onClick={handleClearDrawings}
              className="text-xs text-muted-foreground transition-colors hover:text-negative"
            >
              Eliminar todos
            </button>
          </div>
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

function ToggleButton({
  label,
  Icon,
  pressed,
  onClick,
  disabled = false,
}: {
  label: string;
  Icon: typeof MousePointer2;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        pressed
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function drawVerticalLine(ctx: CanvasRenderingContext2D, x: number, height: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

/**
 * Fibonacci retracement: p1 is the 0% anchor and p2 the 100% one, so
 * dragging bottom-to-top and top-to-bottom give the orientation you'd
 * expect for a rally and a sell-off respectively.
 */
function drawFib(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  priceA: number,
  priceB: number,
  color: string,
  dashed: boolean,
): void {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dashed ? [4, 4] : []);
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = color;
  ctx.textBaseline = "bottom";

  for (const level of FIB_LEVELS) {
    // Interpolating in pixels rather than price keeps the levels correct
    // under a logarithmic scale too, where equal price steps aren't equal
    // pixel steps.
    const y = a.y + (b.y - a.y) * level;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    const price = priceA + (priceB - priceA) * level;
    ctx.fillText(`${(level * 100).toFixed(1)}%  ${formatMoney(price)}`, left + 4, y - 2);
  }

  ctx.setLineDash([]);
}

/** The ruler: how far, how much, how long -- the three things you want when eyeballing a move. */
function drawMeasure(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  p1: DrawingPoint,
  p2: DrawingPoint,
): void {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);

  const delta = p2.price - p1.price;
  const color = delta >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)";

  ctx.fillStyle = `${MEASURE_COLOR}1a`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const pct = p1.price === 0 ? 0 : (delta / p1.price) * 100;
  const sign = delta >= 0 ? "+" : "";
  const label = `${sign}${formatMoney(delta)}  ${sign}${pct.toFixed(2)}%  ${formatDuration(Math.abs(p2.time - p1.time))}`;

  ctx.font = "11px ui-monospace, monospace";
  const textWidth = ctx.measureText(label).width;
  const boxX = x + w / 2 - textWidth / 2 - 6;
  const boxY = Math.max(0, y - 22);

  ctx.fillStyle = "hsl(222, 44%, 9%)";
  ctx.fillRect(boxX, boxY, textWidth + 12, 18);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textWidth + 12, 18);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(label, boxX + 6, boxY + 9);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
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
  if (tool === "FIB") {
    // Grabbable anywhere in the band the levels span, like the rectangle --
    // the individual 1px level lines are far too thin to aim at.
    const minX = Math.min(a.x, b.x) - HIT_TOLERANCE_PX;
    const maxX = Math.max(a.x, b.x) + HIT_TOLERANCE_PX;
    const minY = Math.min(a.y, b.y) - HIT_TOLERANCE_PX;
    const maxY = Math.max(a.y, b.y) + HIT_TOLERANCE_PX;
    return pointer.x >= minX && pointer.x <= maxX && pointer.y >= minY && pointer.y <= maxY;
  }
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
  if (drawing.tool === "VLINE") {
    // A vertical line marks a moment, so only the time component moves.
    const { time } = drawing.points as { time: number };
    return { ...drawing, points: { time: Math.round(time + deltaTime) } };
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
  if (d.tool === "VLINE") {
    const { time } = d.points as { time: number };
    return `Línea vertical @ ${new Date(time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  const { p1, p2 } = d.points as { p1: DrawingPoint; p2: DrawingPoint };
  const label =
    d.tool === "TRENDLINE" ? "Línea de tendencia" : d.tool === "FIB" ? "Fibonacci" : "Rectángulo";
  return `${label}: ${formatMoney(p1.price)} → ${formatMoney(p2.price)}`;
}
