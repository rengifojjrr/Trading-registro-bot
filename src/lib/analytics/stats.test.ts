import { describe, expect, it } from "vitest";

import { computeDailyPnl, computeEquityCurve, computeStats, type TradeForStats } from "./stats";

function trade(partial: Partial<TradeForStats> & { id: string }): TradeForStats {
  return {
    status: "CLOSED",
    openedAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-01-01T01:00:00Z",
    netPnl: "0",
    grossPnl: "0",
    totalCommissions: "0",
    ...partial,
  };
}

describe("computeStats", () => {
  it("returns null-safe defaults for an empty trade list, never zero-as-if-computed", () => {
    const s = computeStats([]);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.bestTrade).toBeNull();
    expect(s.currentStreak).toEqual({ type: "NONE", count: 0 });
  });

  it("counts wins, losses, and breakeven correctly, and excludes OPEN trades from win rate", () => {
    const trades = [
      trade({ id: "1", netPnl: "100" }),
      trade({ id: "2", netPnl: "-50" }),
      trade({ id: "3", netPnl: "0" }),
      trade({ id: "4", status: "OPEN", netPnl: null, closedAt: null }),
    ];
    const s = computeStats(trades);

    expect(s.tradesCount).toBe(4);
    expect(s.openTradesCount).toBe(1);
    expect(s.closedTradesCount).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.breakeven).toBe(1);
    expect(s.winRate).toBeCloseTo((1 / 3) * 100, 5);
  });

  it("computes profit factor as sum(wins)/abs(sum(losses))", () => {
    const trades = [
      trade({ id: "1", netPnl: "100" }),
      trade({ id: "2", netPnl: "50" }),
      trade({ id: "3", netPnl: "-30" }),
    ];
    const s = computeStats(trades);
    expect(s.profitFactor).toBeCloseTo(150 / 30, 6);
  });

  it("profit factor is null (undefined ratio), not Infinity, when there are no losses", () => {
    const s = computeStats([trade({ id: "1", netPnl: "100" })]);
    expect(s.profitFactor).toBeNull();
  });

  it("identifies best and worst trade by net P&L", () => {
    const trades = [
      trade({ id: "1", netPnl: "100" }),
      trade({ id: "2", netPnl: "-200" }),
      trade({ id: "3", netPnl: "50" }),
    ];
    const s = computeStats(trades);
    expect(s.bestTrade).toEqual({ id: "1", netPnl: "100" });
    expect(s.worstTrade).toEqual({ id: "2", netPnl: "-200" });
  });

  it("computes max drawdown as the largest peak-to-trough decline in cumulative P&L", () => {
    // Cumulative: 100, 150, 50, 80, 30 -> peak 150, trough 30 -> drawdown 120
    const trades = [
      trade({ id: "1", netPnl: "100", closedAt: "2026-01-01T00:00:00Z" }),
      trade({ id: "2", netPnl: "50", closedAt: "2026-01-02T00:00:00Z" }),
      trade({ id: "3", netPnl: "-100", closedAt: "2026-01-03T00:00:00Z" }),
      trade({ id: "4", netPnl: "30", closedAt: "2026-01-04T00:00:00Z" }),
      trade({ id: "5", netPnl: "-50", closedAt: "2026-01-05T00:00:00Z" }),
    ];
    const s = computeStats(trades);
    expect(s.maxDrawdown).toBe("120");
  });

  it("tracks win/loss streaks, including the current one", () => {
    const trades = [
      trade({ id: "1", netPnl: "10", closedAt: "2026-01-01T00:00:00Z" }),
      trade({ id: "2", netPnl: "10", closedAt: "2026-01-02T00:00:00Z" }),
      trade({ id: "3", netPnl: "-10", closedAt: "2026-01-03T00:00:00Z" }),
      trade({ id: "4", netPnl: "-10", closedAt: "2026-01-04T00:00:00Z" }),
      trade({ id: "5", netPnl: "-10", closedAt: "2026-01-05T00:00:00Z" }),
    ];
    const s = computeStats(trades);
    expect(s.longestWinStreak).toBe(2);
    expect(s.longestLossStreak).toBe(3);
    expect(s.currentStreak).toEqual({ type: "LOSS", count: 3 });
  });
});

describe("computeEquityCurve", () => {
  it("produces one running-total point per closed trade in chronological order", () => {
    const trades = [
      trade({ id: "1", netPnl: "100", closedAt: "2026-01-02T00:00:00Z" }),
      trade({ id: "2", netPnl: "-30", closedAt: "2026-01-01T00:00:00Z" }), // out of order input
    ];
    const curve = computeEquityCurve(trades);
    expect(curve).toEqual([
      { closedAt: "2026-01-01T00:00:00Z", cumulativeNetPnl: "-30" },
      { closedAt: "2026-01-02T00:00:00Z", cumulativeNetPnl: "70" },
    ]);
  });

  it("ignores open trades", () => {
    const curve = computeEquityCurve([trade({ id: "1", status: "OPEN", netPnl: null, closedAt: null })]);
    expect(curve).toEqual([]);
  });
});

describe("computeDailyPnl", () => {
  it("buckets trades by the caller-supplied local date and sums net P&L per day", () => {
    const trades = [
      trade({ id: "1", netPnl: "100", closedAt: "2026-01-01T23:00:00Z" }),
      trade({ id: "2", netPnl: "50", closedAt: "2026-01-01T23:30:00Z" }),
      trade({ id: "3", netPnl: "-20", closedAt: "2026-01-02T01:00:00Z" }),
    ];
    // Identity date-of function -- the timezone conversion itself is the
    // caller's responsibility (see the function's doc comment).
    const daily = computeDailyPnl(trades, (iso) => iso.slice(0, 10));

    expect(daily).toEqual([
      { date: "2026-01-01", netPnl: "150", tradesCount: 2 },
      { date: "2026-01-02", netPnl: "-20", tradesCount: 1 },
    ]);
  });
});
