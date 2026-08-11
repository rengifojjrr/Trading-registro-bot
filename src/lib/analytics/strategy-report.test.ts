import { describe, expect, it } from "vitest";

import { computeStrategyPerformance, MIN_SAMPLE_SIZE } from "./strategy-report";
import type { TradeForStats } from "./stats";

function closedTrade(id: string, netPnl: string, strategyId: string | null): TradeForStats & { strategyId: string | null } {
  return {
    id,
    status: "CLOSED",
    openedAt: "2026-08-01T00:00:00Z",
    closedAt: "2026-08-01T01:00:00Z",
    netPnl,
    grossPnl: netPnl,
    totalCommissions: "0",
    strategyId,
  };
}

const STRATEGIES = [
  { id: "s-a", name: "Breakout" },
  { id: "s-b", name: "Reversion" },
];

describe("computeStrategyPerformance", () => {
  it("groups trades by strategy and computes each group's stats independently", () => {
    const trades = [closedTrade("1", "100", "s-a"), closedTrade("2", "-50", "s-b")];
    const results = computeStrategyPerformance(trades, STRATEGIES);

    const a = results.find((r) => r.strategyId === "s-a");
    const b = results.find((r) => r.strategyId === "s-b");
    expect(a?.stats.netPnl).toBe("100");
    expect(a?.stats.closedTradesCount).toBe(1);
    expect(b?.stats.netPnl).toBe("-50");
    expect(b?.stats.closedTradesCount).toBe(1);
  });

  it("includes a strategy with zero trades instead of hiding it", () => {
    const results = computeStrategyPerformance([closedTrade("1", "100", "s-a")], STRATEGIES);
    const b = results.find((r) => r.strategyId === "s-b");
    expect(b).toBeDefined();
    expect(b?.stats.closedTradesCount).toBe(0);
    expect(b?.stats.netPnl).toBe("0");
  });

  it("groups untagged trades under 'Sin estrategia', omitted entirely when there are none", () => {
    const withUntagged = computeStrategyPerformance(
      [closedTrade("1", "100", "s-a"), closedTrade("2", "30", null)],
      STRATEGIES,
    );
    const untagged = withUntagged.find((r) => r.strategyId === null);
    expect(untagged?.strategyName).toBe("Sin estrategia");
    expect(untagged?.stats.netPnl).toBe("30");

    const withoutUntagged = computeStrategyPerformance([closedTrade("1", "100", "s-a")], STRATEGIES);
    expect(withoutUntagged.some((r) => r.strategyId === null)).toBe(false);
  });

  it("flags lowSample below MIN_SAMPLE_SIZE closed trades, not at or above it", () => {
    const belowThreshold = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, (_, i) => closedTrade(`b${i}`, "10", "s-a"));
    const atThreshold = Array.from({ length: MIN_SAMPLE_SIZE }, (_, i) => closedTrade(`t${i}`, "10", "s-b"));
    const results = computeStrategyPerformance([...belowThreshold, ...atThreshold], STRATEGIES);

    expect(results.find((r) => r.strategyId === "s-a")?.lowSample).toBe(true);
    expect(results.find((r) => r.strategyId === "s-b")?.lowSample).toBe(false);
  });

  it("sorts by net P&L descending", () => {
    const results = computeStrategyPerformance(
      [closedTrade("1", "-50", "s-a"), closedTrade("2", "200", "s-b")],
      STRATEGIES,
    );
    expect(results.map((r) => r.strategyId)).toEqual(["s-b", "s-a"]);
  });
});
