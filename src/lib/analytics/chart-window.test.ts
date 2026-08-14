import { describe, expect, it } from "vitest";

import {
  coversWholeTrade,
  GRANULARITY_ORDER,
  isGranularityViable,
  pickChartWindow,
  windowForGranularity,
} from "./chart-window";

const MAX_CANDLES = 300;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Mirrors the module's own private table -- kept here so a change to it fails loudly. */
const GRANULARITY_SECONDS = {
  ONE_MINUTE: 60,
  FIVE_MINUTE: 5 * 60,
  FIFTEEN_MINUTE: 15 * 60,
  THIRTY_MINUTE: 30 * 60,
  ONE_HOUR: HOUR,
  TWO_HOUR: 2 * HOUR,
  FOUR_HOUR: 4 * HOUR,
  SIX_HOUR: 6 * HOUR,
  ONE_DAY: DAY,
} as const;

function spanSeconds(window: { start: Date; end: Date }): number {
  return (window.end.getTime() - window.start.getTime()) / 1000;
}

describe("pickChartWindow", () => {
  it("always pads the window strictly around the trade", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, end } = pickChartWindow(openedAt, closedAt);

    expect(start.getTime()).toBeLessThan(openedAt.getTime());
    expect(end.getTime()).toBeGreaterThan(closedAt.getTime());
  });

  it("opens a short scalp at hourly candles, not at five minutes of noise", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, granularity } = pickChartWindow(openedAt, closedAt);

    expect(granularity).toBe("ONE_HOUR");
    // The point of that default: comfortably more than a week of context
    // before entry, so the trade is readable against what preceded it.
    expect(openedAt.getTime() - start.getTime()).toBeGreaterThan(7 * DAY * 1000);
  });

  it("still opens hourly for a multi-day trade", () => {
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const closedAt = new Date("2026-08-04T00:00:00Z"); // 3-day trade
    const { granularity } = pickChartWindow(openedAt, closedAt);

    expect(granularity).toBe("ONE_HOUR");
  });

  it("treats an instantaneous (or backwards) window as at least 60 seconds", () => {
    const instant = new Date("2026-08-11T14:00:00Z");
    const { start, end, granularity } = pickChartWindow(instant, instant);

    expect(start.getTime()).toBeLessThan(instant.getTime());
    expect(end.getTime()).toBeGreaterThan(instant.getTime());
    expect(granularity).toBe("ONE_HOUR");
  });

  it("never asks Coinbase for more candles than one request returns", () => {
    const cases: [string, string][] = [
      ["2026-08-11T14:00:00Z", "2026-08-11T14:05:00Z"],
      ["2026-08-01T00:00:00Z", "2026-08-04T00:00:00Z"],
      ["2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z"],
    ];

    for (const [opened, closed] of cases) {
      const window = pickChartWindow(new Date(opened), new Date(closed));
      const secondsPerCandle = spanSeconds(window) / MAX_CANDLES;
      expect(secondsPerCandle).toBeGreaterThan(0);
      expect(spanSeconds(window)).toBeLessThanOrEqual(MAX_CANDLES * DAY);
    }
  });

  it("agrees with an explicit re-selection of the same granularity", () => {
    // Otherwise picking "1 h" while already on "1 h" would visibly jump.
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");

    const auto = pickChartWindow(openedAt, closedAt);
    const manual = windowForGranularity(openedAt, closedAt, auto.granularity);

    expect(manual.start.toISOString()).toBe(auto.start.toISOString());
    expect(manual.end.toISOString()).toBe(auto.end.toISOString());
  });
});

