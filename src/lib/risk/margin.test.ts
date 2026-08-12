import { describe, expect, it } from "vitest";

import { calculateMarginRatioAtPrice, calculateMaxContracts, calculateRiskPriceForPosition } from "./margin";

// Constants shared by every test below, mirroring the original prototype's
// own defaults (see the uploaded coinbase_btc_perpetual_risk_calculator.html).
const CONSTANTS = {
  maintenanceMarginRate: "0.10",
  targetMarginRatio: "0.75",
  fundingRatePerHour: "0.00001", // "0.001" typed as a percent in the prototype
  tradingFeePct: "0.0002", // "0.02" typed as a percent
  minFeePerContract: "0.15",
  contractSize: "0.01",
};

describe("calculateMaxContracts", () => {
  it("matches the hand-validated worked example from the PDF documentation", () => {
    // Capital 5,800; reserve 1,000; entry 63,710; risk 49,000; 168h ->
    // documented result: 22 contracts, 0.22 BTC, notional ~14,016.20,
    // leverage ~2.42x, loss at risk ~3,236.20.
    const result = calculateMaxContracts({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "49000",
      hoursOpen: "168",
    });

    expect(result.contracts).toBe(22);
    expect(result.btcExposure).toBe("0.22");
    expect(Number(result.notional)).toBeCloseTo(14016.2, 1);
    expect(Number(result.leverage)).toBeCloseTo(2.42, 2);
    expect(Number(result.lossAtRisk)).toBeCloseTo(3236.2, 1);
  });

  it("rejects a risk price on the wrong side of entry for a LONG (produces 0 contracts, not a negative/nonsensical size)", () => {
    const result = calculateMaxContracts({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "70000", // above entry -- not a loss scenario for a LONG
      hoursOpen: "168",
    });
    expect(result.contracts).toBe(0);
  });

  it("SHORT sizes to fewer contracts than LONG at the same distance from entry -- its risk price is a larger absolute number, so the same MMR carries proportionally more maintenance margin", () => {
    const long = calculateMaxContracts({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "49000", // 14,710 below entry
      hoursOpen: "168",
    });
    const short = calculateMaxContracts({
      ...CONSTANTS,
      direction: "SHORT",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "78420", // 14,710 above entry -- same adverse distance, but a larger absolute price
      hoursOpen: "168",
    });
    expect(short.contracts).toBeGreaterThan(0);
    expect(short.contracts).toBeLessThan(long.contracts);
  });

  it("within one direction, a risk price closer to entry allows more contracts -- surviving only a small move is a less demanding target than surviving a large one", () => {
    const close = calculateMaxContracts({
      ...CONSTANTS,
      direction: "SHORT",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "68000", // +4,290 from entry
      hoursOpen: "168",
    });
    const far = calculateMaxContracts({
      ...CONSTANTS,
      direction: "SHORT",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "90000", // +26,290 from entry -- must survive a much bigger move, so a smaller position
      hoursOpen: "168",
    });
    expect(far.contracts).toBeLessThan(close.contracts);
  });

  it("returns 0 contracts when usable capital can't even cover fixed costs", () => {
    const result = calculateMaxContracts({
      ...CONSTANTS,
      direction: "LONG",
      capital: "100",
      reserveCash: "100", // usable = 0
      entryPrice: "63710",
      riskPrice: "49000",
      hoursOpen: "168",
    });
    expect(result.contracts).toBe(0);
  });
});

describe("calculateRiskPriceForPosition", () => {
  it("is the algebraic inverse of calculateMaxContracts -- feeding the sized position back in recovers (approximately) the original risk price", () => {
    const sized = calculateMaxContracts({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      riskPrice: "49000",
      hoursOpen: "168",
    });

    const solved = calculateRiskPriceForPosition({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      contracts: String(sized.contracts),
      entryCommissions: "0",
    });

    // Not exact: calculateMaxContracts rounds contracts down to a whole
    // number, which the reverse solve doesn't undo -- it should land close
    // to (and, because rounding down means slightly less risk than
    // requested, at or below) the original 49,000 threshold.
    expect(Number(solved.riskPrice)).toBeLessThanOrEqual(49000);
    expect(Number(solved.riskPrice)).toBeGreaterThan(48000);
  });

  it("solves a higher risk price (safer) for SHORT than the LONG mirror when both hold the same contracts", () => {
    const longPrice = calculateRiskPriceForPosition({
      ...CONSTANTS,
      direction: "LONG",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      contracts: "22",
      entryCommissions: "0",
    });
    const shortPrice = calculateRiskPriceForPosition({
      ...CONSTANTS,
      direction: "SHORT",
      capital: "5800",
      reserveCash: "1000",
      entryPrice: "63710",
      contracts: "22",
      entryCommissions: "0",
    });
    // LONG's risk price sits below entry, SHORT's sits above -- both should
    // exist and be finite for this same-sized position.
    expect(Number(longPrice.riskPrice)).toBeLessThan(63710);
    expect(Number(shortPrice.riskPrice)).toBeGreaterThan(63710);
  });
});

describe("calculateMarginRatioAtPrice", () => {
  it("computes a small, real margin ratio for a position barely moved from entry (the user's actual live position, sanity-checked)", () => {
    // Real numbers from the account this session worked with: 22 contracts
    // (0.22 BTC) entered at 63,739.545454545454545, commission 16.6627.
    const result = calculateMarginRatioAtPrice(
      {
        ...CONSTANTS,
        direction: "LONG",
        capital: "14000",
        reserveCash: "0",
        entryPrice: "63739.545454545454545",
        contracts: "22",
        entryCommissions: "16.6627",
      },
      "63725", // close to entry -- small unrealized loss
    );

    expect(Number(result.equity)).toBeLessThan(14000); // commission + small loss both reduce it
    expect(Number(result.maintenanceMargin)).toBeCloseTo(0.1 * 0.22 * 63725, 0);
    expect(Number(result.marginRatio)).toBeGreaterThan(0);
    expect(Number(result.marginRatio)).toBeLessThan(1); // nowhere near critical at this price
  });

  it("returns a null (infinite) margin ratio once equity is fully wiped out", () => {
    const result = calculateMarginRatioAtPrice(
      {
        ...CONSTANTS,
        direction: "LONG",
        capital: "100",
        reserveCash: "0",
        entryPrice: "63710",
        contracts: "22",
        entryCommissions: "0",
      },
      "1", // catastrophic price collapse
    );
    expect(result.marginRatio).toBeNull();
  });
});
