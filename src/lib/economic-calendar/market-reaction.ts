/**
 * Qué hizo el precio cuando salió el dato.
 *
 * Puro: recibe velas y un instante, devuelve números. Sin red y sin base de
 * datos, para poder probarlo contra casos escritos a mano y contra velas
 * reales guardadas (`market-reaction.real.test.ts`).
 *
 * Es la parte honesta de «qué podría pasar»: no una predicción, sino lo que de
 * hecho pasó las veces anteriores. Se mide en porcentaje y no en dólares
 * porque el precio de referencia cambia entre publicaciones -- un movimiento
 * de 400 dólares no significa lo mismo a 63.000 que a 78.000.
 *
 * Y se mide a varios plazos, no a uno. Un dato puede tirar el precio en el
 * primer minuto y devolverlo en veinte, o no hacer nada en una hora y arrancar
 * a la tercera; con una sola cifra las dos cosas se ven iguales.
 */

export interface ReactionCandle {
  /** Inicio de la vela, en segundos unix. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Los plazos que se miden. Cuatro: más columnas se leen peor de lo que informan. */
export const HORIZONS = [15, 60, 120, 240] as const;
export type HorizonMinutes = (typeof HORIZONS)[number];

export const DEFAULT_HORIZON: HorizonMinutes = 60;

export function isHorizon(value: number): value is HorizonMinutes {
  return (HORIZONS as readonly number[]).includes(value);
}

export function formatHorizonLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
}

export interface HorizonMeasure {
  minutes: number;
  /** Dónde acabó el precio al final del plazo, en % sobre la referencia. */
  changePct: number | null;
  /** El mayor alejamiento del punto cero dentro del plazo, en el sentido que fuera. */
  maxMovePct: number | null;
  /** Del máximo al mínimo dentro del plazo, sobre la referencia. */
  rangePct: number | null;
  high: number | null;
  low: number | null;
}

export interface MarketReaction {
  /** Cierre de la última vela cerrada antes de la publicación. Es el punto cero. */
  reference: number;
  horizons: HorizonMeasure[];
}

/**
 * Cuánto puede faltar de velas al final de un plazo antes de darlo por no
 * medible.
 *
 * Un minuto suelto sin operaciones es normal y no debe invalidar nada; que
 * falte media hora significa que el histórico no llega hasta ahí, y entonces
 * la respuesta correcta es «no se sabe». Sin este margen, el precio de la
 * última vela disponible se colaría como si fuera el de las cuatro horas.
 */
const TOLERANCIA_MIN = 5;

/**
 * Mide la reacción alrededor de `eventAt`, a cada plazo.
 *
 * Devuelve null si no hay una vela **anterior** a la publicación: sin punto
 * cero no hay nada contra lo que medir, y usar la primera vela posterior como
 * referencia escondería justo el movimiento que se quiere ver -- el del minuto
 * de la publicación.
 */
export function measureReaction(
  candles: ReactionCandle[],
  eventAt: Date,
  horizons: readonly number[] = HORIZONS,
): MarketReaction | null {
  if (candles.length === 0) return null;

  const t0 = Math.floor(eventAt.getTime() / 1000);
  const ordenadas = [...candles].sort((a, b) => a.time - b.time);

  const previas = ordenadas.filter((c) => c.time < t0);
  if (previas.length === 0) return null;
  const reference = previas[previas.length - 1].close;
  if (!Number.isFinite(reference) || reference === 0) return null;

  const posteriores = ordenadas.filter((c) => c.time >= t0);
  if (posteriores.length === 0) return null;

  const pct = (valor: number) => ((valor - reference) / reference) * 100;

  const medidas = horizons.map<HorizonMeasure>((minutes) => {
    const fin = t0 + minutes * 60;
    const dentro = posteriores.filter((c) => c.time <= fin);

    // Sin velas cerca del final del plazo no se mide: el histórico no llega.
    const ultima = dentro.at(-1);
    if (!ultima || ultima.time < fin - TOLERANCIA_MIN * 60) {
      return { minutes, changePct: null, maxMovePct: null, rangePct: null, high: null, low: null };
    }

    const high = Math.max(...dentro.map((c) => c.high));
    const low = Math.min(...dentro.map((c) => c.low));

    return {
      minutes,
      changePct: pct(ultima.close),
      // El mayor alejamiento del punto cero, mire hacia donde mire. Responde a
      // «¿cuánto llegó a moverse?», que no es lo mismo que «¿dónde acabó?»: un
      // dato puede tirar el precio un 2 % y devolverlo en veinte minutos, y
      // para quien opera apalancado ese viaje de ida importa tanto como el
      // destino.
      maxMovePct: Math.max(Math.abs(pct(high)), Math.abs(pct(low))),
      rangePct: ((high - low) / reference) * 100,
      high,
      low,
    };
  });

  return { reference, horizons: medidas };
}

