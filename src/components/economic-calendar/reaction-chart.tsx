"use client";

import { DateTime } from "luxon";
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
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2, LocateFixed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GRANULARITY_LABELS, GRANULARITY_SECONDS } from "@/lib/analytics/chart-window";
import { conAlfa, resolverTemaCanvas, type TemaCanvas } from "@/lib/charts/tema-canvas";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import {
  formatHorizonLabel,
  formatSignedPct,
  type ReactionCandle,
} from "@/lib/economic-calendar/market-reaction";
import { cn } from "@/lib/utils";

/**
 * Qué hizo el precio alrededor de la publicación, en un gráfico de verdad.
 *
 * Empezó siendo un SVG fijo: se veía la ventana que la aplicación decidía y
 * ni una vela más. Servía para responder «cuánto se movió», y no para lo
 * siguiente que uno quiere hacer, que es mirar antes y después -- qué venía
 * haciendo el precio esa mañana, si el movimiento aguantó a la tarde. Para eso
 * hace falta desplazar y ampliar, y eso es un gráfico, no un dibujo.
 *
 * Usa `lightweight-charts` y la paleta de `lib/charts/tema-canvas`, que ya era
 * el sitio único donde se resuelven los tokens para un canvas y de donde beben
 * las gráficas de operaciones y de bots: dos gráficos de la misma aplicación
 * que se ven distintos parecen dos aplicaciones.
 *
 * Lo que **no** trae, y a propósito: herramientas de dibujo, indicadores ni
 * capturas. Todo eso vive en el gráfico de una operación y se guarda contra
 * ella (`chart_drawings.trade_id`); aquí no hay operación a la que atarlo, y
 * una línea de tendencia sobre la reacción del IPC de mayo no es algo que
 * nadie vaya a volver a mirar.
 */

/**
 * Cuánto se trae de cada temporalidad, en minutos alrededor de la
 * publicación. Cada una cabe en las 300 velas por petición que devuelve
 * Coinbase, y al desplazarse se piden más tramos.
 */
const VENTANA_INICIAL: Record<CoinbaseCandleGranularity, { antes: number; despues: number }> = {
  ONE_MINUTE: { antes: 60, despues: 240 },
  FIVE_MINUTE: { antes: 300, despues: 1_200 },
  FIFTEEN_MINUTE: { antes: 900, despues: 3_600 },
  THIRTY_MINUTE: { antes: 1_800, despues: 7_200 },
  ONE_HOUR: { antes: 3_600, despues: 14_400 },
  TWO_HOUR: { antes: 7_200, despues: 28_800 },
  FOUR_HOUR: { antes: 14_400, despues: 57_600 },
  SIX_HOUR: { antes: 21_600, despues: 86_400 },
  ONE_DAY: { antes: 86_400, despues: 345_600 },
};

/** Las que tienen sentido para leer la reacción a un dato. */
const TEMPORALIDADES: CoinbaseCandleGranularity[] = [
  "ONE_MINUTE",
  "FIVE_MINUTE",
  "FIFTEEN_MINUTE",
  "ONE_HOUR",
];

/** A cuántas velas del borde se pide el tramo siguiente. */
const MARGEN_VELAS = 15;

/**
 * Cuántas velas se ven al abrir, a cada lado de la publicación.
 *
 * En velas y no en minutos: es lo que hace que el encuadre se vea igual de
 * bien en un minuto que en una hora. Más después que antes porque lo que se
 * viene a mirar es la reacción, no lo que había antes.
 */
const VELAS_ANTES = 30;
const VELAS_DESPUES = 70;

const PRECIO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

interface Vela extends ReactionCandle {
  time: number;
}

function ordenarYFundir(actuales: Vela[], nuevas: Vela[]): Vela[] {
  const porTiempo = new Map(actuales.map((c) => [c.time, c]));
  for (const c of nuevas) porTiempo.set(c.time, c);
  return [...porTiempo.values()].sort((a, b) => a.time - b.time);
}

