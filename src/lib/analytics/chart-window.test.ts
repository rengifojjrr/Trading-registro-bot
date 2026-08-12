import { describe, expect, it } from "vitest";

import { pickChartWindow } from "./chart-window";

describe("pickChartWindow", () => {
  it("always pads the window strictly around the trade", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, end } = pickChartWindow(openedAt, closedAt);

    expect(start.getTime()).toBeLessThan(openedAt.getTime());
    expect(end.getTime()).toBeGreaterThan(closedAt.getTime());
  });

  it("picks 1-minute candles for a short trade (padding floor applies, weighted before entry)", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, end, granularity } = pickChartWindow(openedAt, closedAt);

    // 5 min trade -> 25% padding (75s) is below the 45 min floor, so the
    // floor applies: 45 min after exit, and 3x that (135 min) before entry.
    expect(start.toISOString()).toBe("2026-08-11T11:45:00.000Z");
    expect(end.toISOString()).toBe("2026-08-11T14:50:00.000Z");
    expect(granularity).toBe("ONE_MINUTE");
  });

  it("picks 5-minute candles once a 1-minute window would exceed the 350-candle cap", () => {
    const openedAt = new Date("2026-08-11T00:00:00Z");
    const closedAt = new Date("2026-08-11T10:00:00Z"); // 10h trade
    const { granularity } = pickChartWindow(openedAt, closedAt);

    // 10h trade -> 25% padding = 2.5h each side (under the 6h cap), total
    // window = 15h = 900 min -> exceeds 300 one-minute candles, fits 5-minute.
    expect(granularity).toBe("FIVE_MINUTE");
  });

  it("picks a coarser granularity for a multi-day trade and caps padding at 6h", () => {
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const closedAt = new Date("2026-08-04T00:00:00Z"); // 3-day trade
    const { start, end, granularity } = pickChartWindow(openedAt, closedAt);

    // 25% of 3 days (18h) would exceed the 6h padding cap, so the cap wins.
    expect(start.toISOString()).toBe("2026-07-31T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T06:00:00.000Z");
    expect(granularity).toBe("THIRTY_MINUTE");
  });

  it("treats an instantaneous (or backwards) window as at least 60 seconds", () => {
    const instant = new Date("2026-08-11T14:00:00Z");
    const { start, end, granularity } = pickChartWindow(instant, instant);

    expect(start.getTime()).toBeLessThan(instant.getTime());
    expect(end.getTime()).toBeGreaterThan(instant.getTime());
    expect(granularity).toBe("ONE_MINUTE");
  });
});
