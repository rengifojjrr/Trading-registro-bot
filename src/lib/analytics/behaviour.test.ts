import { describe, expect, it } from "vitest";

import {
  compareToBuyAndHold,
  computeCommissionDrag,
  computeDailyLimitBreaches,
  computeExpectancy,
  computeMistakeCost,
  computeStreakSizing,
} from "./behaviour";
import type { TradeForStats } from "./stats";

function trade(o: Partial<TradeForStats> & { id: string }): TradeForStats {
  return {
    status: "CLOSED",
    openedAt: "2026-03-02T10:00:00Z",
    closedAt: "2026-03-02T14:00:00Z",
    netPnl: "10",
    grossPnl: "12",
    totalCommissions: "2",
    ...o,
  };
}

describe("computeMistakeCost", () => {
  it("ranks mistakes by what they actually cost, worst first", () => {
    const result = computeMistakeCost([
      { ...trade({ id: "a", netPnl: "-100" }), mistakes: ["MOVED_STOP"] },
      { ...trade({ id: "b", netPnl: "-20" }), mistakes: ["LATE_ENTRY"] },
      { ...trade({ id: "c", netPnl: "-30" }), mistakes: ["LATE_ENTRY"] },
    ]);

    expect(result[0].code).toBe("MOVED_STOP");
    expect(result[0].totalNetPnl).toBe("-100");
    expect(result[1].code).toBe("LATE_ENTRY");
    expect(result[1].trades).toBe(2);
    expect(result[1].averageNetPnl).toBe("-25");
  });

  it("counts a trade once per mistake even if tagged twice", () => {
    const result = computeMistakeCost([
      { ...trade({ id: "a", netPnl: "-50" }), mistakes: ["FOMO", "FOMO"] },
    ]);
    expect(result[0].trades).toBe(1);
    expect(result[0].totalNetPnl).toBe("-50");
  });

  it("attributes one trade to each of its mistakes", () => {
    const result = computeMistakeCost([
      { ...trade({ id: "a", netPnl: "-40" }), mistakes: ["FOMO", "OVERSIZED"] },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.totalNetPnl === "-40")).toBe(true);
  });

  it("ignores open trades, which have no result to attribute", () => {
    const result = computeMistakeCost([
      { ...trade({ id: "a", status: "OPEN", netPnl: null, closedAt: null }), mistakes: ["FOMO"] },
    ]);
    expect(result).toEqual([]);
  });
});

describe("computeStreakSizing", () => {
  it("shows size increasing after consecutive losses", () => {
    // The classic leak: doubling up to recover. Each trade looks fine on
    // its own, so nothing else in the app would show this.
    const result = computeStreakSizing([
      { ...trade({ id: "1", netPnl: "-10", closedAt: "2026-03-01T10:00:00Z" }), maxSize: "1" },
      { ...trade({ id: "2", netPnl: "-10", closedAt: "2026-03-02T10:00:00Z" }), maxSize: "2" },
      { ...trade({ id: "3", netPnl: "-10", closedAt: "2026-03-03T10:00:00Z" }), maxSize: "4" },
    ]);

    // Trade 2 came after a 1-loss streak, trade 3 after a 2-loss streak.
    expect(result.afterLosses).toEqual([
      { streak: 1, trades: 1, averageSize: "2" },
      { streak: 2, trades: 1, averageSize: "4" },
    ]);
  });

  it("tracks winning streaks separately", () => {
    const result = computeStreakSizing([
      { ...trade({ id: "1", netPnl: "10", closedAt: "2026-03-01T10:00:00Z" }), maxSize: "1" },
      { ...trade({ id: "2", netPnl: "10", closedAt: "2026-03-02T10:00:00Z" }), maxSize: "3" },
    ]);

    expect(result.afterWins).toEqual([{ streak: 1, trades: 1, averageSize: "3" }]);
    expect(result.afterLosses).toEqual([]);
  });

  it("breaks both runs on a breakeven trade", () => {
    // Breakeven is neither a loss to recover from nor a win to press.
    const result = computeStreakSizing([
      { ...trade({ id: "1", netPnl: "-10", closedAt: "2026-03-01T10:00:00Z" }), maxSize: "1" },
      { ...trade({ id: "2", netPnl: "0", closedAt: "2026-03-02T10:00:00Z" }), maxSize: "1" },
      { ...trade({ id: "3", netPnl: "-10", closedAt: "2026-03-03T10:00:00Z" }), maxSize: "5" },
    ]);

    // Trade 3 follows the breakeven, so it is not "after 2 losses".
    expect(result.afterLosses).toEqual([{ streak: 1, trades: 1, averageSize: "1" }]);
  });

  it("orders by close time, not by the order given", () => {
    const result = computeStreakSizing([
      { ...trade({ id: "2", netPnl: "5", closedAt: "2026-03-02T10:00:00Z" }), maxSize: "9" },
      { ...trade({ id: "1", netPnl: "-5", closedAt: "2026-03-01T10:00:00Z" }), maxSize: "1" },
    ]);
    expect(result.afterLosses).toEqual([{ streak: 1, trades: 1, averageSize: "9" }]);
  });
});

describe("computeCommissionDrag", () => {
  it("reports what share of gross profit the broker took", () => {
    const result = computeCommissionDrag([
      trade({ id: "a", grossPnl: "100", totalCommissions: "20", netPnl: "80" }),
    ]);
    expect(result.dragPct).toBeCloseTo(20, 6);
    expect(result.netPnl).toBe("80");
  });

  it("calls out commissions eating the entire edge", () => {
    const result = computeCommissionDrag([
      trade({ id: "a", grossPnl: "100", totalCommissions: "110", netPnl: "-10" }),
    ]);
    expect(result.dragPct).toBeCloseTo(110, 6);
    expect(result.message).toContain("toda la ganancia bruta");
  });

  it("does not compute a percentage of a non-positive gross", () => {
    const result = computeCommissionDrag([
      trade({ id: "a", grossPnl: "-50", totalCommissions: "5", netPnl: "-55" }),
    ]);
    expect(result.dragPct).toBeNull();
  });

  it("says so when there is nothing closed", () => {
    expect(computeCommissionDrag([]).message).toContain("Todavía no hay operaciones cerradas");
  });
});

