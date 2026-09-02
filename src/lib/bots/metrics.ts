import { Decimal } from "decimal.js";

import { computeStats, type TradeForStats } from "@/lib/analytics/stats";

/**
 * Las cifras de un bot, calculadas con el mismo P&L que las tuyas.
 *
 * Nada de aquí reimplementa lo que ya existe: el profit factor, la
 * expectativa, el drawdown y las rachas salen de `computeStats`, que es la
 * misma función que produce las cifras del panel. Por eso «este bot ganó 300»
 * y «tú ganaste 250» son cifras del mismo tipo.
 *
 * Lo que se añade es lo que el método de bots pide y el panel no tenía: la
 * expectativa en R, el Sharpe, el Sortino, el factor de recuperación y el
 * drawdown en porcentaje del capital. Todos los ratios son invariantes a la
 * escala -- dividen dinero entre dinero -- así que no necesitan saber el
 * tamaño de la cuenta; sólo el drawdown en porcentaje lo necesita, y sin él
 * queda a `null` en vez de inventarse una base.
 *
 * Puro.
 */

export interface BotTrade extends TradeForStats {
  /** El día local del cierre, YYYY-MM-DD. Lo calcula quien sabe la zona. */
  closedDay: string | null;
}

export interface BotMetrics {
  trades: number;
  openTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  /** P&L neto medio por operación cerrada, en dinero. */
  expectancy: string | null;
  /**
   * La expectativa en múltiplos del riesgo.
   *
   * Sin un importe de riesgo por operación, la unidad R se aproxima con la
   * pérdida media: es lo que de verdad se perdió cuando se perdió, y para un
   * bot con stop es casi exactamente su R. Sin operaciones perdedoras no hay
   * unidad y queda a `null`, no a infinito.
   */
  expectancyR: number | null;
  averageWin: string;
  averageLoss: string;
  /** Ganancia media entre pérdida media. */
  payoff: number | null;
  netPnl: string;
  /** En dinero, positivo. */
  maxDrawdown: string;
  /** Sobre el capital, 0-100. `null` sin tamaño de cuenta. */
  maxDrawdownPct: number | null;
  /** Anualizado sobre el P&L diario. `null` con menos de 5 días. */
  sharpe: number | null;
  sortino: number | null;
  /** P&L neto entre drawdown máximo. */
  recoveryFactor: number | null;
  tradesPerMonth: number | null;
  longestLossStreak: number;
  /** Días naturales que abarca el histórico cerrado. */
  spanDays: number;
  firstClose: string | null;
  lastClose: string | null;
}

export const EMPTY_METRICS: BotMetrics = {
  trades: 0,
  openTrades: 0,
  winRate: null,
  profitFactor: null,
  expectancy: null,
  expectancyR: null,
  averageWin: "0",
  averageLoss: "0",
  payoff: null,
  netPnl: "0",
  maxDrawdown: "0",
  maxDrawdownPct: null,
  sharpe: null,
  sortino: null,
  recoveryFactor: null,
  tradesPerMonth: null,
  longestLossStreak: 0,
  spanDays: 0,
  firstClose: null,
  lastClose: null,
};

const TRADING_DAYS_PER_YEAR = 252;
const MIN_DAYS_FOR_SHARPE = 5;

