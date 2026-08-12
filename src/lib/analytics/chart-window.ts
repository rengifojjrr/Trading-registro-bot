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
// MAX_CANDLES_PER_REQUEST is also the most detailed one available. Exported
// because the manual granularity selector (components/trades/trade-chart.tsx)
// lists its options in this same order.
export const GRANULARITY_ORDER: CoinbaseCandleGranularity[] = [
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

// Single source of truth for both the server-picked default label
// (lib/coinbase/fetch-trade-candles.ts) and the client selector's option
// labels (components/trades/trade-chart.tsx).
export const GRANULARITY_LABELS: Record<CoinbaseCandleGranularity, string> = {
  ONE_MINUTE: "1 min",
  FIVE_MINUTE: "5 min",
  FIFTEEN_MINUTE: "15 min",
  THIRTY_MINUTE: "30 min",
  ONE_HOUR: "1 h",
  TWO_HOUR: "2 h",
  FOUR_HOUR: "4 h",
  SIX_HOUR: "6 h",
  ONE_DAY: "1 día",
};

const MIN_PADDING_SECONDS = 45 * 60;
const MAX_PADDING_SECONDS = 6 * 60 * 60;
const PADDING_FRACTION = 0.25;
// Traders care more about "what was the market doing before I got in" than
// the aftermath, so the window looks back further than it looks forward.
const PRE_ENTRY_MULTIPLIER = 3;
// User feedback: even a short scalp should default to at least a week of
// pre-entry context, not just a scaled-up multiple of its own (short)
// duration -- this is what actually dominates prePadding below for every
// trade duration in practice, since postPadding's own MAX_PADDING_SECONDS
// cap means the multiplier term above can never exceed 18h.
const MIN_PRE_ENTRY_PADDING_SECONDS = 7 * 24 * 60 * 60;

export interface ChartWindow {
  start: Date;
  end: Date;
  granularity: CoinbaseCandleGranularity;
}

function candleCountFor(totalSeconds: number, granularity: CoinbaseCandleGranularity): number {
  return Math.ceil(totalSeconds / GRANULARITY_SECONDS[granularity]);
}

/**
 * Whether requesting `granularity` over a window spanning `totalSeconds`
 * stays under Coinbase's per-request candle cap. Exported so the manual
 * granularity selector (components/trades/trade-chart.tsx) can disable
 * options that would silently overrun the cap for the current window --
 * e.g. 1-minute candles across the default ~1-week pre-entry window.
 */
export function isGranularityViable(totalSeconds: number, granularity: CoinbaseCandleGranularity): boolean {
  return candleCountFor(totalSeconds, granularity) <= MAX_CANDLES_PER_REQUEST;
}

/**
 * Picks a time window (trade duration + context padding on both sides,
 * weighted toward pre-entry context, with at least a week of pre-entry
 * context regardless of trade duration) and the finest candle granularity
 * that still fits Coinbase's 350-candle cap -- so a five-minute scalp still
 * gets a full week of hourly context instead of the trade duration itself
 * dictating the whole window.
 */
export function pickChartWindow(openedAt: Date, closedAt: Date): ChartWindow {
  const durationSeconds = Math.max((closedAt.getTime() - openedAt.getTime()) / 1000, 60);
  const postPadding = Math.min(Math.max(durationSeconds * PADDING_FRACTION, MIN_PADDING_SECONDS), MAX_PADDING_SECONDS);
  const prePadding = Math.max(postPadding * PRE_ENTRY_MULTIPLIER, MIN_PRE_ENTRY_PADDING_SECONDS);

  const start = new Date(openedAt.getTime() - prePadding * 1000);
  const end = new Date(closedAt.getTime() + postPadding * 1000);
  const totalSeconds = (end.getTime() - start.getTime()) / 1000;

  const granularity = GRANULARITY_ORDER.find((g) => isGranularityViable(totalSeconds, g)) ?? "ONE_DAY";

  return { start, end, granularity };
}
