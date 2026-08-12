import { describe, expect, it } from "vitest";

import { isGranularityViable, pickChartWindow } from "./chart-window";

describe("pickChartWindow", () => {
  it("always pads the window strictly around the trade", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, end } = pickChartWindow(openedAt, closedAt);

    expect(start.getTime()).toBeLessThan(openedAt.getTime());
    expect(end.getTime()).toBeGreaterThan(closedAt.getTime());
  });

  it("defaults to at least a week of pre-entry context for a short trade", () => {
    const openedAt = new Date("2026-08-11T14:00:00Z");
    const closedAt = new Date("2026-08-11T14:05:00Z");
    const { start, end, granularity } = pickChartWindow(openedAt, closedAt);

    // 5 min trade -> 25% padding (75s) is below the 45 min post-exit floor,
    // so that floor applies after exit. Before entry, 3x the post padding
    // (135 min) is nowhere near the 1-week minimum, so the week-long floor
    // wins instead.
    expect(start.toISOString()).toBe("2026-08-04T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-11T14:50:00.000Z");
    // ~1 week + 50 min fits in 169 one-hour candles -- the finest
    // granularity that still clears Coinbase's per-request candle cap.
    expect(granularity).toBe("ONE_HOUR");
  });

  it("picks a coarser granularity for a multi-day trade, still floored at a week of pre-entry context", () => {
    const openedAt = new Date("2026-08-01T00:00:00Z");
    const closedAt = new Date("2026-08-04T00:00:00Z"); // 3-day trade
    const { start, end, granularity } = pickChartWindow(openedAt, closedAt);

    // 25% of 3 days (18h) exceeds the 6h post-exit padding cap, so that cap
    // wins after exit. Before entry, 3x the (capped) post padding is 18h,
    // far short of the 1-week minimum, so the week-long floor wins there.
    expect(start.toISOString()).toBe("2026-07-25T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T06:00:00.000Z");
    expect(granularity).toBe("ONE_HOUR");
  });

  it("treats an instantaneous (or backwards) window as at least 60 seconds", () => {
    const instant = new Date("2026-08-11T14:00:00Z");
    const { start, end, granularity } = pickChartWindow(instant, instant);

    expect(start.getTime()).toBeLessThan(instant.getTime());
    expect(end.getTime()).toBeGreaterThan(instant.getTime());
    expect(granularity).toBe("ONE_HOUR");
  });
});

describe("isGranularityViable", () => {
  it("accepts a granularity that fits comfortably under the candle cap", () => {
    // 1 week at 1-hour candles = 168 candles.
    expect(isGranularityViable(7 * 24 * 60 * 60, "ONE_HOUR")).toBe(true);
  });

  it("rejects a granularity that would exceed the candle cap for the window", () => {
    // 1 week at 1-minute candles = 10,080 candles -- Coinbase would never
    // return that from a single request, so the UI must not offer it.
    expect(isGranularityViable(7 * 24 * 60 * 60, "ONE_MINUTE")).toBe(false);
  });

  it("is exact at the boundary (300 candles is viable, 301 is not)", () => {
    expect(isGranularityViable(300 * 60, "ONE_MINUTE")).toBe(true);
    expect(isGranularityViable(301 * 60, "ONE_MINUTE")).toBe(false);
  });
});
