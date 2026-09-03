/**
 * El estudio de backtests de agosto de 2026: doce estrategias clásicas medidas
 * sobre BTC y ETH, y lo que quedó en pie.
 *
 * Todas las cifras salen del Strategy Tester de TradingView sobre
 * `COINBASE:BTCUSD` y `COINBASE:ETHUSD` en diario, con capital inicial de
 * 10.000 USD, orden al 100% del capital, margen 0/0, comisión del 0,20% por
 * lado y sin deslizamiento. Están medidas, no estimadas.
 *
 * Tres advertencias que hay que leer antes de usar estos números:
 *
 *   1. Son de CONTADO, no del perpetuo. El perpetuo de Coinbase no cotiza en
 *      TradingView (verificado). El coste de financiación del perpetuo no
 *      está incluido y, con posiciones que duran semanas, no es un detalle.
 *
 *   2. La línea base es la ventana de los ÚLTIMOS 4 AÑOS, no el histórico
 *      completo. El histórico está inflado por 2015-2020: casi todas estas
 *      estrategias ganan diez o cien veces más si se las mide desde 2014,
 *      y eso no es lo que va a pasar a partir de mañana. Comparar lo que
 *      hace un bot en vivo contra su histórico completo es engañarse.
 *
 *   3. Ninguna ha pasado Monte Carlo ni forward testing. Por eso ninguna
 *      entra por encima de F3.
 *
 * El detalle completo, con la comparativa histórico vs 4 años y BTC vs ETH,
 * está en docs/BACKTESTS.md.
 */

import type { Baseline, BotBlock, BotPhase, BotStyle } from "./types";

/** La ventana reciente contra la que se mide todo. */
export const VENTANA_RECIENTE = {
  desde: "2022-08-30",
  hasta: "2026-08-29",
  meses: 48,
} as const;

/** Condiciones del backtest, para que la cifra se pueda reproducir. */
export const CONDICIONES = {
  capitalInicial: 10_000,
  tamanoOrdenPct: 100,
  comisionPorLadoPct: 0.2,
  deslizamiento: 0,
  margen: "0/0 (sin apalancamiento)",
  fuente: "TradingView Strategy Tester",
} as const;

/** Lo que rindió comprar y no tocar nada, en la misma ventana. */
export const COMPRAR_Y_MANTENER = {
  BTC: { pnlPct: 294.67, maxDrawdownPct: 54.3, mensualPct: 2.9 },
  ETH: { pnlPct: 61.22, maxDrawdownPct: 69.6, mensualPct: 1.0 },
} as const;

export interface CifrasVentana {
  pnlPct: number;
  maxDrawdownPct: number;
  trades: number;
  profitFactor: number | null;
  winRatePct: number | null;
}

export interface CandidatoBacktest {
  slug: string;
  name: string;
  market: string;
  timeframe: string;
  style: BotStyle;
  block: BotBlock;
  phase: BotPhase;
  hypothesis: string;
  /** Los últimos 4 años: la cifra que manda. */
  reciente: CifrasVentana;
  /** El histórico completo, sólo como contexto. */
  historico: CifrasVentana & { rango: string };
  /** Media geométrica mensual de la ventana reciente, en %. */
  mensualPct: number;
  /** Media geométrica anual de la ventana reciente, en %. */
  anualPct: number;
  /** Qué se probó alrededor del parámetro elegido. Null = sin probar. */
  sensibilidad: string | null;
  /** Cómo se comportó antes de agosto de 2022, si se midió. */
  periodoPrevio: string | null;
}

/**
 * Lo que sobrevivió. Ordenado por rentabilidad ajustada al riesgo en la
 * ventana reciente, no por el histórico.
 */
