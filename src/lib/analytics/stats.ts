import { Decimal } from "decimal.js";

/**
 * The single set of pure functions the whole app uses for every metric --
 * the unfiltered dashboard, a filtered view, and the nightly stats_daily
 * cache all call these same functions (see docs/DATABASE.md on why
 * stats_daily must never be the only code path that can produce these
 * numbers). Given an already-filtered trade list, they never query the
 * database themselves.
 */

export interface TradeForStats {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  netPnl: string | null;
  grossPnl: string | null;
  totalCommissions: string;
}

export interface StatsSummary {
  tradesCount: number;
  openTradesCount: number;
  closedTradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Percentage (0-100). Null when there are no closed trades -- never 0, which would misrepresent "no data" as "0% win rate". */
  winRate: number | null;
  grossPnl: string;
  netPnl: string;
  totalCommissions: string;
  /** sum(net gains) / abs(sum(net losses)). Null when there are no losing trades (undefined ratio) or no closed trades. */
  profitFactor: number | null;
  /** Average net P&L per closed trade. Null when there are no closed trades. */
  expectancy: string | null;
  /** Largest peak-to-trough decline in cumulative net P&L, as a positive number. "0" when equity never declined. */
  maxDrawdown: string;
  bestTrade: { id: string; netPnl: string } | null;
  worstTrade: { id: string; netPnl: string } | null;
  currentStreak: { type: "WIN" | "LOSS" | "NONE"; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
}

function closedWithPnl(trades: TradeForStats[]) {
  return trades.filter(
    (t): t is TradeForStats & { netPnl: string; closedAt: string } =>
      t.status === "CLOSED" && t.netPnl !== null && t.closedAt !== null,
  );
}

function sortedByClose(trades: (TradeForStats & { netPnl: string; closedAt: string })[]) {
  return [...trades].sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0));
}

export function computeStats(trades: TradeForStats[]): StatsSummary {
  const closed = sortedByClose(closedWithPnl(trades));
  const openCount = trades.filter((t) => t.status === "OPEN").length;

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossPnl = new Decimal(0);
  let netPnl = new Decimal(0);
  let totalCommissions = new Decimal(0);
  let winSum = new Decimal(0);
  let lossSum = new Decimal(0);
  let best: { id: string; netPnl: string } | null = null;
  let worst: { id: string; netPnl: string } | null = null;

  for (const t of trades) {
    totalCommissions = totalCommissions.plus(t.totalCommissions);
  }

  for (const t of closed) {
    const pnl = new Decimal(t.netPnl);
    grossPnl = grossPnl.plus(t.grossPnl ?? "0");
    netPnl = netPnl.plus(pnl);

    if (pnl.gt(0)) {
      wins += 1;
      winSum = winSum.plus(pnl);
    } else if (pnl.lt(0)) {
      losses += 1;
      lossSum = lossSum.plus(pnl.abs());
    } else {
      breakeven += 1;
    }

    if (!best || pnl.gt(best.netPnl)) best = { id: t.id, netPnl: t.netPnl };
    if (!worst || pnl.lt(worst.netPnl)) worst = { id: t.id, netPnl: t.netPnl };
  }

  const closedCount = closed.length;
  const winRate = closedCount > 0 ? (wins / closedCount) * 100 : null;
  const profitFactor = closedCount > 0 && lossSum.gt(0) ? winSum.dividedBy(lossSum).toNumber() : null;
  const expectancy = closedCount > 0 ? netPnl.dividedBy(closedCount).toString() : null;

  // Max drawdown over the cumulative net P&L curve.
  let cumulative = new Decimal(0);
  let peak = new Decimal(0);
  let maxDrawdown = new Decimal(0);
  for (const t of closed) {
    cumulative = cumulative.plus(t.netPnl);
    if (cumulative.gt(peak)) peak = cumulative;
    const drawdown = peak.minus(cumulative);
    if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
  }

  // Streaks (wins/losses only -- breakeven trades don't break a streak but
  // don't extend one either).
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const t of closed) {
    const pnl = new Decimal(t.netPnl);
    if (pnl.gt(0)) {
      runWin += 1;
      runLoss = 0;
    } else if (pnl.lt(0)) {
      runLoss += 1;
      runWin = 0;
    }
    longestWinStreak = Math.max(longestWinStreak, runWin);
    longestLossStreak = Math.max(longestLossStreak, runLoss);
  }
  const currentStreak: StatsSummary["currentStreak"] =
    runWin > 0
      ? { type: "WIN", count: runWin }
      : runLoss > 0
        ? { type: "LOSS", count: runLoss }
        : { type: "NONE", count: 0 };

  return {
    tradesCount: trades.length,
    openTradesCount: openCount,
    closedTradesCount: closedCount,
    wins,
    losses,
    breakeven,
    winRate,
    grossPnl: grossPnl.toString(),
    netPnl: netPnl.toString(),
    totalCommissions: totalCommissions.toString(),
    profitFactor,
    expectancy,
    maxDrawdown: maxDrawdown.toString(),
    bestTrade: best,
    worstTrade: worst,
    currentStreak,
    longestWinStreak,
    longestLossStreak,
  };
}

export interface EquityCurvePoint {
  closedAt: string;
  cumulativeNetPnl: string;
}

/** One point per closed trade, in chronological order -- the dashboard's equity curve chart plots this directly. */
export function computeEquityCurve(trades: TradeForStats[]): EquityCurvePoint[] {
  const closed = sortedByClose(closedWithPnl(trades));
  let cumulative = new Decimal(0);
  return closed.map((t) => {
    cumulative = cumulative.plus(t.netPnl);
    return { closedAt: t.closedAt, cumulativeNetPnl: cumulative.toString() };
  });
}

export interface DailyPnl {
  /** YYYY-MM-DD in whatever timezone the caller already converted closedAt to before calling this. */
  date: string;
  netPnl: string;
  tradesCount: number;
}

/**
 * Buckets closed trades by the caller-supplied local date string. This
 * function does not itself do timezone conversion -- pass `dateOf`, a
 * function that converts a trade's closedAt into the user's configured
 * local calendar date (e.g. via Luxon with app_settings.timezone), so the
 * calendar in the dashboard lines up with the day the user actually
 * experienced the trade, not a UTC day boundary.
 */
export function computeDailyPnl(
  trades: TradeForStats[],
  dateOf: (closedAtIso: string) => string,
): DailyPnl[] {
  const closed = closedWithPnl(trades);
  const byDate = new Map<string, { netPnl: Decimal; count: number }>();

  for (const t of closed) {
    const date = dateOf(t.closedAt);
    const entry = byDate.get(date) ?? { netPnl: new Decimal(0), count: 0 };
    entry.netPnl = entry.netPnl.plus(t.netPnl);
    entry.count += 1;
    byDate.set(date, entry);
  }

  return [...byDate.entries()]
    .map(([date, v]) => ({ date, netPnl: v.netPnl.toString(), tradesCount: v.count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
