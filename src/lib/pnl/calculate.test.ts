import { describe, expect, it } from "vitest";

import { calculatePnl } from "./calculate";

describe("calculatePnl -- documented scenarios (docs/PNL_METHODOLOGY.md)", () => {
  it("long, full close: worked example from the methodology doc", () => {
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "61200.00",
      exitWap: "61850.00",
      totalEntryQty: "3",
      totalExitQty: "3",
      entryCommissions: "1.80",
      exitCommissions: "1.86",
      contractSize: "0.01",
    });

    expect(result.grossPnl).toBe("19.5");
    expect(result.netPnl).toBe("15.84");
    expect(result.notionalValue).toBe("1836");
    expect(Number(result.returnPct)).toBeCloseTo(0.8627, 3);
  });

  it("short, full close: gain when price falls", () => {
    const result = calculatePnl({
      direction: "SHORT",
      entryWap: "62400.00",
      exitWap: "62050.00",
      totalEntryQty: "5",
      totalExitQty: "5",
      entryCommissions: "3.00",
      exitCommissions: "2.95",
      contractSize: "0.01",
    });

    expect(result.grossPnl).toBe("17.5");
    expect(result.netPnl).toBe("11.55");
    expect(result.notionalValue).toBe("3120");
  });

  it("short, full close: loss when price rises", () => {
    const result = calculatePnl({
      direction: "SHORT",
      entryWap: "100",
      exitWap: "110",
      totalEntryQty: "1",
      totalExitQty: "1",
      entryCommissions: "0",
      exitCommissions: "0",
      contractSize: "1",
    });

    expect(result.grossPnl).toBe("-10");
    expect(result.netPnl).toBe("-10");
  });

  it("multi-entry, multi-exit long: WAPs already size-weighted by the reconstruction engine", () => {
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "63020.00", // (63000*2 + 63040*2) / 4
      exitWap: "63460.00", // (63500*2 + 63420*2) / 4
      totalEntryQty: "4",
      totalExitQty: "4",
      entryCommissions: "2.40",
      exitCommissions: "2.54",
      contractSize: "0.01",
    });

    expect(result.grossPnl).toBe("17.6");
    expect(result.netPnl).toBe("12.66");
    expect(result.notionalValue).toBe("2520.8");
  });

  it("reversal: the closed leg computes P&L on the reversal-split exit only", () => {
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "64100.00",
      exitWap: "63780.00",
      totalEntryQty: "2",
      totalExitQty: "2",
      entryCommissions: "1.28",
      exitCommissions: "1.276",
      contractSize: "0.01",
    });

    expect(result.grossPnl).toBe("-6.4");
    expect(Number(result.netPnl)).toBeCloseTo(-8.956, 6);
  });

  it("reversal: the newly-opened leg has no realized P&L yet (null, not zero)", () => {
    const result = calculatePnl({
      direction: "SHORT",
      entryWap: "63780.00",
      exitWap: null,
      totalEntryQty: "3",
      totalExitQty: "0",
      entryCommissions: "1.914",
      exitCommissions: "0",
      contractSize: "0.01",
    });

    expect(result.grossPnl).toBeNull();
    expect(result.netPnl).toBeNull();
    expect(result.returnPct).toBeNull();
    expect(result.notionalValue).toBe("1913.4");
  });

  it("partial exit (position increase then reduction, still open): P&L realized only on the closed slice", () => {
    // Bought 8 total, sold 2 -- 6 still open. Realized P&L must reflect
    // only the 2 contracts actually closed, not the full 8.
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "100",
      exitWap: "110",
      totalEntryQty: "8",
      totalExitQty: "2",
      entryCommissions: "0",
      exitCommissions: "0",
      contractSize: "1",
    });

    expect(result.grossPnl).toBe("20"); // (110-100) * 2, NOT * 8
    expect(result.notionalValue).toBe("800"); // 100 * 8, the full position's notional
  });

  it("zero commissions still produce a defined (non-null) net P&L when something closed", () => {
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "50",
      exitWap: "55",
      totalEntryQty: "1",
      totalExitQty: "1",
      entryCommissions: "0",
      exitCommissions: "0",
      contractSize: "1",
    });

    expect(result.netPnl).toBe("5");
  });

  it("uses decimal arithmetic: no floating-point drift on repeating-fraction inputs", () => {
    const result = calculatePnl({
      direction: "LONG",
      entryWap: "0.1",
      exitWap: "0.2",
      totalEntryQty: "3",
      totalExitQty: "3",
      entryCommissions: "0",
      exitCommissions: "0",
      contractSize: "1",
    });

    // Native JS float math gives 0.1 + 0.2 - style drift (0.30000000000000004);
    // decimal.js must not.
    expect(result.grossPnl).toBe("0.3");
  });
});
