import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";

// Coinbase caps a single /candles request at 350 rows (confirmed
// docs.cdp.coinbase.com 2026-08-11); staying under that with margin avoids
// ever needing pagination just to draw a trade chart.
const MAX_CANDLES_PER_REQUEST = 300;

const GRANULARITY_SECONDS: Record<CoinbaseCandleGranularity, number> = {
  ONE_MINUTE: 60,
  FIVE_MINUTE: 5 * 60,
  FIFTEEN_MINUTE: 15 * 60,
  THIRTY_MINUTE: 30 * 60,
  ONE_HOUR: 60 * 60,
  TWO_HOUR: 2 * 60 * 60,
  FOUR_HOUR: 4 * 60 * 60,
  SIX_HOUR: 6 * 60 * 60,
  ONE_DAY: 24 * 60 * 60,
};

// Ordered finest-to-coarsest so the first one that fits the window under
// MAX_CANDLES_PER_REQUEST is also the most detailed one available.
const GRANULARITY_ORDER: CoinbaseCandleGranularity[] = [
  "ONE_MINUTE",
  "FIVE_MINUTE",
  "FIFTEEN_MINUTE",
  "THIRTY_MINUTE",
  "ONE_HOUR",
  "TWO_HOUR",
  "FOUR_HOUR",
  "SIX_HOUR",
  "ONE_DAY",
];

const MIN_PADDING_SECONDS = 15 * 60;
const MAX_PADDING_SECONDS = 6 * 60 * 60;
const PADDING_FRACTION = 0.25;

export interface ChartWindow {
  start: Date;
  end: Date;
  granularity: CoinbaseCandleGranularity;
}

/**
 * Picks a time window (trade duration + context padding on both sides) and
 * the finest candle granularity that still fits Coinbase's 350-candle cap,
 * so a five-minute scalp gets minute candles and a three-day swing gets
 * hourly ones instead of an unreadable wall of 1-minute bars.
 */
export function pickChartWindow(openedAt: Date, closedAt: Date): ChartWindow {
  const durationSeconds = Math.max((closedAt.getTime() - openedAt.getTime()) / 1000, 60);
  const padding = Math.min(Math.max(durationSeconds * PADDING_FRACTION, MIN_PADDING_SECONDS), MAX_PADDING_SECONDS);

  const start = new Date(openedAt.getTime() - padding * 1000);
  const end = new Date(closedAt.getTime() + padding * 1000);
  const totalSeconds = (end.getTime() - start.getTime()) / 1000;

  const granularity =
    GRANULARITY_ORDER.find((g) => totalSeconds / GRANULARITY_SECONDS[g] <= MAX_CANDLES_PER_REQUEST) ?? "ONE_DAY";

  return { start, end, granularity };
}