export const CANDIDATOS: CandidatoBacktest[] = [
  {
    slug: "tortugas-s2-eth",
    name: "Tortugas S2 — ETH diario",
    market: "COINBASE:ETHUSD",
    timeframe: "1D",
    style: "RUPTURA",
    block: "CONVEXO",
    phase: "F3",
    hypothesis:
      "Las rupturas de máximos de 55 días capturan las tendencias largas de ETH, que son pocas y muy grandes; el 46% de aciertos basta porque las ganadoras son mucho mayores que las perdedoras.",
    reciente: { pnlPct: 144.97, maxDrawdownPct: 33.49, trades: 28, profitFactor: 1.773, winRatePct: 46.43 },
    historico: {
      pnlPct: 48706.8, maxDrawdownPct: 42.28, trades: 63, profitFactor: 1.975, winRatePct: null,
      rango: "22 may 2016 → 28 ago 2026",
    },
    mensualPct: 1.88,
    anualPct: 25.11,
    sensibilidad:
      "Meseta verificada: 45/20 +122,99% · 55/15 +44,55% · 55/20 +144,97% · 55/25 +97,87% · 65/20 +85,49%. Las cinco celdas positivas, así que el óptimo no es un pico aislado.",
    periodoPrevio:
      "2016 → ago 2022: +19.826,72% con PF 2,311. La ventaja se ha reducido (PF 2,311 → 1,773) pero no ha desaparecido.",
  },
  {
    slug: "double-seven-btc",
    name: "Double Seven — BTC diario",
    market: "COINBASE:BTCUSD",
    timeframe: "1D",
    style: "REVERSION",
    block: "CONCAVO",
    phase: "F2",
    hypothesis:
      "Dentro de una tendencia alcista (precio sobre la SMA 200), un cierre en el mínimo de 7 días es un retroceso temporal que suele revertir; se sale en el máximo de 7 días.",
    reciente: { pnlPct: 106.17, maxDrawdownPct: 31.1, trades: 46, profitFactor: 2.321, winRatePct: 65.22 },
    historico: {
      pnlPct: 87.19, maxDrawdownPct: 57.59, trades: 117, profitFactor: 1.284, winRatePct: 67.52,
      rango: "30 nov 2014 → 29 ago 2026",
    },
    mensualPct: 1.52,
    anualPct: 19.83,
    sensibilidad:
      "AVISO: en ETH pierde (−33,39% histórico, −21,68% en 4 años). Es una ventaja solo-BTC, y una ventaja que sólo existe en un activo merece desconfianza.",
    periodoPrevio: "Es la única del estudio que rinde MEJOR en la ventana reciente que en su histórico completo.",
  },
  {
    slug: "perp-lab-btc-ls",
    name: "SuperTrend + EMA 21/55 — BTC diario (largos y cortos)",
    market: "COINBASE:BTCUSD",
    timeframe: "1D",
    style: "TENDENCIA",
    block: "CONVEXO",
    phase: "F2",
    hypothesis:
      "El SuperTrend filtrado por el régimen de EMA 21/55 diario sigue la tendencia dominante de BTC, y las salidas asimétricas (trailing 12% en largo, 5% en corto) reconocen que las caídas son más rápidas que las subidas.",
    reciente: { pnlPct: 73.27, maxDrawdownPct: 20.68, trades: 21, profitFactor: 1.743, winRatePct: null },
    historico: {
      pnlPct: 1996, maxDrawdownPct: 24.96, trades: 76, profitFactor: null, winRatePct: 48.7,
      rango: "30 nov 2014 → 2026",
    },
    mensualPct: 1.15,
    anualPct: 14.73,
    sensibilidad:
      "Factor 1,5 elegido sobre 1,25 y 1,0 por degradación monótona fuera de muestra, no por pico dentro de muestra. Es el que menos drawdown tiene de todo el estudio.",
    periodoPrevio: "Fuera de muestra 2021→2026: +164,6% con DD 24,96%, batiendo a comprar y mantener en retorno y en riesgo.",
  },
  {
    slug: "tortugas-s1-btc",
    name: "Tortugas S1 — BTC diario",
    market: "COINBASE:BTCUSD",
    timeframe: "1D",
    style: "RUPTURA",
    block: "CONVEXO",
    phase: "F2",
    hypothesis:
      "La ruptura del máximo de 20 días con salida en el mínimo de 10 captura los tramos tendenciales de BTC; el filtro de última ruptura evita repetir la señal que acaba de fallar.",
    reciente: { pnlPct: 65.76, maxDrawdownPct: 28.28, trades: 39, profitFactor: 1.234, winRatePct: 35.9 },
    historico: {
      pnlPct: 7694.8, maxDrawdownPct: 43.91, trades: 97, profitFactor: 1.566, winRatePct: null,
      rango: "30 nov 2014 → 28 ago 2026",
    },
    mensualPct: 1.06,
    anualPct: 13.47,
    sensibilidad: null,
    periodoPrevio: "En ETH la misma regla queda plana en la ventana reciente (−1,77%), así que su ventaja actual es de BTC.",
  },
  {
    slug: "tortugas-s2-btc",
    name: "Tortugas S2 — BTC diario",
    market: "COINBASE:BTCUSD",
    timeframe: "1D",
    style: "RUPTURA",
    block: "CONVEXO",
    phase: "F2",
    hypothesis: "La versión lenta de las Tortugas sobre BTC: menos señales, cada una con más recorrido esperado.",
    reciente: { pnlPct: 35.32, maxDrawdownPct: 33.47, trades: 33, profitFactor: 1.111, winRatePct: 39.39 },
    historico: {
      pnlPct: 7372.72, maxDrawdownPct: 42.12, trades: 75, profitFactor: 1.577, winRatePct: null,
      rango: "30 nov 2014 → 28 ago 2026",
    },
    mensualPct: 0.63,
    anualPct: 7.86,
    sensibilidad: null,
    periodoPrevio:
      "PF 2,786 antes de ago-2022 y 1,111 después. Es el aviso de decaimiento más claro del estudio: la misma regla que en ETH aguanta, en BTC casi se ha agotado.",
  },
];

