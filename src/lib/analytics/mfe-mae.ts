import { Decimal } from "decimal.js";

export interface MfeMaeCandle {
  time: number; // unix seconds
  high: number;
  low: number;
}

export interface MfeMaeResult {
  /** Best price reached in your favor while the trade was open. */
  mfePrice: string;
  /** Worst price reached against you while the trade was open. */
  maePrice: string;
  /** $ equivalent of mfePrice vs. entry, over the trade's peak size -- no commissions, never the trade's real P&L. */
  mfeAmount: string;
  maeAmount: string;
  /** How many candles the excursion was computed from -- surfaced so a thin sample (coarse granularity, short window) can be flagged as such rather than presented with false precision. */
  candleCount: number;
}

/**
 * Maximum Favorable/Adverse Excursion: how far price moved in your favor
 * and against you at any point *during* the trade, before it closed --
 * distinct from the entry/exit prices themselves, which only capture where
 * you actually got in and out. Computed from the same candle window already
 * fetched for the trade chart (lib/coinbase/fetch-trade-candles.ts),
 * restricted to candles strictly inside [openedAt, closedAt] -- the
 * chart's own padding on either side must not leak into this number.
 *
 * Returns null when there are no candles inside that window at all (should
 * be rare -- pickChartWindow always covers the trade itself -- but never
 * fabricate an excursion from zero data points).
 *
 * The $ amounts use the trade's peak size (max_size) for the whole window,
 * which over/understates a partial-fill trade's true excursion at each
 * moment in time -- a documented approximation, not the audited P&L.
 */
export function computeMfeMae(
  candles: MfeMaeCandle[],
  params: {
    openedAtUnix: number;
    closedAtUnix: number;
    direction: "LONG" | "SHORT";
    entryWap: string;
    maxSize: string;
    contractSize: string;
  },
): MfeMaeResult | null {
  const inWindow = candles.filter((c) => c.time >= params.openedAtUnix && c.time <= params.closedAtUnix);
  if (inWindow.length === 0) return null;

  const maxHigh = Math.max(...inWindow.map((c) => c.high));
  const minLow = Math.min(...inWindow.map((c) => c.low));
  const favorablePrice = params.direction === "LONG" ? maxHigh : minLow;
  const adversePrice = params.direction === "LONG" ? minLow : maxHigh;

  const entryWap = new Decimal(params.entryWap);
  const size = new Decimal(params.maxSize).times(params.contractSize);
  const amountFor = (price: number) => {
    const delta = params.direction === "LONG" ? new Decimal(price).minus(entryWap) : entryWap.minus(price);
    return delta.times(size).toString();
  };

  return {
    mfePrice: String(favorablePrice),
    maePrice: String(adversePrice),
    mfeAmount: amountFor(favorablePrice),
    maeAmount: amountFor(adversePrice),
    candleCount: inWindow.length,
  };
}
