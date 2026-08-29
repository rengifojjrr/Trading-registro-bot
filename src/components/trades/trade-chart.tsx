"use client";

import {
  BarChart3,
  Camera,
  CopyPlus,
  Eye,
  EyeOff,
  Magnet,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  Repeat,
  Ruler,
  Lock,
  Target,
  Unlock,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
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

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  coversWholeTrade,
  GRANULARITY_LABELS,
  GRANULARITY_ORDER,
  GRANULARITY_SECONDS,
} from "@/lib/analytics/chart-window";
import {
  describeGroupLines,
  findGroupNear,
  groupFillsByTime,
  toleranceFor,
  type FillGroup,
} from "@/lib/charts/fills-at-time";
import { type DrawingTool as PersistedDrawingTool } from "@/lib/chart-drawings";
import { DrawingSettings } from "@/components/trades/drawing-settings";
import { IndicatorMenu } from "@/components/trades/indicator-menu";
import { IndicatorPane } from "@/components/trades/indicator-pane";
import { ToolPalette } from "@/components/trades/tool-palette";
import { buildShape, type Point as ShapePoint } from "@/lib/charts/geometry";
import { distanceToShape, renderShape } from "@/lib/charts/render";
import {
  computeIndicator,
  INDICATOR_BY_ID,
  isIndicatorId,
  type IndicatorId,
} from "@/lib/charts/indicators";
import {
  parseView,
  SCALE_HINTS,
  SCALE_LABELS,
  SCALE_MODES,
  viewStorageKey,
  type ChartViewState,
  type ScaleMode,
} from "@/lib/charts/scale";
import { snapToCandle } from "@/lib/charts/snap";
import {
  hasTemplate,
  parseTemplates,
  styleForTool,
  TEMPLATES_KEY,
  withTemplate,
  withoutTemplate,
  type StoredTemplates,
} from "@/lib/charts/templates";
import { defaultStyle, serialiseStyle, type DrawingStyle } from "@/lib/charts/style";
import { TOOL_BY_ID, type ToolId } from "@/lib/charts/tools";
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

/** Una ejecución suelta, para marcar los parciales uno a uno. */
export interface TradeChartFill {
  time: number; // unix seconds
  price: number;
  size: number;
  role: "ENTRY" | "EXIT";
}

interface DrawingPoint {
  time: number; // unix seconds
  price: number;
}

export interface TradeChartDrawing {
  id: string;
  tool: PersistedDrawingTool;
  /** De uno a cinco puntos, según lo que pida la herramienta. */
  points: DrawingPoint[];
  style: DrawingStyle;
  color: string;
}

const CHART_HEIGHT = 360;

/**
 * Los tres modos del eje, traducidos a lo que la librería entiende.
 *
 * En un mapa y no en un `switch` repartido: el día que se añada un cuarto
 * modo, este archivo es el único que hay que tocar además del catálogo.
 */
const MODO_LIBRERIA: Record<ScaleMode, PriceScaleMode> = {
  NORMAL: PriceScaleMode.Normal,
  LOG: PriceScaleMode.Logarithmic,
  PERCENT: PriceScaleMode.Percentage,
};
/** How often an open position's candles are re-fetched. One request a minute is nothing against Coinbase's limits, and it's the granularity at which new candles actually appear. */
const CANDLE_REFRESH_MS = 60_000;
/** One candle per second: fast enough not to be boring, slow enough to read. */
const REPLAY_STEP_MS = 1000;
const MEASURE_COLOR = "#38bdf8";

/**
 * lightweight-charts renders to <canvas>, which cannot read CSS custom
 * properties -- so the palette is resolved from the live computed styles
 * instead of being duplicated as literals. Con cinco paletas y tres estados
 * de tema, duplicar valores aquí sería tener treinta juegos de colores que
 * mantener a mano y que se desincronizarían el primer día.
 *
 * Estos literales **no son una paleta**: son el último recurso para cuando
 * `getComputedStyle` no devuelve nada, que en un navegador de verdad no
 * pasa nunca -- ocurre en tests sin CSS real. Por eso da igual a qué paleta
 * se parezcan; lo que importa es que el gráfico se dibuje en vez de quedarse
 * en blanco.
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

/**
 * Un token del tema, resuelto a color.
 *
 * Los indicadores declaran su color como token (`--primary`) para seguir la
 * paleta como todo lo demás; el canvas no entiende `var()`, así que hay que
 * resolverlo aquí. Sin ventana -- en las pruebas -- se queda con el de
 * respaldo, que es más que suficiente para que el gráfico se dibuje.
 */
function leerToken(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
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

/**
 * Cuántos clics pide la herramienta activa.
 *
 * Sale del catálogo y no de una lista aparte: una lista aparte es una que se
 * olvida de actualizar al añadir la herramienta número veinticuatro, y el
 * síntoma sería una herramienta que se guarda a medio dibujar.
 */
function pointsNeeded(tool: ActiveTool): number {
  if (tool === "CURSOR") return 0;
  if (tool === "MEASURE") return 2;
  return TOOL_BY_ID[tool].points;
}

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
/**
 * La vista guardada de una operación, o la de fábrica.
 *
 * Todo dentro de un try: en una ventana privada, con las cookies de sitio
 * bloqueadas o en la captura de miniaturas, `localStorage` no sólo viene
 * vacío, es que *lanza* al tocarlo. Un gráfico que no abre por una preferencia
 * de aspecto sería un mal cambio.
 */
function leerVista(tradeId: string, porDefecto: string): ChartViewState {
  try {
    const crudo = window.localStorage.getItem(viewStorageKey(tradeId));
    return parseView(crudo ? JSON.parse(crudo) : null, porDefecto);
  } catch {
    return parseView(null, porDefecto);
  }
}

function leerPlantillas(): StoredTemplates {
  try {
    const crudo = window.localStorage.getItem(TEMPLATES_KEY);
    return parseTemplates(crudo ? JSON.parse(crudo) : null);
  } catch {
    return {};
  }
}

function guardarPlantillas(plantillas: StoredTemplates): void {
  try {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(plantillas));
  } catch {
    // Igual que la vista: se pierde la preferencia, no la sesión.
  }
}