export function computeBotMetrics(trades: BotTrade[], accountSize: number | null): BotMetrics {
  const stats = computeStats(trades);
  const closed = trades
    .filter(
      (t): t is BotTrade & { netPnl: string; closedAt: string } =>
        t.status === "CLOSED" && t.netPnl !== null && t.closedAt !== null,
    )
    .sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0));

  if (closed.length === 0) {
    return { ...EMPTY_METRICS, openTrades: stats.openTradesCount, trades: 0 };
  }

  const wins = closed.filter((t) => new Decimal(t.netPnl).greaterThan(0));
  const losses = closed.filter((t) => new Decimal(t.netPnl).lessThan(0));
  const sum = (lista: typeof closed) =>
    lista.reduce((acc, t) => acc.plus(t.netPnl), new Decimal(0));

  const averageWin = wins.length > 0 ? sum(wins).dividedBy(wins.length) : new Decimal(0);
  const averageLoss = losses.length > 0 ? sum(losses).dividedBy(losses.length).abs() : new Decimal(0);
  const expectancy = new Decimal(stats.expectancy ?? 0);

  const daily = dailyPnl(closed);
  const dailyValues = [...daily.values()];
  const maxDrawdown = new Decimal(stats.maxDrawdown);

  const first = closed[0].closedAt;
  const last = closed[closed.length - 1].closedAt;
  const spanDays = Math.max(1, Math.ceil((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1);

  return {
    trades: closed.length,
    openTrades: stats.openTradesCount,
    winRate: stats.winRate,
    profitFactor: stats.profitFactor,
    expectancy: stats.expectancy,
    expectancyR: averageLoss.isZero() ? null : expectancy.dividedBy(averageLoss).toNumber(),
    averageWin: averageWin.toFixed(2),
    averageLoss: averageLoss.toFixed(2),
    payoff: averageLoss.isZero() ? null : averageWin.dividedBy(averageLoss).toNumber(),
    netPnl: stats.netPnl,
    maxDrawdown: stats.maxDrawdown,
    maxDrawdownPct:
      accountSize && accountSize > 0 ? maxDrawdown.dividedBy(accountSize).times(100).toNumber() : null,
    sharpe: sharpe(dailyValues),
    sortino: sortino(dailyValues),
    recoveryFactor: maxDrawdown.isZero() ? null : new Decimal(stats.netPnl).dividedBy(maxDrawdown).toNumber(),
    tradesPerMonth: (closed.length / spanDays) * 30.44,
    longestLossStreak: stats.longestLossStreak,
    spanDays,
    firstClose: first,
    lastClose: last,
  };
}

/**
 * El P&L por día natural, con los días sin operar a cero.
 *
 * Los ceros importan: un Sharpe calculado sólo sobre los días con operaciones
 * infla el ratio de un bot que opera dos veces al mes. La serie va del primer
 * cierre al último, sin huecos.
 */
export function dailyPnl(closed: { closedAt: string; closedDay: string | null; netPnl: string }[]): Map<string, number> {
  const porDia = new Map<string, number>();
  for (const t of closed) {
    const dia = t.closedDay ?? t.closedAt.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(t.netPnl));
  }
  if (porDia.size === 0) return porDia;

  const dias = [...porDia.keys()].sort();
  const completo = new Map<string, number>();
  const inicio = new Date(`${dias[0]}T00:00:00Z`);
  const fin = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  for (let d = inicio; d <= fin; d = new Date(d.getTime() + 86_400_000)) {
    const clave = d.toISOString().slice(0, 10);
    completo.set(clave, porDia.get(clave) ?? 0);
  }
  return completo;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], around: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - around) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Sharpe anualizado sobre el P&L diario, sin tipo libre de riesgo.
 *
 * Invariante a la escala: mide la media entre la desviación, y las dos crecen
 * igual con el tamaño de la cuenta. Con menos de cinco días no se pronuncia.
 */
export function sharpe(daily: number[]): number | null {
  if (daily.length < MIN_DAYS_FOR_SHARPE) return null;
  const m = mean(daily);
  const sd = stdDev(daily, m);
  if (sd === 0) return null;
  return (m / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Como el Sharpe, pero sólo castiga la desviación a la baja. */
export function sortino(daily: number[]): number | null {
  if (daily.length < MIN_DAYS_FOR_SHARPE) return null;
  const m = mean(daily);
  const negativos = daily.filter((v) => v < 0);
  if (negativos.length === 0) return null;
  const downside = Math.sqrt(negativos.reduce((acc, v) => acc + v ** 2, 0) / daily.length);
  if (downside === 0) return null;
  return (m / downside) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * La ventana móvil: las últimas N operaciones o los últimos N días, lo que
 * traiga más operaciones.
 *
 * Las dos a la vez porque un scalper hace treinta operaciones en dos días y
 * un swing tarda cuatro meses: treinta días para el primero es demasiado y
 * treinta operaciones para el segundo es medio año.
 */
export function rollingWindow<T extends { closedAt: string | null; status: string }>(
  trades: T[],
  now: Date,
  days: number,
  count: number,
): T[] {
  const cerradas = trades
    .filter((t) => t.status === "CLOSED" && t.closedAt !== null)
    .sort((a, b) => (a.closedAt! < b.closedAt! ? -1 : a.closedAt! > b.closedAt! ? 1 : 0));

  const desde = now.getTime() - days * 86_400_000;
  const porDias = cerradas.filter((t) => Date.parse(t.closedAt!) >= desde);
  const porCuenta = cerradas.slice(-count);

  return porDias.length >= porCuenta.length ? porDias : porCuenta;
}
