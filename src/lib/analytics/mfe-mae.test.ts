import { describe, expect, it } from "vitest";

import { computeMfeMae, type MfeMaeCandle } from "./mfe-mae";

const candles: MfeMaeCandle[] = [
  { time: 100, high: 60100, low: 59900 }, // before the trade -- must be excluded
  { time: 200, high: 60300, low: 60000 }, // entry candle
  { time: 300, high: 60800, low: 60200 }, // ran up
  { time: 400, high: 60600, low: 59500 }, // dipped hard against a long
  { time: 500, high: 60700, low: 60400 }, // exit candle
  { time: 600, high: 61500, low: 61000 }, // after the trade -- must be excluded
];

describe("computeMfeMae", () => {
  it("only considers candles inside [openedAt, closedAt], excluding the chart's padding", () => {
    const result = computeMfeMae(candles, {
      openedAtUnix: 200,
      closedAtUnix: 500,
      direction: "LONG",
      entryWap: "60000",
      maxSize: "1",
      contractSize: "0.01",
    });

    expect(result?.candleCount).toBe(4); // times 200, 300, 400, 500
  });

  it("computes MFE as the highest high and MAE as the lowest low for a LONG", () => {
    const result = computeMfeMae(candles, {
      openedAtUnix: 200,
      closedAtUnix: 500,
      direction: "LONG",
      entryWap: "60000",
      maxSize: "1",
      contractSize: "0.01",
    });

    expect(result?.mfePrice).toBe("60800");
    expect(result?.maePrice).toBe("59500");
    // (60800 - 60000) * 1 * 0.01 = 8
    expect(result?.mfeAmount).toBe("8");
    // (59500 - 60000) * 1 * 0.01 = -5
    expect(result?.maeAmount).toBe("-5");
  });

  it("flips favorable/adverse for a SHORT (lowest low is favorable, highest high is adverse)", () => {
    const result = computeMfeMae(candles, {
      openedAtUnix: 200,
      closedAtUnix: 500,
      direction: "SHORT",
      entryWap: "60000",
      maxSize: "1",
      contractSize: "0.01",
    });

    expect(result?.mfePrice).toBe("59500");
    expect(result?.maePrice).toBe("60800");
    // (60000 - 59500) * 1 * 0.01 = 5
    expect(result?.mfeAmount).toBe("5");
    // (60000 - 60800) * 1 * 0.01 = -8
    expect(result?.maeAmount).toBe("-8");
  });

  it("returns null when no candle falls inside the trade's exact window", () => {
    const result = computeMfeMae(candles, {
      openedAtUnix: 10_000,
      closedAtUnix: 20_000,
      direction: "LONG",
      entryWap: "60000",
      maxSize: "1",
      contractSize: "0.01",
    });

    expect(result).toBeNull();
  });
});