/** La medida de un plazo concreto, o null si no se midió. */
export function horizonOf(reaction: MarketReaction, minutes: number): HorizonMeasure | null {
  return reaction.horizons.find((h) => h.minutes === minutes) ?? null;
}

/**
 * Junta velas de un minuto en velas de N minutos.
 *
 * Para el gráfico, no para las cifras: cuatro horas son doscientas cuarenta
 * velas de un minuto, y en el ancho de una tarjeta se convierten en pelos
 * ilegibles. Las medidas siempre se calculan sobre el minuto, que es donde
 * está el movimiento de verdad.
 *
 * Los bloques se alinean con el reloj (`time` múltiplo del tamaño), no con la
 * primera vela: así la vela que contiene la publicación es siempre la misma
 * aunque cambie la ventana.
 */
export function aggregateCandles(candles: ReactionCandle[], groupMinutes: number): ReactionCandle[] {
  if (groupMinutes <= 1 || candles.length === 0) return [...candles].sort((a, b) => a.time - b.time);

  const paso = groupMinutes * 60;
  const bloques = new Map<number, ReactionCandle[]>();

  for (const vela of candles) {
    const inicio = Math.floor(vela.time / paso) * paso;
    const lista = bloques.get(inicio) ?? [];
    lista.push(vela);
    bloques.set(inicio, lista);
  }

  return [...bloques.entries()]
    .map(([time, grupo]) => {
      const orden = grupo.sort((a, b) => a.time - b.time);
      return {
        time,
        open: orden[0].open,
        close: orden[orden.length - 1].close,
        high: Math.max(...orden.map((c) => c.high)),
        low: Math.min(...orden.map((c) => c.low)),
      };
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Cuánto gráfico enseñar para un plazo, y de qué tamaño las velas.
 *
 * Dos reglas: se ve algo antes y algo después del plazo medido -- para que el
 * final no caiga en el borde y se entienda que la historia sigue -- y las
 * velas se agrupan lo justo para que quepan legibles. Cuatro horas en velas de
 * un minuto son doscientas cuarenta barras en el ancho de una tarjeta: pelos.
 */
export function chartWindowFor(horizonMinutes: number): {
  beforeMin: number;
  afterMin: number;
  groupMin: number;
} {
  if (horizonMinutes <= 15) return { beforeMin: 10, afterMin: 25, groupMin: 1 };
  if (horizonMinutes <= 60) return { beforeMin: 20, afterMin: 80, groupMin: 1 };
  if (horizonMinutes <= 120) return { beforeMin: 25, afterMin: 145, groupMin: 2 };
  return { beforeMin: 30, afterMin: 265, groupMin: 5 };
}

export function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value)}%`;
}

/** Con signo, para la columna que compara publicaciones entre sí. */
export function formatSignedPct(value: number | null): string {
  if (value === null) return "—";
  const signo = value > 0 ? "+" : "";
  return `${signo}${formatPct(value)}`;
}

/** Sin signo, para «llegó a moverse», que no tiene sentido negativo. */
export function formatAbsPct(value: number | null): string {
  return value === null ? "—" : formatPct(Math.abs(value));
}
