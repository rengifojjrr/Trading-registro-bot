import { describe, expect, it } from "vitest";

import { calculateUnrealizedPnl } from "./unrealized";

describe("calculateUnrealizedPnl", () => {
  it("computes a positive gain for a LONG position when price rose", () => {
    const result = calculateUnrealizedPnl({
      direction: "LONG",
      entryWap: "60000",
      currentPrice: "61000",
      openQty: "2",
      contractSize: "0.01",
      entryCommissions: "1.20",
    });

    // (61000 - 60000) * 2 * 0.01 = 20 gross; 20 - 1.20 = 18.80 net
    expect(result.grossPnl).toBe("20");
    expect(result.netPnl).toBe("18.8");
    // notional = 60000 * 2 * 0.01 = 1200; 18.8 / 1200 * 100
    expect(Number(result.returnPct)).toBeCloseTo(1.5667, 3);
    // 20 / 1200 * 100
    expect(Number(result.grossReturnPct)).toBeCloseTo(1.6667, 3);
  });

  it("can show a gross gain and a net loss at once, near breakeven -- the headline figure must be gross, matching Coinbase's own P&L-excludes-fees convention", () => {
    const result = calculateUnrealizedPnl({
      direction: "LONG",
      entryWap: "60000",
      currentPrice: "60050",
      openQty: "22",
      contractSize: "0.01",
      entryCommissions: "16.66",
    });

    // (60050 - 60000) * 22 * 0.01 = 11 gross (price moved in the trader's
    // favor) but 11 - 16.66 = -5.66 net (commission eats the small gain) --
    // Coinbase's own "unrealized P&L" shows the gross figure, so that must
    // be what drives the headline number and its color, not net.
    expect(result.grossPnl).toBe("11");
    expect(result.netPnl).toBe("-5.66");
    expect(Number(result.grossReturnPct)).toBeGreaterThan(0);
    expect(Number(result.returnPct)).toBeLessThan(0);
  });

  it("computes a positive gain for a SHORT position when price fell", () => {
    const result = calculateUnrealizedPnl({
      direction: "SHORT",
      entryWap: "60000",
      currentPrice: "59000",
      openQty: "2",
      contractSize: "0.01",
      entryCommissions: "1.20",
    });

    // (60000 - 59000) * 2 * 0.01 = 20 gross
    expect(result.grossPnl).toBe("20");
    expect(result.netPnl).toBe("18.8");
  });

  it("computes a loss when price moves against a LONG position", () => {
    const result = calculateUnrealizedPnl({
      direction: "LONG",
      entryWap: "60000",
      currentPrice: "59500",
      openQty: "1",
      contractSize: "0.01",
      entryCommissions: "0.60",
    });

    // (59500 - 60000) * 1 * 0.01 = -5 gross; -5 - 0.60 = -5.60 net
    expect(result.grossPnl).toBe("-5");
    expect(result.netPnl).toBe("-5.6");
  });

  it("returns a null return percentage instead of dividing by zero when there's no open quantity", () => {
    const result = calculateUnrealizedPnl({
      direction: "LONG",
      entryWap: "60000",
      currentPrice: "61000",
      openQty: "0",
      contractSize: "0.01",
      entryCommissions: "0",
    });

    expect(result.grossPnl).toBe("0");
    expect(result.returnPct).toBeNull();
  });
});
