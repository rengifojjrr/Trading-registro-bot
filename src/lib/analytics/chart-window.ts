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
 * stays under Coinbase's per-request candle cap.
 */
export function isGranularityViable(totalSeconds: number, granularity: CoinbaseCandleGranularity): boolean {
  return candleCountFor(totalSeconds, granularity) <= MAX_CANDLES_PER_REQUEST;
}

/** How much of the spare candle budget is spent on pre-entry context (3:1, as above). */
const PRE_ENTRY_SHARE = 0.75;

/** Share of a too-short budget spent after the close, so the exit isn't glued to the right edge. */
const TAIL_PADDING_SHARE = 0.1;

/**
 * The window to request for an explicitly chosen granularity.
 *
 * This inverts the old relationship, which was the bug behind "no están
 * funcionando todos los time frames": the window used to be fixed first (at
 * least a week of pre-entry context) and every granularity that didn't fit
 * inside it was disabled -- which, at a week-wide window, meant 1m/5m/15m/
 * 30m were greyed out on *every* trade. Picking a finer candle should zoom
 * in, exactly like any charting tool, so the granularity now decides the
 * window.
 *
 * Every granularity always returns a window. When the trade is longer than
 * 300 candles of the chosen size -- a position held for days, viewed at one
 * minute -- the window shows its most recent slice instead of refusing:
 * being unable to see the last two hours at 1m just because you've held for
 * a week is exactly the frustration this is meant to remove. Use
 * `coversWholeTrade` to tell the user when the entry is out of view.
 */
export function windowForGranularity(
  openedAt: Date,
  closedAt: Date,
  granularity: CoinbaseCandleGranularity,
): ChartWindow {
  const budgetSeconds = MAX_CANDLES_PER_REQUEST * GRANULARITY_SECONDS[granularity];
  const durationSeconds = Math.max((closedAt.getTime() - openedAt.getTime()) / 1000, 60);

  if (durationSeconds > budgetSeconds) {
    const tail = budgetSeconds * TAIL_PADDING_SHARE;
    const end = new Date(closedAt.getTime() + tail * 1000);
    return { start: new Date(end.getTime() - budgetSeconds * 1000), end, granularity };
  }

  const spare = budgetSeconds - durationSeconds;
  const prePadding = spare * PRE_ENTRY_SHARE;
  const postPadding = spare - prePadding;

  return {
    start: new Date(openedAt.getTime() - prePadding * 1000),
    end: new Date(closedAt.getTime() + postPadding * 1000),
    granularity,
  };
}

/**
 * Whether this granularity can show the trade end to end. False doesn't
 * block anything -- it's what the chart uses to say "the entry is outside
 * this view", so a missing entry marker reads as a zoom level rather than a
 * bug.
 */
export function coversWholeTrade(
  openedAt: Date,
  closedAt: Date,
  granularity: CoinbaseCandleGranularity,
): boolean {
  const budgetSeconds = MAX_CANDLES_PER_REQUEST * GRANULARITY_SECONDS[granularity];
  const durationSeconds = Math.max((closedAt.getTime() - openedAt.getTime()) / 1000, 60);
  return durationSeconds <= budgetSeconds;
}

/**
 * Picks the granularity a trade's chart opens at: the finest one that still
 * gives roughly a week of pre-entry context, so a five-minute scalp opens
 * showing the week around it rather than five minutes of noise. The window
 * itself then comes from windowForGranularity, so the default view and an
 * explicit re-selection of that same granularity agree instead of jumping.
 */
export function pickChartWindow(openedAt: Date, closedAt: Date): ChartWindow {
  const durationSeconds = Math.max((closedAt.getTime() - openedAt.getTime()) / 1000, 60);
  const postPadding = Math.min(Math.max(durationSeconds * PADDING_FRACTION, MIN_PADDING_SECONDS), MAX_PADDING_SECONDS);
  const prePadding = Math.max(postPadding * PRE_ENTRY_MULTIPLIER, MIN_PRE_ENTRY_PADDING_SECONDS);
  const targetSeconds = durationSeconds + prePadding + postPadding;

  const granularity = GRANULARITY_ORDER.find((g) => isGranularityViable(targetSeconds, g)) ?? "ONE_DAY";

  return windowForGranularity(openedAt, closedAt, granularity);
}
