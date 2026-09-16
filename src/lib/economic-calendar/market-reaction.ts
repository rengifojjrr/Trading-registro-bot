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
  /** Opcional: ninguna medida lo usa, sólo el gráfico si decide pintarlo. */
  volume?: number;
}

/**
 * Junta velas de un minuto en velas más grandes.
 *
 * Existe para que el gráfico pueda abrir en cinco minutos sin pedir nada: el
 * servidor ya trae trescientas velas de un minuto -- las necesita para medir
 * la reacción con precisión -- y de ellas salen sesenta de cinco minutos que
 * cubren las mismas cinco horas. Abrir en un minuto enseñaba hora y media de
 * ruido donde hacía falta ver la forma entera del movimiento.
 *
 * Los tramos se alinean con el reloj (múltiplos del epoch) y no con la
 * primera vela recibida. Es lo que hace que la vela del dato empiece
 * exactamente a las 12:30 y no a las 12:27, que es donde caería si el tramo
 * dependiera de dónde empezara la petición. Las publicaciones macro salen en
 * punto o y media, así que caen siempre en el borde de un tramo de cinco o de
 * quince.
 *
 * Puro.
 */
export function aggregateCandles(candles: ReactionCandle[], factorMinutos: number): ReactionCandle[] {
  if (factorMinutos <= 1) return [...candles].sort((a, b) => a.time - b.time);

  const tramo = factorMinutos * 60;
  const ordenadas = [...candles].sort((a, b) => a.time - b.time);
  const salida: ReactionCandle[] = [];

  for (const vela of ordenadas) {
    const inicio = Math.floor(vela.time / tramo) * tramo;
    const ultima = salida.at(-1);

    if (!ultima || ultima.time !== inicio) {
      salida.push({
        time: inicio,
        open: vela.open,
        high: vela.high,
        low: vela.low,
        close: vela.close,
        volume: vela.volume ?? 0,
      });
      continue;
    }

    // La apertura es la de la primera vela del tramo y no se toca; el cierre
    // es siempre el de la última que entra.
    ultima.high = Math.max(ultima.high, vela.high);
    ultima.low = Math.min(ultima.low, vela.low);
    ultima.close = vela.close;
    ultima.volume = (ultima.volume ?? 0) + (vela.volume ?? 0);
  }

  return salida;
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