export interface Descartado {
  slug: string;
  name: string;
  market: string;
  style: BotStyle;
  block: BotBlock;
  /** Uno de los motivos de retirada que admite la tabla `bots`. */
  reason: "ALPHA_DECAY" | "OVERFITTING" | "BROKER" | "CAMBIO_REGIMEN" | "SUPERADO" | "NO_SUPERIOR" | "OTRO";
  autopsia: string;
  btc: CifrasVentana | null;
  eth: CifrasVentana | null;
}

/**
 * El cementerio. Está aquí para que nadie las vuelva a probar sin saber que
 * ya se probaron, que es la mitad del valor de un estudio como éste.
 */
export const DESCARTADOS: Descartado[] = [
  {
    slug: "larry-williams",
    name: "Ruptura de volatilidad de Larry Williams",
    market: "COINBASE:BTCUSD",
    style: "RUPTURA",
    block: "CONVEXO",
    reason: "OTRO",
    autopsia:
      "Impuesto de frecuencia. 2.979 operaciones en BTC con factor de ganancia 0,964: cada operación pierde valor esperado en comisiones y el compuesto se lleva el 97,48% del capital. En ETH, −94,50% con 2.684 operaciones. No está roto direccionalmente (PF cercano a 1); lo mata el coste. A comisión cero sería otra conversación, pero Coinbase no cobra cero.",
    btc: { pnlPct: -97.48, maxDrawdownPct: 99.06, trades: 2979, profitFactor: 0.964, winRatePct: null },
    eth: { pnlPct: -94.5, maxDrawdownPct: 99.33, trades: 2684, profitFactor: 0.989, winRatePct: null },
  },
  {
    slug: "ibs",
    name: "Internal Bar Strength (IBS)",
    market: "COINBASE:BTCUSD",
    style: "REVERSION",
    block: "CONCAVO",
    reason: "OTRO",
    autopsia:
      "1.209 operaciones con PF 0,436 en BTC: −99,92%. La señal no tiene ventaja y la frecuencia amplifica la pérdida.",
    btc: { pnlPct: -99.92, maxDrawdownPct: 99.92, trades: 1209, profitFactor: 0.436, winRatePct: 47.23 },
    eth: null,
  },
  {
    slug: "bollinger-reversion",
    name: "Reversión con Bandas de Bollinger 20/2",
    market: "COINBASE:BTCUSD",
    style: "REVERSION",
    block: "CONCAVO",
    reason: "NO_SUPERIOR",
    autopsia:
      "Control negativo del estudio. −100,00% con PF 0,318 en BTC. Comprar debilidad sin filtro de tendencia en un activo con caídas del 80% es ruina matemática. Estaba puesto para comprobar que el método sabe detectar una mala estrategia, y la detectó.",
    btc: { pnlPct: -100, maxDrawdownPct: 108.34, trades: 148, profitFactor: 0.318, winRatePct: 59.46 },
    eth: null,
  },
  {
    slug: "rsi2-connors",
    name: "RSI(2) de Connors + SMA 200",
    market: "COINBASE:BTCUSD",
    style: "REVERSION",
    block: "CONCAVO",
    reason: "NO_SUPERIOR",
    autopsia:
      "66,67% de aciertos y aun así −39,70%: las perdedoras son mucho mayores que las ganadoras (PF 0,755). Es el mejor recordatorio del estudio de que un porcentaje de acierto alto sin control de la cola no es una ventaja.",
    btc: { pnlPct: -39.7, maxDrawdownPct: 102.69, trades: 90, profitFactor: 0.755, winRatePct: 66.67 },
    eth: null,
  },
  {
    slug: "tsmom-12m",
    name: "Time Series Momentum 12 meses",
    market: "COINBASE:ETHUSD",
    style: "MOMENTUM",
    block: "CONVEXO",
    reason: "NO_SUPERIOR",
    autopsia:
      "Funciona en BTC (+3.122% histórico) y se hunde en ETH (−94,17% histórico, −82,08% en 4 años). Una ventaja que sólo existe en un activo de dos no es momentum de series temporales, es suerte de muestra.",
    btc: { pnlPct: 3122, maxDrawdownPct: 87.58, trades: 35, profitFactor: 2.209, winRatePct: null },
    eth: { pnlPct: -94.17, maxDrawdownPct: 98.27, trades: 54, profitFactor: 0.689, winRatePct: null },
  },
  {
    slug: "bll-trb",
    name: "Trading Range Breakout (n=50)",
    market: "COINBASE:BTCUSD",
    style: "RUPTURA",
    block: "CONVEXO",
    reason: "ALPHA_DECAY",
    autopsia:
      "Histórico bueno en los dos (+1.237% BTC, +8.354% ETH) y negativo en los últimos 4 años en los dos (−18,67% y −17,41%). Decaimiento limpio: la ventaja existió y se agotó. Es el caso de libro de por qué el histórico completo engaña.",
    btc: { pnlPct: 1237.57, maxDrawdownPct: 73.26, trades: 135, profitFactor: 1.189, winRatePct: null },
    eth: { pnlPct: 8354.64, maxDrawdownPct: 68.01, trades: 125, profitFactor: 1.286, winRatePct: null },
  },
  {
    slug: "golden-cross",
    name: "Golden Cross SMA 50/200 (control)",
    market: "COINBASE:BTCUSD",
    style: "TENDENCIA",
    block: "CONVEXO",
    reason: "NO_SUPERIOR",
    autopsia:
      "Control del estudio. −42,00% en los últimos 4 años con PF 0,568. Que el control falle donde las candidatas aguantan es buena señal para el resto del estudio.",
    btc: { pnlPct: 2140.27, maxDrawdownPct: 70.03, trades: 19, profitFactor: 1.257, winRatePct: null },
    eth: { pnlPct: 3097.13, maxDrawdownPct: 99.74, trades: 18, profitFactor: 1.269, winRatePct: null },
  },
];

/** La línea base de un candidato, en el formato que guarda la tabla `bots`. */
export function baselineDe(c: CandidatoBacktest): Baseline {
  return {
    profitFactor: c.reciente.profitFactor,
    // No se midieron múltiplos de R por operación, así que no se inventa.
    expectancyR: null,
    winRate: c.reciente.winRatePct,
    // Tampoco Sharpe: el Strategy Tester del plan Basic no lo da.
    sharpe: null,
    maxDrawdownPct: c.reciente.maxDrawdownPct,
    tradesPerMonth: Math.round((c.reciente.trades / VENTANA_RECIENTE.meses) * 100) / 100,
    trades: c.reciente.trades,
    source: "BACKTEST",
    note:
      `${VENTANA_RECIENTE.desde} → ${VENTANA_RECIENTE.hasta} sobre ${c.market} ${c.timeframe}. ` +
      `+${c.reciente.pnlPct}% (${c.mensualPct}%/mes). Comisión 0,20%/lado, sin apalancamiento, contado. ` +
      `Histórico completo (${c.historico.rango}): ${c.historico.pnlPct}%.`,
  };
}