describe("windowForGranularity", () => {
  it("spends the full candle budget so a finer granularity zooms in", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:40:00Z");

    const oneMinute = windowForGranularity(openedAt, closedAt, "ONE_MINUTE");
    const oneHour = windowForGranularity(openedAt, closedAt, "ONE_HOUR");

    expect(spanSeconds(oneMinute)).toBe(MAX_CANDLES * 60);
    expect(spanSeconds(oneHour)).toBe(MAX_CANDLES * HOUR);
    // The whole point of the fix: 1-minute shows a much tighter window.
    expect(spanSeconds(oneMinute)).toBeLessThan(spanSeconds(oneHour));
  });

  it("keeps the trade inside the window with 3:1 pre/post context", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:40:00Z");
    const window = windowForGranularity(openedAt, closedAt, "FIVE_MINUTE");

    const pre = (openedAt.getTime() - window.start.getTime()) / 1000;
    const post = (window.end.getTime() - closedAt.getTime()) / 1000;

    expect(pre).toBeGreaterThan(0);
    expect(post).toBeGreaterThan(0);
    expect(pre / post).toBeCloseTo(3, 6);
  });

  it("still returns a window for a trade longer than the budget, showing its most recent slice", () => {
    // This is the case the user actually hit: a position held for days, and
    // 1-minute refusing to load. It must show the last few hours instead of
    // nothing.
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const closedAt = new Date("2026-08-15T00:00:00Z");
    const window = windowForGranularity(openedAt, closedAt, "ONE_MINUTE");

    expect(spanSeconds(window)).toBe(MAX_CANDLES * 60);
    // Anchored to the end of the trade, not its start.
    expect(window.end.getTime()).toBeGreaterThan(closedAt.getTime());
    expect(window.start.getTime()).toBeGreaterThan(openedAt.getTime());
  });

  it("never asks for more than the candle cap, whichever branch it takes", () => {
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const short = new Date("2026-08-01T00:30:00Z");
    const long = new Date("2026-09-01T00:00:00Z");

    for (const closedAt of [short, long]) {
      for (const g of GRANULARITY_ORDER) {
        const window = windowForGranularity(openedAt, closedAt, g);
        expect(spanSeconds(window)).toBeLessThanOrEqual(MAX_CANDLES * GRANULARITY_SECONDS[g]);
      }
    }
  });
});

describe("coversWholeTrade", () => {
  it("is true for every fine granularity on a short trade", () => {
    // The regression this guards: with the old fixed window these were all
    // disabled on every trade, which is what the user saw as "no están
    // funcionando todos los time frames".
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:40:00Z");

    for (const g of ["ONE_MINUTE", "FIVE_MINUTE", "FIFTEEN_MINUTE", "THIRTY_MINUTE", "ONE_HOUR"] as const) {
      expect(coversWholeTrade(openedAt, closedAt, g), g).toBe(true);
    }
  });

  it("reports which granularities leave the entry out of view", () => {
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const closedAt = new Date("2026-08-08T00:00:00Z"); // 7-day trade

    expect(coversWholeTrade(openedAt, closedAt, "ONE_MINUTE")).toBe(false);
    expect(coversWholeTrade(openedAt, closedAt, "THIRTY_MINUTE")).toBe(false);
    expect(coversWholeTrade(openedAt, closedAt, "ONE_HOUR")).toBe(true);
    expect(coversWholeTrade(openedAt, closedAt, "ONE_DAY")).toBe(true);
  });

  it("is exact at the boundary", () => {
    const openedAt = new Date("2026-08-11T00:00:00Z");
    const exactly = new Date(openedAt.getTime() + MAX_CANDLES * 60 * 1000);
    const oneOver = new Date(exactly.getTime() + 60 * 1000);

    expect(coversWholeTrade(openedAt, exactly, "ONE_MINUTE")).toBe(true);
    expect(coversWholeTrade(openedAt, oneOver, "ONE_MINUTE")).toBe(false);
  });
});

describe("isGranularityViable", () => {
  it("accepts a granularity that fits comfortably under the candle cap", () => {
    expect(isGranularityViable(7 * DAY, "ONE_HOUR")).toBe(true);
  });

  it("rejects a granularity that would exceed the candle cap for the window", () => {
    expect(isGranularityViable(7 * DAY, "ONE_MINUTE")).toBe(false);
  });

  it("is exact at the boundary (300 candles is viable, 301 is not)", () => {
    expect(isGranularityViable(300 * 60, "ONE_MINUTE")).toBe(true);
    expect(isGranularityViable(301 * 60, "ONE_MINUTE")).toBe(false);
  });
});
