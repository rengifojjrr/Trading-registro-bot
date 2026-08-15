import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

import { computeStats, type TradeForStats } from "./stats";

/**
 * Turns a set of closed trades into the per-period rows that `stats_daily`
 * and `daily_balances` were designed to hold.
 *
 * Both tables shipped in the very first migration and were never written
 * to: every figure in this app is recomputed from scratch on each page
 * load. That is fine for correctness but useless for trust -- with nothing
 * stored, there is no way to notice that last month's numbers are not what
 * last month's numbers used to be. A snapshot is the only thing that can
 * catch a silent retroactive change.
 *
 * Pure and IO-free so it can be tested directly; lib/analytics/persist-
 * snapshots.ts does the writing.
 */

export type PeriodType = "DAY" | "WEEK" | "MONTH";

export interface SnapshotRow {
  periodType: PeriodType;
  /** ISO date (yyyy-mm-dd) of the period's first day, in the user's zone. */
  periodStart: string;
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  grossPnl: string;
  netPnl: string;
  commissions: string;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: string | null;
  maxDrawdown: string;
  bestTradeId: string | null;
  worstTradeId: string | null;
}

export interface DailyBalanceRow {
  balanceDate: string;
  realizedPnl: string;
  /** Running sum of realised P&L up to and including this day. */
  equity: string;
}

/**
 * A trade belongs to the day it *closed*, not the day it opened. That's the
 * day its result actually hit the account, and it's what makes the daily
 * rows add up to the period totals. An overnight position would otherwise
 * be counted on a day whose realised P&L doesn't include it.
 */
function periodKey(closedAtIso: string, timezone: string, period: PeriodType): string {
  const dt = DateTime.fromISO(closedAtIso, { zone: "utc" }).setZone(timezone);
  if (!dt.isValid) return "";
  if (period === "DAY") return dt.toISODate() ?? "";
  if (period === "WEEK") return dt.startOf("week").toISODate() ?? "";
  return dt.startOf("month").toISODate() ?? "";
}

export function computeSnapshots(
  trades: TradeForStats[],
  timezone: string,
  periods: PeriodType[] = ["DAY", "WEEK", "MONTH"],
): SnapshotRow[] {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.closedAt !== null && t.netPnl !== null);
  const rows: SnapshotRow[] = [];

  for (const period of periods) {
    const buckets = new Map<string, TradeForStats[]>();
    for (const trade of closed) {
      const key = periodKey(trade.closedAt!, timezone, period);
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(trade);
      else buckets.set(key, [trade]);
    }

    for (const [periodStart, bucketTrades] of buckets) {
      // Reuses the same computeStats every dashboard tile goes through, so
      // a stored snapshot can never disagree with the live figure by having
      // its own arithmetic.
      const stats = computeStats(bucketTrades);
      rows.push({
        periodType: period,
        periodStart,
        tradesCount: stats.closedTradesCount,
        wins: stats.wins,
        losses: stats.losses,
        breakeven: stats.breakeven,
        grossPnl: stats.grossPnl,
        netPnl: stats.netPnl,
        commissions: stats.totalCommissions,
        winRate: stats.winRate,
        profitFactor: stats.profitFactor,
        expectancy: stats.expectancy,
        maxDrawdown: stats.maxDrawdown,
        bestTradeId: stats.bestTrade?.id ?? null,
        worstTradeId: stats.worstTrade?.id ?? null,
      });
    }
  }

  return rows.sort((a, b) =>
    a.periodType === b.periodType
      ? a.periodStart.localeCompare(b.periodStart)
      : a.periodType.localeCompare(b.periodType),
  );
}

/** Realised P&L per day plus the running equity it produces. */
export function computeDailyBalances(trades: TradeForStats[], timezone: string): DailyBalanceRow[] {
  const daily = computeSnapshots(trades, timezone, ["DAY"]);
  let running = new Decimal(0);

  return daily.map((row) => {
    running = running.plus(row.netPnl);
    return {
      balanceDate: row.periodStart,
      realizedPnl: row.netPnl,
      equity: running.toString(),
    };
  });
}
