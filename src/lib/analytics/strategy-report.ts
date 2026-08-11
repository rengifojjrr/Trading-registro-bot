import { computeStats, type StatsSummary, type TradeForStats } from "./stats";

/**
 * Below this many closed trades, win rate/profit factor/expectancy swing
 * wildly on one or two outcomes -- the UI must warn (see
 * StrategyPerformanceCard), never present a small sample as a settled
 * verdict on the strategy. Matches the promise already made in the
 * Estrategias page's own empty-state copy.
 */
export const MIN_SAMPLE_SIZE = 10;

export interface StrategyPerformance {
  strategyId: string | null; // null = the "Sin estrategia" bucket
  strategyName: string;
  stats: StatsSummary;
  lowSample: boolean;
}

/**
 * Groups an already-filtered trade list by its journal strategy and runs
 * the exact same computeStats() used for the overall dashboard on each
 * group -- never a separate/simplified calculation, so a strategy's numbers
 * here always agree with what its own trades show individually. Every
 * active strategy appears even with zero trades (a defined-but-unused
 * strategy is a real state worth showing); untagged trades are grouped
 * under a synthetic "Sin estrategia" entry that only appears if it's
 * non-empty. Sorted by net P&L, best first.
 */
export function computeStrategyPerformance(
  trades: (TradeForStats & { strategyId: string | null })[],
  strategies: { id: string; name: string }[],
): StrategyPerformance[] {
  const byStrategy = new Map<string | null, TradeForStats[]>();
  for (const t of trades) {
    const group = byStrategy.get(t.strategyId);
    if (group) group.push(t);
    else byStrategy.set(t.strategyId, [t]);
  }

  const results: StrategyPerformance[] = strategies.map((strategy) => {
    const stats = computeStats(byStrategy.get(strategy.id) ?? []);
    return { strategyId: strategy.id, strategyName: strategy.name, stats, lowSample: stats.closedTradesCount < MIN_SAMPLE_SIZE };
  });

  const untagged = byStrategy.get(null) ?? [];
  if (untagged.length > 0) {
    const stats = computeStats(untagged);
    results.push({
      strategyId: null,
      strategyName: "Sin estrategia",
      stats,
      lowSample: stats.closedTradesCount < MIN_SAMPLE_SIZE,
    });
  }

  return results.sort((a, b) => Number(b.stats.netPnl) - Number(a.stats.netPnl));
}