describe("computeExpectancy", () => {
  it("computes expectancy, payoff ratio and win rate from the real distribution", () => {
    const result = computeExpectancy([
      trade({ id: "a", netPnl: "30" }),
      trade({ id: "b", netPnl: "30" }),
      trade({ id: "c", netPnl: "-10" }),
      trade({ id: "d", netPnl: "-10" }),
    ]);

    expect(result.winRate).toBe(50);
    expect(result.averageWin).toBe("30");
    expect(result.averageLoss).toBe("10");
    expect(result.payoffRatio).toBe(3);
    expect(result.expectancy).toBe("10");
  });

  it("reports certain ruin when there is no edge", () => {
    // Losing more than winning, sustained, has exactly one outcome.
    const result = computeExpectancy([
      trade({ id: "a", netPnl: "10" }),
      trade({ id: "b", netPnl: "-30" }),
    ]);
    expect(result.riskOfRuin).toBe(1);
    expect(result.message).toContain("no hay ventaja");
  });

  it("gives a lower ruin probability to a bigger account", () => {
    const trades = [
      trade({ id: "a", netPnl: "30" }),
      trade({ id: "b", netPnl: "30" }),
      trade({ id: "c", netPnl: "-10" }),
    ];
    const small = computeExpectancy(trades, { riskUnitsInAccount: 5 });
    const large = computeExpectancy(trades, { riskUnitsInAccount: 50 });

    expect(small.riskOfRuin).not.toBeNull();
    expect(large.riskOfRuin!).toBeLessThan(small.riskOfRuin!);
  });

  it("leaves ruin undefined with no losses to measure against", () => {
    const result = computeExpectancy([trade({ id: "a", netPnl: "10" })]);
    expect(result.riskOfRuin).toBeNull();
    expect(result.payoffRatio).toBeNull();
  });

  it("returns nulls rather than zeros with nothing closed", () => {
    // Zero would read as "your expectancy is zero", which is a claim.
    const result = computeExpectancy([]);
    expect(result.expectancy).toBeNull();
    expect(result.winRate).toBeNull();
  });
});

describe("compareToBuyAndHold", () => {
  it("computes what simply holding would have made", () => {
    const result = compareToBuyAndHold({
      tradingNetPnl: "50",
      startPrice: "60000",
      endPrice: "62000",
      size: "2",
      contractSize: "0.01",
    });

    // 2000 puntos * 2 contratos * 0.01 = 40
    expect(result.buyAndHoldPnl).toBe("40");
    expect(result.difference).toBe("10");
    expect(result.beatsBuyAndHold).toBe(true);
  });

  it("says plainly when doing nothing would have paid better", () => {
    const result = compareToBuyAndHold({
      tradingNetPnl: "10",
      startPrice: "60000",
      endPrice: "62000",
      size: "2",
      contractSize: "0.01",
    });
    expect(result.beatsBuyAndHold).toBe(false);
    expect(result.message).toContain("Quedarte quieto");
  });

  it("handles a falling market, where holding loses", () => {
    const result = compareToBuyAndHold({
      tradingNetPnl: "5",
      startPrice: "62000",
      endPrice: "60000",
      size: "1",
      contractSize: "0.01",
    });
    expect(result.buyAndHoldPnl).toBe("-20");
    expect(result.beatsBuyAndHold).toBe(true);
  });
});

describe("computeDailyLimitBreaches", () => {
  const trades = [
    trade({ id: "a", netPnl: "-300", closedAt: "2026-03-02T14:00:00Z" }),
    trade({ id: "b", netPnl: "-100", closedAt: "2026-03-02T16:00:00Z" }),
    trade({ id: "c", netPnl: "50", closedAt: "2026-03-03T14:00:00Z" }),
  ];

  it("flags the day that broke the loss limit", () => {
    const result = computeDailyLimitBreaches(trades, "UTC", { maxDailyLoss: 350 });
    const bad = result.find((r) => r.date === "2026-03-02")!;
    expect(bad.realizedPnl).toBe("-400");
    expect(bad.exceededLossLimit).toBe(true);
    expect(result.find((r) => r.date === "2026-03-03")!.exceededLossLimit).toBe(false);
  });

  it("flags the day that broke the trade count limit", () => {
    const result = computeDailyLimitBreaches(trades, "UTC", { maxTradesPerDay: 1 });
    expect(result.find((r) => r.date === "2026-03-02")!.exceededTradeLimit).toBe(true);
    expect(result.find((r) => r.date === "2026-03-03")!.exceededTradeLimit).toBe(false);
  });

  it("treats an unset limit as no limit rather than as zero", () => {
    // A max daily loss of 0 would mark every losing day; null must not.
    const result = computeDailyLimitBreaches(trades, "UTC", {
      maxDailyLoss: null,
      maxTradesPerDay: null,
    });
    expect(result.every((r) => !r.exceededLossLimit && !r.exceededTradeLimit)).toBe(true);
  });

  it("groups by the user's timezone", () => {
    const result = computeDailyLimitBreaches(
      [trade({ id: "a", netPnl: "-10", closedAt: "2026-03-03T02:00:00Z" })],
      "America/Bogota",
      {},
    );
    expect(result[0].date).toBe("2026-03-02");
  });
});