/** El cierre de la última vela anterior a la publicación: la referencia de todo. */
function precioAntes(velas: Vela[], t0: number): number | null {
  for (let i = velas.length - 1; i >= 0; i -= 1) {
    if (velas[i].time < t0) return velas[i].close;
  }
  return null;
}

export function ReactionChart({
  eventAt,
  timezone,
  productId,
  initialCandles,
  horizonMinutes,
}: {
  eventAt: string;
  timezone: string;
  productId: string;
  /** Las de un minuto que ya trajo el servidor, para pintar sin esperar. */
  initialCandles: ReactionCandle[];
  /** El plazo que miden las cifras de debajo: se marca en el gráfico. */
  horizonMinutes: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const cargandoRef = useRef(false);
  const velasRef = useRef<Vela[]>([]);
  // La línea de precio y los marcadores se reutilizan en vez de crearse otra
  // vez con cada tramo de velas: crearlos de nuevo los apila.
  const priceLineRef = useRef<IPriceLine | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [granularity, setGranularity] = useState<CoinbaseCandleGranularity>("ONE_MINUTE");
  const [velas, setVelas] = useState<Vela[]>(() => [...initialCandles].sort((a, b) => a.time - b.time));
  const [cargando, setCargando] = useState(false);
  const [cursor, setCursor] = useState<Vela | null>(null);

  const t0 = Math.floor(new Date(eventAt).getTime() / 1000);
  const segundos = GRANULARITY_SECONDS[granularity];

  // Las velas, también en un ref. Los manejadores del gráfico -- el del cursor
  // y el del desplazamiento -- se registran una vez, en el efecto que lo crea,
  // así que no ven el estado de renders posteriores; leerlas de aquí es lo que
  // les deja trabajar con las actuales sin tener que recrear el gráfico cada
  // vez que llega un tramo, que tiraría el zoom de quien lo está mirando.
  useEffect(() => {
    velasRef.current = velas;
  }, [velas]);

  const formatearHora = useCallback(
    (t: number, patron: string) =>
      DateTime.fromSeconds(t, { zone: "utc" }).setZone(timezone).toFormat(patron),
    [timezone],
  );

  /** Trae un tramo y lo funde con lo que ya hay. */
  const traerTramo = useCallback(
    async (desde: number, hasta: number) => {
      if (cargandoRef.current) return;
      cargandoRef.current = true;
      setCargando(true);
      try {
        const params = new URLSearchParams({
          granularity,
          start: String(Math.floor(desde)),
          end: String(Math.ceil(hasta)),
          productId,
        });
        const res = await fetch(`/api/economic-calendar/candles?${params}`);
        const data = (await res.json()) as { candles: Vela[] | null };
        const nuevas = data.candles;
        if (!nuevas || nuevas.length === 0) return;
        setVelas((actuales) => ordenarYFundir(actuales, nuevas));
      } catch {
        // Sin red se queda lo que ya estaba dibujado, que es lo correcto:
        // un gráfico es contexto, no una cifra de la que dependa nada.
      } finally {
        cargandoRef.current = false;
        setCargando(false);
      }
    },
    [granularity, productId],
  );

  /** Cambiar de temporalidad recarga la ventana entera centrada en el dato. */
  const cambiarTemporalidad = useCallback(
    (nueva: CoinbaseCandleGranularity) => {
      if (nueva === granularity) return;
      setGranularity(nueva);
      // Se vacían las velas a la vez. Las que hay son de la temporalidad
      // anterior: dejarlas puestas las pintaría un instante con el ancho de
      // vela nuevo y, peor, el encuadre inicial se calcularía sobre ellas y
      // luego ya no se recalcularía, dejando el gráfico descuadrado.
      setVelas([]);
      const { antes, despues } = VENTANA_INICIAL[nueva];
      // Se pide con la granularidad nueva, no con la del estado todavía sin
      // aplicar: por eso la petición va aquí y no en un efecto que dependa
      // de `granularity`, que llegaría un render tarde.
      cargandoRef.current = false;
      void (async () => {
        cargandoRef.current = true;
        setCargando(true);
        try {
          const params = new URLSearchParams({
            granularity: nueva,
            start: String(t0 - antes * 60),
            end: String(t0 + despues * 60),
            productId,
          });
          const res = await fetch(`/api/economic-calendar/candles?${params}`);
          const data = (await res.json()) as { candles: Vela[] | null };
          if (data.candles && data.candles.length > 0) setVelas(data.candles);
        } catch {
          // Se queda la temporalidad nueva sin datos nuevos; el botón de
          // volver al momento la recarga.
        } finally {
          cargandoRef.current = false;
          setCargando(false);
        }
      })();
    },
    [granularity, productId, t0],
  );

  const volverAlMomento = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().setVisibleRange({
      from: (t0 - VELAS_ANTES * segundos) as UTCTimestamp,
      to: (t0 + VELAS_DESPUES * segundos) as UTCTimestamp,
    });
  }, [t0, segundos]);

  // Crear el gráfico. Se rehace cuando cambia la temporalidad o el tema,
  // nunca cuando llegan velas: recrearlo al recibir datos tiraría el zoom y
  // el desplazamiento que la persona acaba de hacer.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tema: TemaCanvas = resolverTemaCanvas();
    const chart = createChart(container, {
      width: container.clientWidth,
      // El alto lo decide el CSS -- el contenedor crece en pantalla grande --
      // y el gráfico lo sigue, en vez de al revés.
      height: container.clientHeight || 320,
      layout: {
        background: { type: ColorType.Solid, color: tema.fondo },
        textColor: tema.texto,
        attributionLogo: false,
      },
      grid: {
        // La rejilla es referencia, no dibujo: las horizontales ayudan a leer
        // el precio y las verticales sólo troceaban el fondo.
        horzLines: { color: conAlfa(tema.rejilla, 0.6) },
        vertLines: { visible: false },
      },
      rightPriceScale: {
        borderColor: tema.rejilla,
        // Sin esto las velas tocan el borde de arriba y el de abajo, y las
        // flechas de los marcadores salen recortadas.
        scaleMargins: { top: 0.14, bottom: 0.14 },
      },
      handleScale: { axisPressedMouseMove: { price: true, time: true } },
      timeScale: {
        borderColor: tema.rejilla,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        // Las horas del eje, en la zona de quien mira. Sin esto la librería
        // las pinta en UTC y el gráfico contradiría a la tabla de al lado.
        tickMarkFormatter: (time: Time) => formatearHora(time as number, "HH:mm"),
      },
      localization: {
        locale: "es-ES",
        timeFormatter: (time: Time) => formatearHora(time as number, "dd LLL HH:mm"),
        // Un bitcoin vale 77284.77 sin separadores y 77.284,77 con ellos; lo
        // segundo se lee de un vistazo y lo primero hay que contarlo.
        priceFormatter: (precio: number) => PRECIO.format(precio),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: conAlfa(tema.texto, 0.45),
          style: LineStyle.Dotted,
          labelBackgroundColor: tema.rejilla,
        },
        horzLine: {
          color: conAlfa(tema.texto, 0.45),
          style: LineStyle.Dotted,
          labelBackgroundColor: tema.rejilla,
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: tema.sube,
      downColor: tema.baja,
      borderUpColor: tema.sube,
      borderDownColor: tema.baja,
      wickUpColor: conAlfa(tema.sube, 0.8),
      wickDownColor: conAlfa(tema.baja, 0.8),
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const alMoverCursor = (param: MouseEventParams) => {
      const t = param.time as number | undefined;
      setCursor(t === undefined ? null : (velasRef.current.find((c) => c.time === t) ?? null));
    };
    chart.subscribeCrosshairMove(alMoverCursor);

    // Al llegar cerca de un borde, pedir el tramo de al lado. Es lo que
    // convierte «la ventana que decidió la aplicación» en «mira lo que
    // quieras»: hacia atrás para ver qué venía haciendo el precio esa
    // mañana, hacia delante para ver si el movimiento aguantó.
    const alDesplazar = () => {
      const rango = chart.timeScale().getVisibleLogicalRange();
      const actuales = velasRef.current;
      if (!rango || actuales.length === 0 || cargandoRef.current) return;

      const paso = GRANULARITY_SECONDS[granularity];
      if (rango.from < MARGEN_VELAS) {
        const primera = actuales[0].time;
        void traerTramo(primera - 300 * paso, primera - paso);
      } else if (rango.to > actuales.length - MARGEN_VELAS) {
        const ultima = actuales[actuales.length - 1].time;
        // Nunca más allá de ahora: pedir el futuro devuelve vacío y volvería
        // a pedirlo en cada desplazamiento.
        const tope = Math.floor(Date.now() / 1000);
        if (ultima < tope) void traerTramo(ultima + paso, Math.min(ultima + 300 * paso, tope));
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(alDesplazar);

    const observer = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight || 320,
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(alMoverCursor);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(alDesplazar);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      // Colgaban del gráfico que acaba de irse: dejarlas apuntando a él haría
      // que el siguiente intentara borrar una línea de una serie muerta.
      priceLineRef.current = null;
      markersRef.current = null;
    };
  }, [granularity, formatearHora, traerTramo]);

  // Los datos van aparte de la creación, por lo mismo: llegan velas nuevas
  // cada vez que alguien se desplaza, y rehacer el gráfico entonces sería
  // devolverle la vista al sitio en cada arrastre.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || velas.length === 0) return;

    series.setData(
      velas.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const tema = resolverTemaCanvas();

    // El precio justo antes del dato: la línea contra la que se mide todo.
    //
    // Se borra la anterior antes de poner la nueva. Sin esto se apilaba una
    // por cada tramo de velas que llegaba, y el gráfico acababa con tres
    // etiquetas «antes del dato» superpuestas en el eje -- que además no eran
    // el mismo precio, porque al traer velas más antiguas cambia cuál es la
    // última anterior a la publicación.
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    const referencia = precioAntes(velas, t0);
    if (referencia !== null) {
      priceLineRef.current = series.createPriceLine({
        price: referencia,
        color: conAlfa(tema.texto, 0.7),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        axisLabelTextColor: tema.fondo,
        // Corto a propósito: el título se pinta *dentro* del área del gráfico,
        // pegado al eje, y «antes del dato» tapaba las últimas velas.
        title: "previo",
      });
    }

    // El momento de la publicación y el final del plazo medido. Son
    // marcadores y no líneas verticales porque es lo que la librería sostiene
    // de forma estable al ampliar y desplazar.
    const velaDelEvento = velas.find((c) => c.time + segundos > t0)?.time ?? null;
    const finPlazo = t0 + horizonMinutes * 60;
    const velaDelFin = velas.find((c) => c.time + segundos > finPlazo)?.time ?? null;

    const marcadores = [
      ...(velaDelEvento !== null
        ? [
            {
              time: velaDelEvento as UTCTimestamp,
              position: "aboveBar" as const,
              color: tema.salida,
              shape: "arrowDown" as const,
              // Una palabra: el texto va centrado sobre la flecha y la flecha
              // cae cerca del borde izquierdo, así que «se publica» salía
              // recortado a «publica» en una pantalla de móvil.
              text: "dato",
            },
          ]
        : []),
      // En una temporalidad grande el final del plazo cae en la misma vela que
      // la publicación; entonces la flecha no marcaría nada y sobra.
      ...(velaDelFin !== null && velaDelFin !== velaDelEvento
        ? [
            {
              time: velaDelFin as UTCTimestamp,
              position: "belowBar" as const,
              color: conAlfa(tema.texto, 0.8),
              shape: "arrowUp" as const,
              text: formatHorizonLabel(horizonMinutes),
            },
          ]
        : []),
    ];

    // La misma primitiva, actualizada. Llamar a `createSeriesMarkers` otra vez
    // añadiría una capa nueva sobre la anterior en cada refresco.
    if (markersRef.current) markersRef.current.setMarkers(marcadores);
    else markersRef.current = createSeriesMarkers(series, marcadores);
  }, [velas, t0, segundos, horizonMinutes]);

  // La vista inicial, sólo la primera vez que hay datos para una
  // temporalidad: después manda quien mira.
  //
  // Se encuadra contando **velas**, no minutos. Con minutos fijos, cambiar a
  // una hora pedía enseñar los 45 minutos anteriores al dato -- menos de una
  // vela -- y el gráfico salía descuadrado, con el dato pegado a un borde y
  // el resto vacío.
  const encuadradoRef = useRef<string | null>(null);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || velas.length === 0 || encuadradoRef.current === granularity) return;
    encuadradoRef.current = granularity;
    chart.timeScale().setVisibleRange({
      from: (t0 - VELAS_ANTES * segundos) as UTCTimestamp,
      to: (t0 + VELAS_DESPUES * segundos) as UTCTimestamp,
    });
  }, [velas, granularity, t0, segundos]);

  const mostrada = cursor ?? velas.at(-1) ?? null;
  const referencia = precioAntes(velas, t0);
  const desdeLaReferencia =
    mostrada && referencia ? ((mostrada.close - referencia) / referencia) * 100 : null;

  return (
    <figure className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Envuelve: en un móvil, la etiqueta, el control y «Centrar» no caben
            en una línea, y sin esto se partían las palabras de los botones --
            «1 min» salía en dos renglones. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Velas de</span>
          {/* Un control segmentado y no cuatro botones sueltos: así se lee que
              son opciones de lo mismo y no cuatro acciones distintas. */}
          <div className="flex shrink-0 items-center rounded-md border border-border bg-secondary/30 p-0.5">
            {TEMPORALIDADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => cambiarTemporalidad(g)}
                aria-pressed={granularity === g}
                className={cn(
                  "whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                  granularity === g
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {GRANULARITY_LABELS[g]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={volverAlMomento}
            title="Volver a encuadrar el gráfico sobre la publicación"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LocateFixed className="size-3.5" aria-hidden />
            Centrar
          </button>
          {cargando ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="cargando velas" />
          ) : null}
        </div>

        {/* Los precios de la vela bajo el cursor, en una barra fija y no en
            un globo flotante: un globo tapa justo la zona que se mira. */}
        {mostrada ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <span className="text-muted-foreground">{formatearHora(mostrada.time, "dd LLL HH:mm")}</span>
            <Ohlc etiqueta="A" valor={mostrada.open} />
            <Ohlc etiqueta="Máx" valor={mostrada.high} />
            <Ohlc etiqueta="Mín" valor={mostrada.low} />
            <Ohlc
              etiqueta="C"
              valor={mostrada.close}
              className={mostrada.close >= mostrada.open ? "text-positive" : "text-negative"}
            />
            {/* Lo que de verdad se viene a leer: dónde está esta vela respecto
                al precio de justo antes del dato, no respecto a su apertura. */}
            {desdeLaReferencia !== null ? (
              <span
                className={cn(
                  "rounded bg-secondary/60 px-1.5 py-0.5 font-medium",
                  desdeLaReferencia > 0 && "text-positive",
                  desdeLaReferencia < 0 && "text-negative",
                )}
                title="Respecto al precio justo antes de la publicación"
              >
                {formatSignedPct(desdeLaReferencia)} vs. antes
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-lg border border-border sm:h-[420px]"
      />

      <figcaption className="text-xs leading-relaxed text-muted-foreground">
        {productId} · arrastra para moverte en el tiempo y usa la rueda para ampliar; al llegar al
        borde se traen más velas. La línea de puntos es el precio justo antes del dato, y las flechas
        marcan la publicación y el final del plazo de {formatHorizonLabel(horizonMinutes)} que miden
        las cifras. Horas en tu zona.
      </figcaption>
    </figure>
  );
}

function Ohlc({
  etiqueta,
  valor,
  className,
}: {
  etiqueta: string;
  valor: number;
  className?: string;
}) {
  return (
    <span className={cn("text-foreground", className)}>
      <span className="mr-0.5 text-muted-foreground">{etiqueta}</span>
      {PRECIO.format(valor)}
    </span>
  );
}
