import { describe, expect, it } from "vitest";

import {
  comparePeriods,
  computeHourBreakdown,
  computeRDistribution,
  computeSessionBreakdown,
  computeWeekdayBreakdown,
  summarizeExcursions,
  type TradeForBreakdown,
} from "./breakdowns";

function trade(overrides: Partial<TradeForBreakdown> & { id: string }): TradeForBreakdown {
  return {
    status: "CLOSED",
    openedAt: "2026-08-10T14:00:00.000Z",
    netPnl: "10",
    session: "NEW_YORK",
    resultR: null,
    ...overrides,
  };
}

describe("computeSessionBreakdown", () => {
  it("groups by session and reports win rate per bucket", () => {
    const buckets = computeSessionBreakdown([
      trade({ id: "1", session: "TOKYO", netPnl: "-50" }),
      trade({ id: "2", session: "TOKYO", netPnl: "-30" }),
      trade({ id: "3", session: "LONDON", netPnl: "80" }),
    ]);

    const tokyo = buckets.find((b) => b.key === "TOKYO")!;
    const london = buckets.find((b) => b.key === "LONDON")!;

    expect(tokyo.trades).toBe(2);
    expect(tokyo.netPnl).toBe("-80");
    expect(tokyo.winRate).toBe(0);
    expect(tokyo.average).toBe("-40");
    expect(london.winRate).toBe(100);
  });

  it("omits sessions with no trades instead of emitting empty rows", () => {
    const buckets = computeSessionBreakdown([trade({ id: "1", session: "LONDON" })]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe("LONDON");
  });

  it("ignores open trades, which have no final P&L to attribute", () => {
    const buckets = computeSessionBreakdown([
      trade({ id: "1", session: "LONDON", status: "OPEN", netPnl: null }),
      trade({ id: "2", session: "LONDON", netPnl: "25" }),
    ]);
    expect(buckets[0].trades).toBe(1);
    expect(buckets[0].netPnl).toBe("25");
  });
});

describe("computeWeekdayBreakdown", () => {
  it("buckets by the user's local weekday, not UTC", () => {
    // 2026-08-10T02:00Z is a Monday in UTC but still Sunday in New York.
    const rows = [trade({ id: "1", openedAt: "2026-08-10T02:00:00.000Z" })];

    const utc = computeWeekdayBreakdown(rows, "UTC");
    const newYork = computeWeekdayBreakdown(rows, "America/New_York");

    expect(utc[0].label).toBe("Lunes");
    expect(newYork[0].label).toBe("Domingo");
  });
});

describe("computeHourBreakdown", () => {
  it("groups by local hour, sorted ascending", () => {
    const buckets = computeHourBreakdown(
      [
        trade({ id: "1", openedAt: "2026-08-10T15:00:00.000Z" }),
        trade({ id: "2", openedAt: "2026-08-10T09:00:00.000Z" }),
        trade({ id: "3", openedAt: "2026-08-11T09:30:00.000Z" }),
      ],
      "UTC",
    );

    expect(buckets.map((b) => b.label)).toEqual(["09:00", "15:00"]);
    expect(buckets[0].trades).toBe(2);
  });
});

describe("computeRDistribution", () => {
  it("bins R values and reports the average", () => {
    const result = computeRDistribution([
      trade({ id: "1", resultR: "2.5" }),
      trade({ id: "2", resultR: "-1.5" }),
      trade({ id: "3", resultR: "0.5" }),
    ]);

    expect(result.sampleSize).toBe(3);
    expect(result.bins.find((b) => b.label === "2R a 3R")!.count).toBe(1);
    expect(result.bins.find((b) => b.label === "-2R a -1R")!.count).toBe(1);
    expect(result.bins.find((b) => b.label === "0 a 1R")!.count).toBe(1);
    expect(Number(result.averageR)).toBeCloseTo(0.5, 10);
  });

  it("counts trades without an R value as missing, never as zero", () => {
    const result = computeRDistribution([
      trade({ id: "1", resultR: null }),
      trade({ id: "2", resultR: "" }),
      trade({ id: "3", resultR: "1" }),
    ]);

    expect(result.sampleSize).toBe(1);
    // A "0" bin count of 1 here would mean the two unjournalled trades were
    // silently treated as breakeven.
    expect(result.bins.find((b) => b.label === "-1R a 0")!.count).toBe(0);
    expect(result.averageR).toBe("1");
  });

  it("returns a null average when nothing has been journalled yet", () => {
    const result = computeRDistribution([trade({ id: "1", resultR: null })]);
    expect(result.sampleSize).toBe(0);
    expect(result.averageR).toBeNull();
  });

  it("puts extreme values in the open-ended end bins", () => {
    const result = computeRDistribution([trade({ id: "1", resultR: "-8" }), trade({ id: "2", resultR: "12" })]);
    expect(result.bins[0].count).toBe(1);
    expect(result.bins[result.bins.length - 1].count).toBe(1);
  });
});

describe("summarizeExcursions", () => {
  it("measures how much of the best move winners handed back", () => {
    const result = summarizeExcursions([
      { tradeId: "1", mfeAmount: "100", maeAmount: "20", netPnl: "40" }, // gave back 60 (>half)
      { tradeId: "2", mfeAmount: "80", maeAmount: "10", netPnl: "70" }, // gave back 10
    ]);

    expect(result.sampleSize).toBe(2);
    expect(Number(result.averageMfe)).toBeCloseTo(90, 10);
    expect(Number(result.averageMae)).toBeCloseTo(15, 10);
    expect(Number(result.averageGiveBack)).toBeCloseTo(35, 10);
    expect(result.gaveBackHalfPct).toBeCloseTo(50, 10); // 1 of 2 winners
  });

  it("excludes losers from give-back, where peak-minus-result mixes two stories", () => {
    const result = summarizeExcursions([
      { tradeId: "1", mfeAmount: "100", maeAmount: "10", netPnl: "90" },
      { tradeId: "2", mfeAmount: "30", maeAmount: "200", netPnl: "-150" },
    ]);

    // Only the winner contributes: 100 - 90 = 10.
    expect(Number(result.averageGiveBack)).toBeCloseTo(10, 10);
    expect(result.gaveBackHalfPct).toBe(0);
    // But both still count toward the excursion averages.
    expect(result.sampleSize).toBe(2);
  });

  it("returns nulls rather than zeros when there is nothing to summarize", () => {
    const result = summarizeExcursions([]);
    expect(result.sampleSize).toBe(0);
    expect(result.averageMfe).toBeNull();
    expect(result.gaveBackHalfPct).toBeNull();
  });

  it("reports a null give-back rate when every trade lost", () => {
    const result = summarizeExcursions([{ tradeId: "1", mfeAmount: "5", maeAmount: "50", netPnl: "-40" }]);
    expect(result.gaveBackHalfPct).toBeNull();
    expect(result.averageGiveBack).toBeNull();
  });
});

describe("comparePeriods", () => {
  it("reports absolute and percentage change against the previous period", () => {
    const result = comparePeriods(
      [trade({ id: "1", netPnl: "150" })],
      [trade({ id: "2", netPnl: "100" })],
    );

    expect(result.netPnl).toBe("150");
    expect(result.previousNetPnl).toBe("100");
    expect(result.delta).toBe("50");
    expect(result.deltaPct).toBeCloseTo(50, 10);
  });

  it("uses the previous period's magnitude, so recovering from a loss reads as an improvement", () => {
    const result = comparePeriods(
      [trade({ id: "1", netPnl: "-50" })],
      [trade({ id: "2", netPnl: "-100" })],
    );
    expect(result.delta).toBe("50");
    expect(result.deltaPct).toBeCloseTo(50, 10); // not -50: losing less is better
  });

  it("returns a null percentage rather than a fake 0% when the previous period was flat", () => {
    const result = comparePeriods([trade({ id: "1", netPnl: "40" })], []);
    expect(result.previousNetPnl).toBe("0");
    expect(result.deltaPct).toBeNull();
    expect(result.previousTrades).toBe(0);
  });
});