function guardarVista(tradeId: string, vista: ChartViewState): void {
  try {
    window.localStorage.setItem(viewStorageKey(tradeId), JSON.stringify(vista));
  } catch {
    // Sin sitio o sin permiso: se pierde la preferencia, no la sesión.
  }
}

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
  /**
   * Cada ejecución de la operación, para marcarlas todas.
   *
   * El gráfico enseñaba dos flechas -- la primera entrada y la última salida --
   * y una operación escalada tiene quince. Ver dónde añadiste y dónde quitaste
   * es media lectura de la operación: la media de entrada sola no dice si
   * promediaste a la baja ni si cerraste a trozos.
   */
  fills?: TradeChartFill[];
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

  /**
   * La vista guardada de esta operación.
   *
   * Se lee una sola vez, en el inicializador perezoso, y no en un efecto: un
   * `setState` dentro de un efecto pinta primero la vista de fábrica y luego
   * la guardada, y eso se ve como un parpadeo en cada carga. Además el propio
   * ESLint lo prohíbe, y con razón.
   *
   * Va en el navegador y no en la base de datos porque es una preferencia de
   * *este* dispositivo: la temporalidad que quieres en el móvil no es la que
   * quieres en el escritorio.
   */
  const vistaGuardada = useState(() => leerVista(tradeId, initialGranularity))[0];

  /**
   * Las plantillas: «así quiero yo esta herramienta».
   *
   * Al contrario que la vista, no van por operación sino por persona: un
   * grosor de línea que te gusta te gusta en todas. Siguen en el navegador
   * porque son aspecto, no dato.
   */
  const [templates, setTemplates] = useState<StoredTemplates>(() => leerPlantillas());

  const [candles, setCandles] = useState(initialCandles);
  const [granularity, setGranularity] = useState(
    () => vistaGuardada.granularity as CoinbaseCandleGranularity,
  );

  /**
   * Lo que hay bajo el cursor y lo que se dejó fijado al pulsar.
   *
   * El aviso flotante se escribe directamente en el DOM y no por estado: el
   * evento del cursor dispara en cada píxel, y un re-render por píxel hace que
   * el gráfico entero se atasque. Lo que sí va por estado es lo fijado al
   * pulsar, que pasa una vez por clic.
   */
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // Se guarda con la temporalidad en la que se fijó: al cambiarla, la vela
  // que se pulsó ya no existe con ese tamaño, así que el resumen deja de
  // corresponder. Se comprueba al pintar en vez de vaciarlo desde un efecto,
  // que sería un render en cascada para representar algo ya deducible.
  const [pinned, setPinned] = useState<{ group: FillGroup; granularity: string } | null>(null);
  const fillGroupsRef = useRef<Map<number, FillGroup>>(new Map());
  const toleranceRef = useRef(60);

  // Se recalcula al cambiar las ejecuciones, no en cada render del gráfico:
  // agrupar veinticinco ejecuciones es barato, pero hacerlo en cada movimiento
  // del ratón no lo sería.
  useEffect(() => {
    fillGroupsRef.current = groupFillsByTime(fills ?? []);
  }, [fills]);

  // Por referencia y no por estado: lo leen los manejadores del gráfico, que
  // se registran una vez y no se vuelven a crear al cambiar de temporalidad.
  const granularityRef = useRef(granularity);
  useEffect(() => {
    toleranceRef.current = toleranceFor(GRANULARITY_SECONDS[granularity]);
    granularityRef.current = granularity;
  }, [granularity]);


  const [isLoading, setIsLoading] = useState(false);
  const [drawings, setDrawings] = useState(initialDrawings);
  const [activeTool, setActiveTool] = useState<ActiveTool>("CURSOR");
  /**
   * Los clics que llevas dados de la herramienta activa.
   *
   * Era un solo punto porque ninguna herramienta pedía más de dos. Ahora hay
   * de hasta cinco, así que es una lista: la vista previa se pinta con lo
   * acumulado más el cursor, y al llegar a los que la herramienta pide se
   * guarda.
   */
  const [pendingPoints, setPendingPoints] = useState<DrawingPoint[]>([]);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  const [showVolume, setShowVolume] = useState(vistaGuardada.showVolume);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(vistaGuardada.scaleMode);
  const [autoScale, setAutoScale] = useState(vistaGuardada.autoScale);
  const [indicators, setIndicators] = useState<IndicatorId[]>(
    vistaGuardada.indicators.filter(isIndicatorId),
  );
  const [showDrawings, setShowDrawings] = useState(vistaGuardada.showDrawings);
  /**
   * El tramo de tiempo que se ve arriba, para cuadrar el panel de indicadores.
   *
   * Sólo se actualiza cuando cambia de verdad: al arrastrar el gráfico este
   * evento dispara decenas de veces por segundo, y un re-render por cada uno
   * atasca todo. Con la comparación, arrastrar dentro de la misma vela no
   * vuelve a pintar nada.
   */
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);

  /**
   * El stop y el objetivo, en estado local.
   *
   * Vienen del diario por props, pero se pueden arrastrar aquí, así que hacen
   * falta en estado: durante el arrastre lo que se ve es este valor, y sólo al
   * soltar se manda al servidor. Con las props solas la raya se quedaría
   * clavada hasta que respondiera la red.
   */
  const [planLevels, setPlanLevels] = useState({ stop: stopLoss, target: takeProfit });
  const dragLevelRef = useRef<"stop" | "target" | null>(null);
  /**
   * El imán: los clics se pegan al máximo, mínimo, apertura o cierre más
   * cercano de la vela.
   *
   * Sin él, una línea de soporte queda tres píxeles por debajo del mínimo real
   * y luego no coincide con nada. Con él, un soporte trazado sobre un mínimo
   * está *en* el mínimo, que es lo que se quiso decir al trazarlo.
   */
  const [magnet, setMagnet] = useState(vistaGuardada.magnet);
  /**
   * Seguir en la misma herramienta después de dibujar.
   *
   * Apagado -- lo normal -- se vuelve al cursor, que es lo que se quiere el 90%
   * de las veces. Encendido, dibujar diez líneas horizontales no obliga a
   * volver al desplegable diez veces.
   */
  const [stayInDrawing, setStayInDrawing] = useState(false);
  /**
   * Enseñar el plan -- entrada, stop y objetivo -- como zonas.
   *
   * Encendido de salida cuando hay plan: es el contexto que explica la
   * operación, no un adorno. Apagable porque al dibujar encima estorba.
   */
  const [showPlan, setShowPlan] = useState(vistaGuardada.showPlan);
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

  const router = useRouter();
  const [capturing, setCapturing] = useState(false);
  const [importing, setImporting] = useState(false);

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

  // Bumped cada vez que cambia la apariencia, para volver a construir el
  // gráfico con los colores nuevos. Un canvas no hereda el CSS como el
  // resto de la interfaz, así que sin esto cambiar de paleta dejaría un
  // rectángulo con los colores viejos en medio de la página.
  //
  // Se vigilan los atributos de apariencia y, además, la preferencia del
  // sistema: con el tema en «automático» -- que es lo que viene de fábrica
  // -- cambiar de claro a oscuro en el sistema operativo no toca el DOM, y
  // el observador de mutaciones no se entera de nada.
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const repintar = () => setThemeVersion((v) => v + 1);

    const observer = new MutationObserver(repintar);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-paleta"],
    });

    const sistema = window.matchMedia("(prefers-color-scheme: dark)");
    sistema.addEventListener("change", repintar);

    return () => {
      observer.disconnect();
      sistema.removeEventListener("change", repintar);
    };
  }, []);

  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null;

  /**
   * Guarda un cambio de ajustes.
   *
   * Se pinta al momento y se guarda después: mover un deslizador de opacidad
   * dispara veinte cambios, y esperar al servidor en cada uno haría que el
   * control fuera a tirones. Si el guardado falla se dice, y lo que se ve
   * sigue siendo lo último que se pidió -- recargar la página lo devuelve a lo
   * guardado, que es la única fuente de verdad.
   */
  async function updateDrawingStyle(id: string, style: DrawingStyle) {
    const actual = drawings.find((d) => d.id === id);
    if (!actual) return;

    setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, style, color: style.color } : d)));

    try {
      const response = await fetch(`/api/trades/${tradeId}/drawings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: actual.tool,
          points: actual.points,
          style: serialiseStyle(actual.tool, style),
        }),
      });
      const result = (await response.json()) as { error: string | null };
      if (result.error) toast.error(result.error);
    } catch {
      toast.error("No se pudieron guardar los ajustes.");
    }
  }
  const dragRef = useRef<{ id: string; startPoint: DrawingPoint; original: TradeChartDrawing } | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
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

  /**
   * Guarda la vista al cambiar cualquiera de sus piezas.
   *
   * En un efecto y no en cada manejador: son ocho interruptores, y escribir el
   * guardado en los ocho es garantizar que el noveno se olvide.
   */
  useEffect(() => {
    guardarVista(tradeId, {
      granularity,
      scaleMode,
      autoScale,
      showVolume,
      showDrawings,
      showPlan,
      magnet,
      indicators,
    });
  }, [
    tradeId,
    granularity,
    scaleMode,
    autoScale,
    showVolume,
    showDrawings,
    showPlan,
    magnet,
    indicators,
  ]);

  function toggleIndicator(id: IndicatorId) {
    setIndicators((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  function selectTool(tool: ActiveTool) {
    setActiveTool(tool);
    setPendingPoints([]);
    if (tool !== "MEASURE") setMeasurement(null);
  }

  async function saveDrawing(tool: ToolId, points: DrawingPoint[]) {
    // De la plantilla, no de fábrica: es lo que hace que la segunda línea de
    // tendencia salga ya como te gusta.
    const style = styleForTool(tool, templates);
    try {
      const response = await fetch(`/api/trades/${tradeId}/drawings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, points, style: serialiseStyle(tool, style) }),
      });
      const result = (await response.json()) as { error: string | null; id: string | null };
      if (result.error || !result.id) {
        toast.error(result.error ?? "No se pudo guardar el dibujo.");
        return;
      }
      setDrawings((prev) => [...prev, { id: result.id!, tool, points, style, color: style.color }]);
      // Se abre en cuanto se dibuja: recién puesto es cuando se quiere
      // ajustar, y obligar a un clic más para llegar a los ajustes es lo que
      // hace que nadie los toque nunca.
      setSelectedDrawingId(result.id);
    } catch {
      toast.error("No se pudo guardar el dibujo.");
    }
  }


  /**
   * Guarda un nivel del plan arrastrado en el gráfico.
   *
   * Escribe en `journal_entries`, donde el stop y el objetivo han vivido
   * siempre: el diario, el análisis de riesgo y el gráfico tienen que seguir
   * hablando del mismo número, y una tabla nueva sólo para «el nivel que se
   * arrastró» los habría separado.
   */
  async function persistPlanLevel(cual: "stop" | "target", precio: number | null) {
    try {
      const res = await fetch(`/api/trades/${tradeId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cual === "stop" ? { stopLoss: precio } : { takeProfit: precio }),
      });
      const result = (await res.json()) as { error: string | null };
      if (result.error) toast.error(result.error);
      else toast.success(cual === "stop" ? "Stop actualizado." : "Objetivo actualizado.");
    } catch {
      toast.error("No se pudo guardar el nivel.");
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

  /**
   * Trae los dibujos de la operación anterior del mismo producto.
   *
   * Se recarga la página al terminar en vez de insertar en el estado local: lo
   * que vuelve del servidor son filas nuevas con identificadores nuevos, y
   * fabricarlos aquí para no recargar sería mantener dos versiones de la
   * verdad hasta el siguiente refresco.
   */
  async function handleImportDrawings() {
    setImporting(true);
    try {
      const res = await fetch(`/api/trades/${tradeId}/drawings/import`, { method: "POST" });
      const result = (await res.json()) as { error: string | null; copiados: number };
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.copiados} dibujo(s) copiados. Recargando…`);
      router.refresh();
    } catch {
      toast.error("No se pudieron copiar los dibujos.");
    } finally {
      setImporting(false);
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
        mode: MODO_LIBRERIA[scaleMode],
        // Apagar la autoescala fija el rango que se ve: sin esto, mirar una
        // zona plana la amplía hasta que un movimiento de dos dólares parece
        // un desplome.
        autoScale,
      },
      // Arrastrar el eje para comprimir o estirar. Va explícito porque es la
      // otra mitad de «escala de verdad»: los tres modos dicen *cómo* se
      // reparte el precio, y esto deja decidir *cuánto* espacio ocupa.
      handleScale: { axisPressedMouseMove: { price: true, time: true } },
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

    // Cuando se conocen las ejecuciones una a una se marcan todas; si no, se
    // cae a las dos de siempre. Una posición escalada tiene quince flechas y
    // dos no cuentan la misma historia: dónde añadiste y dónde fuiste
    // cerrando es media lectura de la operación.
    //
    // Se agrupan las del mismo segundo y precio porque Coinbase parte una
    // orden en varios fills: seis flechas idénticas encima de la misma vela
    // tapan la vela y no dicen nada que no diga una.
    const markers: SeriesMarker<Time>[] = [];

    if (fills && fills.length > 0) {
      const agrupados = new Map<string, TradeChartFill>();
      for (const fill of fills) {
        const clave = `${fill.time}:${fill.price}:${fill.role}`;
        const previo = agrupados.get(clave);
        if (previo) previo.size += fill.size;
        else agrupados.set(clave, { ...fill });
      }

      for (const fill of agrupados.values()) {
        const esEntrada = fill.role === "ENTRY";
        if (!esEntrada && replaying) continue;
        // La flecha sola, sin etiqueta.
        //
        // Antes cada flecha llevaba escrito el tamaño y el precio. Con dos
        // ejecuciones se lee; con veinticinco es una pared de texto que se
        // solapa consigo misma y tapa las velas -- justo lo que se iba a
        // mirar. El detalle sale al pasar por encima y al pulsar, que es como
        // lo resuelve TradingView y la única forma que escala.
        markers.push({
          time: fill.time as UTCTimestamp,
          position: esEntrada === isLong ? "belowBar" : "aboveBar",
          shape: esEntrada === isLong ? "arrowUp" : "arrowDown",
          color: esEntrada ? THEME.entry : THEME.exit,
        });
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    } else {
      // Sin ejecución a ejecución sólo hay dos flechas, así que aquí sí cabe
      // la etiqueta: dos textos no se tapan entre sí, y sin datos por
      // ejecución tampoco habría nada que enseñar al pasar por encima.
      markers.push({
        time: entry.time as UTCTimestamp,
        position: isLong ? "belowBar" : "aboveBar",
        shape: isLong ? "arrowUp" : "arrowDown",
        color: THEME.entry,
        text: `Entrada ${formatMoney(entry.price)}`,
      });
      if (exit && !replaying) {
        markers.push({
          time: exit.time as UTCTimestamp,
          position: isLong ? "aboveBar" : "belowBar",
          shape: isLong ? "arrowDown" : "arrowUp",
          color: THEME.exit,
          text: `Salida ${formatMoney(exit.price)}`,
        });
      }
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

    if (planLevels.stop !== null) {
      series.createPriceLine({
        price: planLevels.stop,
        color: THEME.down,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SL",
      });
    }
    if (planLevels.target !== null) {
      series.createPriceLine({
        price: planLevels.target,
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
      const color = change >= 0 ? THEME.up : THEME.down;

      // Cada dato con su etiqueta en gris y su cifra en color, en vez de una
      // ristra de texto: «A 68000 M 68100» obliga a descifrar las abreviaturas
      // cada vez, y con seis cifras seguidas se lee mal en el móvil.
      const campos: [string, string, boolean][] = [
        ["A", formatMoney(shown.open), false],
        ["Máx", formatMoney(shown.high), false],
        ["Mín", formatMoney(shown.low), false],
        ["C", formatMoney(shown.close), true],
        ["Var", `${sign}${changePct.toFixed(2)}%`, true],
        ["Vol", shown.volume.toLocaleString("es-ES"), false],
      ];

      node.replaceChildren(
        ...campos.map(([etiqueta, valor, coloreado]) => {
          const span = document.createElement("span");
          span.className = "flex items-center gap-1";
          const clave = document.createElement("span");
          clave.className = "text-muted-foreground";
          clave.textContent = etiqueta;
          const dato = document.createElement("span");
          dato.textContent = valor;
          if (coloreado) dato.style.color = color;
          span.append(clave, dato);
          return span;
        }),
      );
    }
    /**
     * El aviso flotante con lo que hay bajo el cursor.
     *
     * Se escribe al DOM directamente, como la lectura OHLC de arriba y por el
     * mismo motivo: esto dispara en cada píxel de movimiento.
     *
     * El cursor cae sobre una vela, no sobre un segundo, así que se busca la
     * ejecución más cercana dentro de media vela. Con más tolerancia, dos
     * velas contiguas enseñarían la misma; con menos, habría que acertar el
     * píxel exacto.
     */
    function updateFillTooltip(param: MouseEventParams<Time>) {
      const node = tooltipRef.current;
      if (!node) return;

      const group =
        param.time && param.point
          ? findGroupNear(fillGroupsRef.current, Number(param.time), toleranceRef.current)
          : null;

      if (!group || !param.point) {
        node.hidden = true;
        return;
      }

      node.hidden = false;
      node.textContent = describeGroupLines(group).join("  ·  ");

      // Se coloca a la izquierda del cursor cuando no cabe a la derecha: un
      // aviso cortado por el borde es peor que uno que cambia de lado.
      const ancho = node.offsetWidth;
      const cabeALaDerecha = param.point.x + 16 + ancho < (container?.clientWidth ?? 0);
      node.style.left = `${cabeALaDerecha ? param.point.x + 16 : param.point.x - ancho - 16}px`;
      node.style.top = `${Math.max(4, param.point.y - 40)}px`;
    }

    function onCrosshair(param: MouseEventParams<Time>) {
      updateLegend(param);
      updateFillTooltip(param);
    }

    /**
     * Al pulsar, el resumen se queda.
     *
     * Pulsar donde no hay nada lo quita, que es lo que se espera de algo
     * fijado: sin eso habría que buscar una equis pequeña para cerrarlo.
     */
    function onClick(param: MouseEventParams<Time>) {
      if (!param.time) {
        setPinned(null);
        return;
      }
      const group = findGroupNear(
        fillGroupsRef.current,
        Number(param.time),
        toleranceRef.current,
      );
      setPinned(group ? { group, granularity: granularityRef.current } : null);
    }

    // Con la última vela puesta desde el principio. Sin esto, la barra de
    // datos nace vacía y sólo se llena al mover el cursor -- que en un
    // teléfono no pasa nunca.
    updateLegend({} as MouseEventParams<Time>);

    function onVisibleRange(rango: { from: Time; to: Time } | null) {
      if (!rango) return;
      const from = Number(rango.from);
      const to = Number(rango.to);
      setVisibleRange((previo) =>
        previo && previo.from === from && previo.to === to ? previo : { from, to },
      );
    }

    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRange);
    chart.subscribeCrosshairMove(onCrosshair);
    chart.subscribeClick(onClick);

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
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRange);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.unsubscribeClick(onClick);
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
    // Los fills llegan del servidor y no cambian mientras la página vive,
    // salvo que una sincronización traiga uno nuevo -- que llega como props
    // nuevas. Se depende de la longitud y no del array para no reconstruir el
    // gráfico entero en cada render por una identidad de objeto distinta.
    fills?.length,
    planLevels,
    showVolume,
    scaleMode,
    autoScale,
    indicators,
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

    /**
     * Los indicadores que van sobre las velas.
     *
     * Se rehacen enteros cada vez en vez de mantener una serie viva por
     * indicador: son cuatro líneas de trescientos puntos, el coste no se nota,
     * y llevar la contabilidad de qué serie corresponde a qué indicador -- y
     * acordarse de destruirla al quitarlo -- es exactamente donde se cuelan
     * las fugas de memoria en un gráfico que se repinta cada minuto.
     */
    const grafico = chartRef.current;
    for (const vieja of indicatorSeriesRef.current) grafico?.removeSeries(vieja);
    indicatorSeriesRef.current = [];

    const sesionDe = (t: number) => String(Math.floor(t / 86400));
    for (const id of indicators) {
      const meta = INDICATOR_BY_ID[id];
      if (meta.pane !== "PRECIO" || !grafico) continue;

      const serie = grafico.addSeries(LineSeries, {
        color: leerToken(meta.colorToken, THEME.text),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      const valores = computeIndicator(id, visibleCandles, sesionDe);
      serie.setData(
        visibleCandles
          .map((c, i) => ({ time: c.time as UTCTimestamp, value: valores[i] }))
          // Los tramos sin datos se quitan en vez de mandarse como cero: un
          // cero se pinta, y una media que arranca en cero cae en picado desde
          // el borde inferior hasta su primer valor de verdad.
          .filter((p): p is { time: UTCTimestamp; value: number } => p.value !== null),
      );

      indicatorSeriesRef.current.push(serie);
    }

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
  }, [visibleCandles, granularity, showVolume, scaleMode, autoScale, indicators, themeVersion, replaying]);

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
          price: d.points[0].price,
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

      /**
       * Un dibujo, con la geometría que le toque.
       *
       * Todo pasa por `buildShape`, incluso lo que antes tenía su propia
       * función: así una herramienta nueva es una entrada en el catálogo y un
       * caso en la geometría, no un `if` más aquí dentro.
       */
      const pintar = (
        tool: ToolId,
        puntos: DrawingPoint[],
        estilo: DrawingStyle,
        opciones: { ghost?: boolean; selected?: boolean },
      ) => {
        const pixeles = puntos.map(toPixel);
        if (pixeles.some((p) => p === null)) return;
        const pts = pixeles as ShapePoint[];

        const shape = buildShape({
          tool,
          points: pts,
          style: estilo,
          width,
          height,
          prices: puntos.map((p) => p.price),
          // El tiempo real de cada punto, para lo que mide duraciones: en
          // píxeles el eje no es lineal, porque las velas que no existen (un
          // fin de semana, un hueco de datos) no ocupan sitio.
          times: puntos.map((p) => p.time),
          barSeconds: GRANULARITY_SECONDS[granularity],
          formatPrice: (n) => formatMoney(n),
        });

        renderShape(ctx, shape, estilo, {
          ghost: opciones.ghost,
          handles: opciones.selected ? pts : undefined,
          labelColor: THEME.text,
          // El contorno del texto y el anillo de los tiradores salen del fondo
          // del gráfico, así que siguen al tema en vez de ser negro fijo.
          haloColor: withAlpha(THEME.background, 0.75),
        });
      };

      /**
       * El plan de la operación, con las mismas zonas que la herramienta.
       *
       * La herramienta de posición calculaba el riesgo/beneficio de una
       * posición **hipotética**, mientras que la operación de verdad -- con su
       * entrada, su stop y su objetivo ya guardados en el diario -- sólo
       * pintaba dos rayas discontinuas y ningún número. Era la comparación al
       * revés: lo inventado se explicaba y lo real no.
       *
       * Se pinta con la misma herramienta y por tanto con las mismas zonas
       * roja y verde y el mismo cálculo. Va antes que los dibujos para que
       * quede debajo de ellos: es contexto, no anotación.
       */
      if (showPlan && planLevels.stop !== null && planLevels.target !== null) {
        const planTool = direction === "LONG" ? "LONG_POSITION" : "SHORT_POSITION";
        pintar(
          planTool,
          [
            { time: entry.time, price: entry.price },
            { time: entry.time, price: planLevels.stop },
            { time: entry.time, price: planLevels.target },
          ],
          { ...defaultStyle(planTool), fillOpacity: 10 },
          {},
        );
      }

      for (const drawing of visibleDrawings) {
        pintar(drawing.tool, drawing.points, drawing.style, {
          selected: drawing.id === selectedDrawingId,
        });
      }

      // La vista previa entre el primer clic y el último.
      //
      // Se pinta con los puntos ya puestos más el del cursor: así una
      // horquilla de tres puntos se ve tomar forma en vez de aparecer de golpe
      // al tercer clic.
      const hover = hoverPointRef.current;
      if (pendingPoints.length > 0 && hover && activeTool !== "CURSOR") {
        const previa = [...pendingPoints, hover];
        if (activeTool === "MEASURE") {
          const a = toPixel(previa[0]);
          const b = toPixel(previa[1]);
          if (a && b) drawMeasure(ctx, a, b, previa[0], previa[1]);
        } else {
          pintar(activeTool, previa, styleForTool(activeTool, templates), { ghost: true });
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
      const point = magnet
        ? snapToCandle({ time: Number(time), price }, candlesRef.current)
        : { time: Number(time), price };

      /**
       * Se juntan clics hasta llegar a los que la herramienta pide.
       *
       * Antes había un `if` por herramienta -- uno para las de un punto, otro
       * para las de dos -- y añadir las de tres, cuatro y cinco habría sido
       * añadir tres más. Ahora es una cuenta: cuando hay suficientes, se
       * guarda.
       */
      const necesarios = pointsNeeded(activeTool);
      const acumulados = [...pendingPoints, point];

      if (acumulados.length < necesarios) {
        setPendingPoints(acumulados);
        return;
      }

      if (activeTool === "MEASURE") {
        // Se queda en pantalla hasta que se descarta, y nunca llega a la base.
        setMeasurement({ p1: acumulados[0], p2: acumulados[1] });
        setPendingPoints([]);
        return;
      }

      void saveDrawing(activeTool, acumulados);
      setPendingPoints([]);
      // Con «seguir dibujando» se queda la herramienta puesta para el
      // siguiente; sin él se vuelve al cursor, que es lo habitual.
      if (!stayInDrawing) selectTool("CURSOR");
    }


    function handleCrosshairMove(param: MouseEventParams<Time>) {
      if (!param.point) {
        hoverPointRef.current = null;
      } else {
        const price = series!.coordinateToPrice(param.point.y);
        const time = chart!.timeScale().coordinateToTime(param.point.x);
        hoverPointRef.current = price !== null && time !== null ? { time: Number(time), price } : null;
      }
      if (pendingPoints.length > 0) redraw();
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
      // Gana el de arriba, que es el último dibujado -- igual que al pintar.
      //
      // El acierto se mide contra la misma figura que se pintó, no contra una
      // aproximación aparte: dos formas de decidir dónde está un dibujo acaban
      // discrepando, y el síntoma es un dibujo que se ve pero no se coge.
      for (let i = visibleDrawings.length - 1; i >= 0; i--) {
        const drawing = visibleDrawings[i];
        const pixeles = drawing.points.map(toPixel);
        if (pixeles.some((p) => p === null)) continue;

        const shape = buildShape({
          tool: drawing.tool,
          points: pixeles as ShapePoint[],
          style: drawing.style,
          width: container!.clientWidth,
          height: CHART_HEIGHT,
          prices: drawing.points.map((p) => p.price),
          formatPrice: (n) => formatMoney(n),
        });

        const hit = distanceToShape(shape, pointer.x, pointer.y) <= HIT_TOLERANCE_PX;
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

      /**
       * Ningún dibujo debajo: puede ser el stop o el objetivo.
       *
       * Se comprueba **después** de los dibujos y no antes porque estas dos
       * rayas cruzan el gráfico entero: yendo primero, robarían el clic a
       * cualquier dibujo que las cruce, que son casi todos.
       */
      for (const cual of ["stop", "target"] as const) {
        const nivel = cual === "stop" ? planLevels.stop : planLevels.target;
        if (nivel === null) continue;
        const y = series!.priceToCoordinate(nivel);
        if (y === null || Math.abs(y - pointer.y) > HIT_TOLERANCE_PX) continue;

        event.preventDefault();
        event.stopPropagation();
        dragLevelRef.current = cual;
        setSelectedDrawingId(null);
        return;
      }

      setSelectedDrawingId(null);
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = container!.getBoundingClientRect();

      // Arrastrando un nivel del plan: sólo cambia el precio, nunca el
      // momento. Un stop no está en un instante, está en un precio.
      const nivel = dragLevelRef.current;
      if (nivel) {
        const precio = series!.coordinateToPrice(event.clientY - rect.top);
        if (precio === null) return;
        setPlanLevels((prev) => ({ ...prev, [nivel === "stop" ? "stop" : "target"]: precio }));
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
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
      // Al soltar un nivel del plan es cuando se guarda, no durante: arrastrar
      // dispara decenas de eventos, y una petición por cada uno sería
      // machacar la fila con estados intermedios que nadie pidió.
      const nivel = dragLevelRef.current;
      if (nivel) {
        dragLevelRef.current = null;
        setPlanLevels((actual) => {
          void persistPlanLevel(nivel, nivel === "stop" ? actual.stop : actual.target);
          return actual;
        });
        return;
      }

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
    pendingPoints,
    selectedDrawingId,
    measurement,
    showDrawings,
    // Los leen los manejadores de clic y el pintado. Sin ellos el gráfico se
    // queda con el valor que tenían al montarse: apagar el imán no apagaría
    // nada hasta cambiar de temporalidad.
    magnet,
    stayInDrawing,
    granularity,
    // Mirrors the chart-creation effect's deps. Not redundancy: when that
    // effect tears the chart down and builds a new one, this effect has to
    // re-attach to it. Without these, the handlers stayed bound to a
    // destroyed chart, so drawing silently stopped working after changing
    // timeframe or toggling volume.
    candles,
    showVolume,
    scaleMode,
    autoScale,
    indicators,
    direction,
    entry.time,
    entry.price,
    exit?.time,
    exit?.price,
    planLevels,
    showPlan,
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
            <SelectTrigger className="h-8 w-24 text-xs" aria-label="Temporalidad">
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

          {/* Los tres modos del eje. Excluyentes entre sí, así que un
              desplegable y no tres interruptores: con interruptores existiría
              «logarítmica y porcentaje a la vez», que no significa nada. */}
          <Select value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleMode)}>
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Escala de precios">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALE_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  <span className="flex flex-col gap-0.5">
                    <span>{SCALE_LABELS[m]}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {SCALE_HINTS[m]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Los indicadores, en un desplegable de varios a la vez: la mitad
              de las veces se quiere EMA 9 *y* EMA 21, no una u otra. */}
          <IndicatorMenu active={indicators} onToggle={toggleIndicator} />

          {/* Cursor, medir y los dos interruptores de modo: lo que se alterna
              constantemente mientras se dibuja. Las herramientas en sí están
              en su propia paleta, debajo. */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
            <button
              type="button"
              title="Cursor"
              aria-label="Cursor"
              aria-pressed={activeTool === "CURSOR"}
              onClick={() => selectTool("CURSOR")}
              className={cn(
                "rounded p-1.5 transition-colors",
                activeTool === "CURSOR"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MousePointer2 className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              title="Medir movimiento (no se guarda)"
              aria-label="Medir movimiento"
              aria-pressed={activeTool === "MEASURE"}
              onClick={() => selectTool("MEASURE")}
              className={cn(
                "rounded p-1.5 transition-colors",
                activeTool === "MEASURE"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Ruler className="size-4" aria-hidden />
            </button>

            {/* Los dos interruptores de la barra de TradingView que cambian
                cómo se dibuja, no qué se dibuja. */}
            <ToggleButton
              label="Imán: pegar a máximos y mínimos"
              Icon={Magnet}
              pressed={magnet}
              onClick={() => setMagnet((v) => !v)}
            />
            <ToggleButton
              label="Seguir dibujando con la misma herramienta"
              Icon={Repeat}
              pressed={stayInDrawing}
              onClick={() => setStayInDrawing((v) => !v)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
            <ToggleButton
              label="Volumen"
              Icon={BarChart3}
              pressed={showVolume}
              onClick={() => setShowVolume((v) => !v)}
            />
            <ToggleButton
              label={autoScale ? "Fijar la escala" : "Volver a la escala automática"}
              Icon={autoScale ? Unlock : Lock}
              pressed={!autoScale}
              onClick={() => setAutoScale((v) => !v)}
            />
            {/* Sólo cuando hay plan que enseñar: un interruptor que no puede
                cambiar nada se pulsa una vez y se deja de confiar en el resto
                de la barra. */}
            {planLevels.stop !== null && planLevels.target !== null ? (
              <ToggleButton
                label={showPlan ? "Ocultar el plan" : "Enseñar el plan (stop y objetivo)"}
                Icon={Target}
                pressed={showPlan}
                onClick={() => setShowPlan((v) => !v)}
              />
            ) : null}
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
              label="Traer los dibujos de la operación anterior"
              Icon={CopyPlus}
              pressed={false}
              onClick={() => void handleImportDrawings()}
              disabled={importing}
            />
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

      <ToolPalette
        active={activeTool === "CURSOR" || activeTool === "MEASURE" ? null : activeTool}
        onSelect={(t) => selectTool(t)}
      />

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
          {(() => {
            // Cuántos clics faltan, dicho en cada momento. Antes el texto era
            // fijo por herramienta; con las de cinco puntos eso ya no vale.
            const faltan = pointsNeeded(activeTool) - pendingPoints.length;
            if (activeTool === "MEASURE") {
              return pendingPoints.length === 0
                ? "Haz clic en el inicio del movimiento que quieres medir (Esc para salir)."
                : "Haz clic en el final del movimiento (Esc para salir).";
            }
            const nombre = TOOL_BY_ID[activeTool].label.toLowerCase();
            if (faltan <= 1) return `Un clic más para completar ${nombre} (Esc para cancelar).`;
            return `${nombre}: faltan ${faltan} clics (Esc para cancelar).`;
          })()}
        </p>
      ) : null}
      {/* La barra de datos, fija y siempre visible.
          Antes vivía flotando sobre las velas y sólo se rellenaba al mover el
          cursor. En el móvil no hay cursor, así que ahí no aparecía nunca: la
          lectura OHLC no existía en el sitio donde más falta hace, porque las
          velas se ven peor. Ahora es una barra de verdad, con la última vela
          puesta de salida y la señalada mientras se señala. */}
      <div
        ref={legendRef}
        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5 font-mono text-[11px] tabular-nums"
      />
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

        {/* Lo que hay bajo el cursor.
            z-20 para quedar por encima de los lienzos de la librería, que se
            ponen z-index 1 y 2 a sí mismos. Sin eventos de puntero: si los
            capturara, moverse hacia el aviso lo haría desaparecer. */}
        <div
          ref={tooltipRef}
          hidden
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] tabular-nums shadow-lg"
        />
      </div>

      {/* Los indicadores que no caben en el eje del precio: RSI de 0 a 100 y
          ATR en dólares. Debajo del gráfico y cuadrados con su rango de tiempo
          visible, para que las dos mitades hablen del mismo momento. */}
      <IndicatorPane
        indicators={indicators}
        candles={visibleCandles}
        from={visibleRange?.from ?? null}
        to={visibleRange?.to ?? null}
      />

      {/* El resumen que se queda al pulsar.
          Debajo del gráfico y no encima: un panel flotante sobre las velas
          tapa justo lo que se acaba de pulsar para poder mirarlo. */}
      {pinned && pinned.granularity === granularity ? (
        <PinnedFillSummary group={pinned.group} onClose={() => setPinned(null)} />
      ) : null}
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
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDrawingId(d.id === selectedDrawingId ? null : d.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors",
                d.id === selectedDrawingId ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.style.color }}
                  aria-hidden
                />
                <span className="truncate text-muted-foreground">{describeDrawing(d)}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {d.id === selectedDrawingId ? "Ajustes abiertos" : "Ajustar"}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Los ajustes de lo seleccionado.
          Se abre pinchando el dibujo en el gráfico o su fila en la lista, y se
          aplica al momento: es un panel de apariencia, se mira el gráfico
          mientras se toca, y tener que confirmar rompe ese ida y vuelta. */}
      {selectedDrawing ? (
        <DrawingSettings
          tool={selectedDrawing.tool}
          style={selectedDrawing.style}
          onChange={(next) => void updateDrawingStyle(selectedDrawing.id, next)}
          isTemplate={hasTemplate(templates, selectedDrawing.tool)}
          onSaveTemplate={() => {
            const siguiente = withTemplate(templates, selectedDrawing.tool, selectedDrawing.style);
            setTemplates(siguiente);
            guardarPlantillas(siguiente);
            toast.success(
              `Las «${TOOL_BY_ID[selectedDrawing.tool].label.toLowerCase()}» nuevas saldrán así.`,
            );
          }}
          onClearTemplate={() => {
            const siguiente = withoutTemplate(templates, selectedDrawing.tool);
            setTemplates(siguiente);
            guardarPlantillas(siguiente);
            toast.success("Vuelve a los valores de fábrica.");
          }}
          onDelete={() => {
            void handleDeleteDrawing(selectedDrawing.id);
            setSelectedDrawingId(null);
          }}
          onClose={() => setSelectedDrawingId(null)}
        />
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

/**
 * Cuántos píxeles de margen tiene un clic para contar como «encima».
 *
 * Seis: menos obliga a acertar la línea al píxel, y más hace que dos dibujos
 * cercanos se peleen por el mismo clic.
 */
const HIT_TOLERANCE_PX = 6;

/**
 * Mueve un dibujo entero, en unidades de datos y no de píxeles.
 *
 * En píxeles, arrastrar y luego cambiar de temporalidad deformaría la figura:
 * lo que se mueve es el momento y el precio, que no dependen del zoom.
 */
function translateDrawing(
  drawing: TradeChartDrawing,
  deltaTime: number,
  deltaPrice: number,
): TradeChartDrawing {
  // Una línea vertical marca un momento y sólo se mueve en el tiempo; una
  // horizontal marca un precio y sólo se mueve en el precio. El resto se mueve
  // entero, y con la lista eso es una sola línea para las veintiuna.
  const soloTiempo = drawing.tool === "VLINE";
  const soloPrecio = drawing.tool === "HLINE" || drawing.tool === "HRAY";

  return {
    ...drawing,
    points: drawing.points.map((p) => ({
      time: soloPrecio ? p.time : Math.round(p.time + deltaTime),
      price: soloTiempo ? p.price : p.price + deltaPrice,
    })),
  };
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



function describeDrawing(d: TradeChartDrawing): string {
  const nombre = TOOL_BY_ID[d.tool].label;
  const primero = d.points[0];
  const ultimo = d.points[d.points.length - 1];

  if (d.tool === "VLINE") {
    const fecha = new Date(primero.time * 1000).toISOString().slice(0, 16).replace("T", " ");
    return `${nombre} @ ${fecha} UTC`;
  }
  if (d.points.length === 1) return `${nombre} @ ${formatMoney(primero.price)}`;

  return `${nombre}: ${formatMoney(primero.price)} → ${formatMoney(ultimo.price)}`;
}


/**
 * El resumen de lo que pasó en el momento que se pulsó.
 *
 * Va debajo del gráfico y no flotando encima: un panel sobre las velas tapa
 * justo lo que se acaba de pulsar para poder mirarlo.
 *
 * La hora se formatea en la zona del navegador a propósito, no en la del
 * usuario configurada en la aplicación: el eje del gráfico usa la del
 * navegador, y que el panel dijera una hora distinta de la que se está
 * señalando en el eje sería peor que no decir ninguna.
 */
function PinnedFillSummary({ group, onClose }: { group: FillGroup; onClose: () => void }) {
  const hora = new Date(group.time * 1000).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium">
            {group.role === null
              ? "Entrada y salida a la vez"
              : group.role === "ENTRY"
                ? "Entrada"
                : "Salida"}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{hora}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {group.role !== "EXIT" ? (
          <Figure label="Contratos entrados" value={group.entryQty} />
        ) : null}
        {group.role !== "ENTRY" ? <Figure label="Contratos salidos" value={group.exitQty} /> : null}
        <Figure label="Precio medio" value={formatMoney(Number(group.wap))} />
        <Figure label="Ejecuciones" value={String(group.fills.length)} />
      </div>

      {/* Las ejecuciones una a una sólo cuando fueron varias: con una, la
          tabla repetiría lo que ya dicen las cifras de arriba. */}
      {group.fills.length > 1 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="py-1 pr-3 text-right font-medium">Contratos</th>
                <th className="py-1 text-right font-medium">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {group.fills.map((fill, i) => (
                <tr key={`${fill.time}-${fill.price}-${i}`}>
                  <td className="py-1 pr-3">{fill.role === "ENTRY" ? "Entrada" : "Salida"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fill.size}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(fill.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}
