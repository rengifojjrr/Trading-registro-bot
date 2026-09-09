import { DateTime } from "luxon";

import {
  aggregateCandles,
  chartWindowFor,
  formatHorizonLabel,
  type ReactionCandle,
} from "@/lib/economic-calendar/market-reaction";

/**
 * Qué hizo el precio alrededor de la publicación.
 *
 * SVG propio y pintado en el servidor, no una librería de gráficos. Son ciento
 * veinte velas en una ventana fija y lo único que hace falta encima es una
 * marca en el instante exacto -- que es justo lo que una librería general no
 * da sin pelearse con ella. El gráfico grande de una operación sí usa
 * `lightweight-charts`, porque allí hay zoom, herramientas de dibujo e
 * indicadores; aquí nada de eso aporta.
 *
 * Aquí el verde y el rojo **sí** son los del dinero: una vela verde es el
 * precio subiendo. No es una opinión sobre el dato, es lo que pasó.
 */

const ALTO = 220;
const ANCHO = 900;
const MARGEN = { arriba: 8, derecha: 52, abajo: 22, izquierda: 8 };

export function ReactionChart({
  candles,
  eventAt,
  timezone,
  productId,
  horizonMinutes,
}: {
  candles: ReactionCandle[];
  eventAt: string;
  timezone: string;
  productId: string;
  /** El plazo que se está mirando: decide cuánto se enseña y de qué tamaño las velas. */
  horizonMinutes: number;
}) {
  const t0 = Math.floor(new Date(eventAt).getTime() / 1000);
  const { beforeMin, afterMin, groupMin } = chartWindowFor(horizonMinutes);

  const recortadas = candles.filter(
    (c) => c.time >= t0 - beforeMin * 60 && c.time <= t0 + afterMin * 60,
  );
  const ordenadas = aggregateCandles(recortadas, groupMin);
  if (ordenadas.length < 2) return null;

  // Dónde acaba el plazo medido, para sombrearlo: sin esto, las cifras de
  // debajo («a 2 h») no se corresponden visiblemente con nada del dibujo.
  const tFinHorizonte = t0 + horizonMinutes * 60;

  const tMin = ordenadas[0].time;
  const tMax = ordenadas[ordenadas.length - 1].time;
  const pMin = Math.min(...ordenadas.map((c) => c.low));
  const pMax = Math.max(...ordenadas.map((c) => c.high));
  // Un respiro arriba y abajo para que la vela más alta no toque el borde.
  const respiro = (pMax - pMin) * 0.08 || 1;
  const yMin = pMin - respiro;
  const yMax = pMax + respiro;

  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

  const x = (time: number) =>
    MARGEN.izquierda + ((time - tMin) / Math.max(tMax - tMin, 1)) * anchoUtil;
  const y = (precio: number) =>
    MARGEN.arriba + ((yMax - precio) / Math.max(yMax - yMin, 1e-9)) * altoUtil;

  // Una vela por minuto: el ancho sale del hueco entre dos, con un mínimo
  // visible para que no se conviertan en pelos.
  const anchoVela = Math.max(1.2, (anchoUtil / ordenadas.length) * 0.66);

  const referencia = ordenadas.filter((c) => c.time < t0).at(-1)?.close ?? null;
  const xEvento = x(t0);

  const etiquetasPrecio = [yMax - respiro, (yMin + yMax) / 2, yMin + respiro];
  const etiquetasHora = marcasDeHora(ordenadas, timezone);
  const formatoPrecio = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-56 w-full"
        role="img"
        aria-label={`Precio de ${productId} alrededor de la publicación`}
        preserveAspectRatio="none"
      >
        {/* El tramo que miden las cifras de abajo, sombreado. Va lo primero
            de todo para que no tape ni una vela. */}
        <rect
          x={xEvento}
          y={MARGEN.arriba}
          width={Math.max(0, Math.min(x(tFinHorizonte), MARGEN.izquierda + anchoUtil) - xEvento)}
          height={altoUtil}
          className="fill-warning/5"
        />

        {/* Rejilla y precios, primero: todo lo demás va encima. */}
        {etiquetasPrecio.map((precio) => (
          <g key={precio}>
            <line
              x1={MARGEN.izquierda}
              x2={MARGEN.izquierda + anchoUtil}
              y1={y(precio)}
              y2={y(precio)}
              className="stroke-border"
              strokeWidth={0.5}
            />
            <text
              x={MARGEN.izquierda + anchoUtil + 6}
              y={y(precio) + 3}
              className="fill-muted-foreground text-[9px]"
            >
              {formatoPrecio.format(precio)}
            </text>
          </g>
        ))}

        {etiquetasHora.map((marca) => (
          <text
            key={marca.time}
            x={x(marca.time)}
            y={ALTO - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {marca.label}
          </text>
        ))}

        {/* El precio justo antes del dato: la línea contra la que se mide todo. */}
        {referencia !== null ? (
          <line
            x1={MARGEN.izquierda}
            x2={MARGEN.izquierda + anchoUtil}
            y1={y(referencia)}
            y2={y(referencia)}
            className="stroke-muted-foreground"
            strokeWidth={0.75}
            strokeDasharray="3 3"
          />
        ) : null}

        {ordenadas.map((vela) => {
          const sube = vela.close >= vela.open;
          const clase = sube ? "fill-positive stroke-positive" : "fill-negative stroke-negative";
          const cuerpoArriba = y(Math.max(vela.open, vela.close));
          const cuerpoAlto = Math.max(1, Math.abs(y(vela.open) - y(vela.close)));
          const cx = x(vela.time);
          const hora = DateTime.fromSeconds(vela.time, { zone: "utc" })
            .setZone(timezone)
            .toFormat("HH:mm");

          return (
            <g key={vela.time} className={clase}>
              <title>{`${hora} · apertura ${vela.open} · cierre ${vela.close}`}</title>
              <line x1={cx} x2={cx} y1={y(vela.high)} y2={y(vela.low)} strokeWidth={0.75} />
              <rect x={cx - anchoVela / 2} y={cuerpoArriba} width={anchoVela} height={cuerpoAlto} />
            </g>
          );
        })}

        {/* La publicación. Va la última para que no la tape ninguna vela: es
            la única razón por la que se mira este gráfico. */}
        <line
          x1={xEvento}
          x2={xEvento}
          y1={MARGEN.arriba}
          y2={MARGEN.arriba + altoUtil}
          className="stroke-warning"
          strokeWidth={1.25}
          strokeDasharray="4 2"
        />
        <text
          x={xEvento + 4}
          y={MARGEN.arriba + 9}
          className="fill-warning text-[9px] font-medium"
        >
          se publica
        </text>
      </svg>

      <figcaption className="text-xs text-muted-foreground">
        {productId} · velas de {groupMin === 1 ? "un minuto" : `${groupMin} minutos`} · la línea de
        puntos horizontal es el precio justo antes del dato, y la zona sombreada el plazo de{" "}
        {formatHorizonLabel(horizonMinutes)} que miden las cifras. Horas en tu zona.
      </figcaption>
    </figure>
  );
}

/** Cuatro marcas horarias repartidas, en la zona del usuario. */
function marcasDeHora(candles: ReactionCandle[], timezone: string) {
  const paso = Math.max(1, Math.floor(candles.length / 4));
  const marcas: Array<{ time: number; label: string }> = [];

  for (let i = 0; i < candles.length; i += paso) {
    marcas.push({
      time: candles[i].time,
      label: DateTime.fromSeconds(candles[i].time, { zone: "utc" })
        .setZone(timezone)
        .toFormat("HH:mm"),
    });
  }
  return marcas;
}
