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
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";

import { GRANULARITY_LABELS, GRANULARITY_SECONDS } from "@/lib/analytics/chart-window";
import { conAlfa, resolverTemaCanvas, type TemaCanvas } from "@/lib/charts/tema-canvas";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { formatHorizonLabel, type ReactionCandle } from "@/lib/economic-calendar/market-reaction";
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

const ALTO = 320;

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

interface Vela extends ReactionCandle {
  time: number;
}

function ordenarYFundir(actuales: Vela[], nuevas: Vela[]): Vela[] {
  const porTiempo = new Map(actuales.map((c) => [c.time, c]));
  for (const c of nuevas) porTiempo.set(c.time, c);
  return [...porTiempo.values()].sort((a, b) => a.time - b.time);
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
    async (desde: number, hasta: number, reemplazar = false) => {
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
        if (!data.candles || data.candles.length === 0) return;
        setVelas((actuales) => (reemplazar ? data.candles! : ordenarYFundir(actuales, data.candles!)));
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
    const { antes, despues } = VENTANA_INICIAL[granularity];
    chart.timeScale().setVisibleRange({
      from: (t0 - Math.min(antes, 45) * 60) as UTCTimestamp,
      to: (t0 + Math.min(despues, 90) * 60) as UTCTimestamp,
    });
  }, [granularity, t0]);

  // Crear el gráfico. Se rehace cuando cambia la temporalidad o el tema,
  // nunca cuando llegan velas: recrearlo al recibir datos tiraría el zoom y
  // el desplazamiento que la persona acaba de hacer.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tema: TemaCanvas = resolverTemaCanvas();
    const chart = createChart(container, {
      width: container.clientWidth,
      height: ALTO,
      layout: {
        background: { type: ColorType.Solid, color: tema.fondo },
        textColor: tema.texto,
      },
      grid: { vertLines: { color: tema.rejilla }, horzLines: { color: tema.rejilla } },
      rightPriceScale: { borderColor: tema.rejilla },
      handleScale: { axisPressedMouseMove: { price: true, time: true } },
      timeScale: {
        borderColor: tema.rejilla,
        timeVisible: true,
        secondsVisible: false,
        // Las horas del eje, en la zona de quien mira. Sin esto la librería
        // las pinta en UTC y el gráfico contradiría a la tabla de al lado.
        tickMarkFormatter: (time: Time) => formatearHora(time as number, "HH:mm"),
      },
      localization: {
        locale: "es-ES",
        timeFormatter: (time: Time) => formatearHora(time as number, "dd LLL HH:mm"),
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: tema.sube,
      downColor: tema.baja,
      borderUpColor: tema.sube,
      borderDownColor: tema.baja,
      wickUpColor: tema.sube,
      wickDownColor: tema.baja,
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
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(alMoverCursor);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(alDesplazar);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
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
    const referencia = velas.filter((c) => c.time < t0).at(-1)?.close ?? null;
    if (referencia !== null) {
      series.createPriceLine({
        price: referencia,
        color: conAlfa(tema.texto, 0.7),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: "antes del dato",
      });
    }

    // El momento de la publicación y el final del plazo medido. Son
    // marcadores y no líneas verticales porque es lo que la librería sostiene
    // de forma estable al ampliar y desplazar.
    const velaDelEvento = velas.find((c) => c.time + segundos > t0)?.time ?? null;
    const finPlazo = t0 + horizonMinutes * 60;
    const velaDelFin = velas.find((c) => c.time + segundos > finPlazo)?.time ?? null;

    createSeriesMarkers(series, [
      ...(velaDelEvento !== null
        ? [
            {
              time: velaDelEvento as UTCTimestamp,
              position: "aboveBar" as const,
              color: tema.salida,
              shape: "arrowDown" as const,
              text: "se publica",
            },
          ]
        : []),
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
    ]);
  }, [velas, t0, segundos, horizonMinutes]);

  // La vista inicial, sólo la primera vez que hay datos para una
  // temporalidad: después manda quien mira.
  const encuadradoRef = useRef<string | null>(null);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || velas.length === 0 || encuadradoRef.current === granularity) return;
    encuadradoRef.current = granularity;
    const { antes, despues } = VENTANA_INICIAL[granularity];
    chart.timeScale().setVisibleRange({
      from: (t0 - Math.min(antes, 45) * 60) as UTCTimestamp,
      to: (t0 + Math.min(despues, 90) * 60) as UTCTimestamp,
    });
  }, [velas, granularity, t0]);

  const mostrada = cursor ?? velas.at(-1) ?? null;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TEMPORALIDADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => cambiarTemporalidad(g)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                granularity === g
                  ? "border-border bg-secondary text-secondary-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent",
              )}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
          <button
            type="button"
            onClick={volverAlMomento}
            className="ml-1 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            Volver al momento
          </button>
          {cargando ? <span className="text-xs text-muted-foreground">cargando…</span> : null}
        </div>

        {/* Los precios de la vela bajo el cursor, en una barra fija y no en
            un globo flotante: un globo tapa justo la zona que se mira. */}
        {mostrada ? (
          <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{formatearHora(mostrada.time, "dd LLL HH:mm")}</span>
            <span>A {mostrada.open}</span>
            <span>M {mostrada.high}</span>
            <span>m {mostrada.low}</span>
            <span className={mostrada.close >= mostrada.open ? "text-positive" : "text-negative"}>
              C {mostrada.close}
            </span>
          </div>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-md border border-border"
        style={{ height: ALTO }}
      />

      <figcaption className="text-xs text-muted-foreground">
        {productId} · arrastra para moverte en el tiempo y usa la rueda para ampliar; al llegar al
        borde se traen más velas. La línea de puntos es el precio justo antes del dato, y las flechas
        marcan la publicación y el final del plazo de {formatHorizonLabel(horizonMinutes)} que miden
        las cifras. Horas en tu zona.
      </figcaption>
    </figure>
  );
}
