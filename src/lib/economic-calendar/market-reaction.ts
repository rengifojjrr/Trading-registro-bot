/**
 * Qué hizo el precio cuando salió el dato.
 *
 * Puro: recibe velas y un instante, devuelve números. Sin red y sin base de
 * datos, para poder probarlo contra casos escritos a mano.
 *
 * Es la parte honesta de «qué podría pasar»: no una predicción, sino lo que de
 * hecho pasó las veces anteriores. Se mide en porcentaje y no en dólares
 * porque el precio de referencia cambia entre publicaciones -- un movimiento
 * de 400 dólares no significa lo mismo a 63.000 que a 78.000.
 */

export interface ReactionCandle {
  /** Inicio de la vela, en segundos unix. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketReaction {
  /** Cierre de la última vela cerrada antes de la publicación. Es el punto cero. */
  reference: number;
  /** Precio a los quince minutos y a la hora. Null si las velas no llegan. */
  after15: number | null;
  after60: number | null;
  /** Máximo y mínimo alcanzados en la ventana posterior. */
  high: number;
  low: number;
  /** Variación porcentual contra la referencia. */
  changePct15: number | null;
  changePct60: number | null;
  /** Recorrido total en la ventana: (máximo − mínimo) / referencia. Es la medida de volatilidad. */
  rangePct: number;
  /** Cuánto se alejó como mucho del punto cero, en el sentido que fuera. */
  maxMovePct: number;
}

/** Cuánto se mira hacia delante para el máximo, el mínimo y el recorrido. */
const VENTANA_MINUTOS = 60;

/**
 * Mide la reacción alrededor de `eventAt`.
 *
 * Devuelve null si no hay una vela **anterior** a la publicación: sin punto
 * cero no hay nada contra lo que medir, y usar la primera vela posterior como
 * referencia escondería justo el movimiento que se quiere ver -- el del minuto
 * de la publicación.
 */
export function measureReaction(
  candles: ReactionCandle[],
  eventAt: Date,
  windowMinutes = VENTANA_MINUTOS,
): MarketReaction | null {
  if (candles.length === 0) return null;

  const t0 = Math.floor(eventAt.getTime() / 1000);
  const ordenadas = [...candles].sort((a, b) => a.time - b.time);

  const previas = ordenadas.filter((c) => c.time < t0);
  if (previas.length === 0) return null;
  const reference = previas[previas.length - 1].close;
  if (!Number.isFinite(reference) || reference === 0) return null;

  const fin = t0 + windowMinutes * 60;
  const posteriores = ordenadas.filter((c) => c.time >= t0 && c.time <= fin);
  if (posteriores.length === 0) return null;

  const high = Math.max(...posteriores.map((c) => c.high));
  const low = Math.min(...posteriores.map((c) => c.low));

  const pct = (valor: number) => ((valor - reference) / reference) * 100;

  const after15 = closeAt(ordenadas, t0 + 15 * 60);
  const after60 = closeAt(ordenadas, t0 + 60 * 60);

  return {
    reference,
    after15,
    after60,
    high,
    low,
    changePct15: after15 === null ? null : pct(after15),
    changePct60: after60 === null ? null : pct(after60),
    rangePct: ((high - low) / reference) * 100,
    // El mayor alejamiento del punto cero, mire hacia donde mire. Es lo que
    // responde a «¿cuánto llegó a moverse?», que no es lo mismo que «¿dónde
    // acabó?»: un dato puede tirar el precio un 2 % y devolverlo en veinte
    // minutos, y para quien opera apalancado ese viaje de ida importa tanto
    // como el destino.
    maxMovePct: Math.max(Math.abs(pct(high)), Math.abs(pct(low))),
  };
}

/**
 * El cierre de la vela vigente en ese instante.
 *
 * Coge la última vela que ya había empezado, no la más cercana: a los quince
 * minutos exactos la vela en curso es la que empieza en ese minuto, y su
 * cierre es el precio al final de él.
 */
function closeAt(ordenadas: ReactionCandle[], instante: number): number | null {
  let encontrada: ReactionCandle | null = null;
  for (const vela of ordenadas) {
    if (vela.time <= instante) encontrada = vela;
    else break;
  }
  return encontrada ? encontrada.close : null;
}

/** Una frase para la lista: «llegó a moverse un 1,4 % y cerró la hora un 0,9 % arriba». */
export function describeReaction(reaction: MarketReaction): string {
  const move = formatPct(reaction.maxMovePct);
  if (reaction.changePct60 === null) {
    return `llegó a moverse un ${move}`;
  }
  const sentido = reaction.changePct60 >= 0 ? "arriba" : "abajo";
  return `llegó a moverse un ${move} y cerró la hora un ${formatPct(Math.abs(reaction.changePct60))} ${sentido}`;
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
