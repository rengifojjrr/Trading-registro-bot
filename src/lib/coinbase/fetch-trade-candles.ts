import "server-only";

import { GRANULARITY_LABELS, pickChartWindow } from "@/lib/analytics/chart-window";
import { serverEnv } from "@/lib/env";

import { CfmAdapter } from "./venues/cfm";
import type { CoinbaseCandle } from "./types";

export interface TradeChartCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeChartData {
  candles: TradeChartCandle[];
  granularityLabel: string;
}

/**
 * Shared by the initial server-rendered fetch below and the manual
 * granularity re-fetch route (api/coinbase/trade-candles/route.ts), so both
 * ever produce candles from a single mapping of Coinbase's raw response.
 */
export function mapCoinbaseCandles(candles: CoinbaseCandle[]): TradeChartCandle[] {
  return candles
    .map((c) => ({
      time: Number(c.start),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      // Coerced here rather than at the chart: a candle Coinbase returns
      // without volume must render as a zero bar, not NaN.
      volume: Number(c.volume) || 0,
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Chart data is decoration, never a source of truth -- this never throws
 * into the caller. Returns null whenever Coinbase isn't configured, the
 * active venue doesn't support candles (see ChartDataPort -- CFM only for
 * now), or the request itself fails for any reason (rate limit, the
 * product no longer exists, a transient network error). The trade detail
 * page must render correctly either way.
 *
 * Only ever call this for a trade whose source is COINBASE_SYNC -- a
 * Notion-imported or demo trade's product_id is synthetic (e.g.
 * "MBT-EXTERNAL", "BIT-DEMO-CDE") and was never a real Coinbase product, so
 * there's no real chart to show for it.
 */
export async function fetchTradeCandles(params: {
  productId: string;
  openedAt: Date;
  closedAt: Date;
}): Promise<TradeChartData | null> {
  const env = serverEnv();
  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY) return null;
  // ChartDataPort is only confirmed/implemented for CFM (see lib/coinbase/ports.ts) --
  // IntxAdapter doesn't implement it, so there's nothing to call for INTX.
  if (env.COINBASE_PRODUCT_VENUE !== "FCM") return null;

  const { start, end, granularity } = pickChartWindow(params.openedAt, params.closedAt);

  try {
    const adapter = new CfmAdapter({
      apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
      privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
    });

    const candles = await adapter.getCandles(params.productId, {
      start: String(Math.floor(start.getTime() / 1000)),
      end: String(Math.floor(end.getTime() / 1000)),
      granularity,
    });

    return {
      candles: mapCoinbaseCandles(candles),
      granularityLabel: GRANULARITY_LABELS[granularity],
    };
  } catch (error) {
    console.error("[fetchTradeCandles]", error);
    return null;
  }
}
