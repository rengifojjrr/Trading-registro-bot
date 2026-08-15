import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { computeDailyBalances, computeSnapshots } from "./snapshots";
import type { TradeForStats } from "./stats";

/**
 * Writes the day/week/month rollups and the daily balances for one account.
 *
 * Runs nightly from the reconciliation cron. Recomputes from the trades
 * rather than incrementing anything: an incremental counter drifts the
 * moment a trade is recomputed or an override is added, and drifting
 * silently is precisely what these snapshots exist to catch.
 *
 * Upserted on the tables' own natural keys, so re-running it any number of
 * times is a no-op rather than a duplicate.
 */
export interface SnapshotResult {
  periodsWritten: number;
  daysWritten: number;
  /** Periods whose stored net P&L no longer matches what the trades now produce. */
  changedPeriods: string[];
}

export async function persistSnapshots(params: {
  userId: string;
  accountId: string;
  timezone: string;
}): Promise<SnapshotResult> {
  const supabase = createAdminClient();

  const { data: tradeRows } = await supabase
    .from("trades")
    .select("id, status, opened_at, closed_at, net_pnl, gross_pnl, total_commissions")
    .eq("user_id", params.userId)
    .eq("account_id", params.accountId);

  const trades: TradeForStats[] = (tradeRows ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    openedAt: t.opened_at,
    closedAt: t.closed_at,
    netPnl: t.net_pnl,
    grossPnl: t.gross_pnl,
    totalCommissions: t.total_commissions ?? "0",
  }));

  const snapshots = computeSnapshots(trades, params.timezone);
  const balances = computeDailyBalances(trades, params.timezone);

  // Compare against what's already stored before overwriting: a period
  // whose total moved is exactly the signal these tables exist to give.
  const { data: existing } = await supabase
    .from("stats_daily")
    .select("period_type, period_start, net_pnl")
    .eq("account_id", params.accountId);

  const previousByKey = new Map(
    (existing ?? []).map((row) => [`${row.period_type}:${row.period_start}`, String(row.net_pnl)]),
  );

  const changedPeriods = snapshots
    .filter((s) => {
      const previous = previousByKey.get(`${s.periodType}:${s.periodStart}`);
      return previous !== undefined && Number(previous) !== Number(s.netPnl);
    })
    .map((s) => `${s.periodType}:${s.periodStart}`);

  if (snapshots.length > 0) {
    const { error } = await supabase.from("stats_daily").upsert(
      snapshots.map((s) => ({
        user_id: params.userId,
        account_id: params.accountId,
        period_type: s.periodType,
        period_start: s.periodStart,
        trades_count: s.tradesCount,
        wins: s.wins,
        losses: s.losses,
        breakeven: s.breakeven,
        gross_pnl: s.grossPnl,
        net_pnl: s.netPnl,
        commissions: s.commissions,
        win_rate: s.winRate,
        profit_factor: s.profitFactor,
        expectancy: s.expectancy,
        max_drawdown: s.maxDrawdown,
        best_trade_id: s.bestTradeId,
        worst_trade_id: s.worstTradeId,
        // computed_at has a database default and isn't in the Insert type.
      })),
      { onConflict: "account_id,period_type,period_start" },
    );
    if (error) throw new Error(`No se pudieron guardar los snapshots: ${error.message}`);
  }

  if (balances.length > 0) {
    const { error } = await supabase.from("daily_balances").upsert(
      balances.map((b) => ({
        user_id: params.userId,
        account_id: params.accountId,
        balance_date: b.balanceDate,
        realized_pnl: b.realizedPnl,
        equity: b.equity,
        source: "COMPUTED" as const,
        // computed_at has a database default and isn't in the Insert type.
      })),
      { onConflict: "account_id,balance_date" },
    );
    if (error) throw new Error(`No se pudieron guardar los balances diarios: ${error.message}`);
  }

  return {
    periodsWritten: snapshots.length,
    daysWritten: balances.length,
    changedPeriods,
  };
}
