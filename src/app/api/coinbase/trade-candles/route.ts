import { NextResponse } from "next/server";

import { GRANULARITY_LABELS } from "@/lib/analytics/chart-window";
import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { mapCoinbaseCandles } from "@/lib/coinbase/fetch-trade-candles";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";

const VALID_GRANULARITIES = new Set(Object.keys(GRANULARITY_LABELS));

/**
 * Backs the manual granularity selector on a trade's chart (see
 * components/trades/trade-chart.tsx). The initial render already has
 * candles from the server component via fetchTradeCandles -- this route
 * only serves re-fetches for the exact same [start, end] window at a
 * different granularity. Never throws into the client.
 */
export async function GET(request: Request) {
  await requireUser();

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const granularity = url.searchParams.get("granularity");

  if (!productId || !start || !end || !granularity || !VALID_GRANULARITIES.has(granularity)) {
    return NextResponse.json({ candles: null }, { status: 200 });
  }

  const env = serverEnv();
  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || env.COINBASE_PRODUCT_VENUE !== "FCM") {
    return NextResponse.json({ candles: null }, { status: 200 });
  }

  try {
    const adapter = new CfmAdapter({
      apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
      privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
    });

    const candles = await adapter.getCandles(productId, {
      start,
      end,
      granularity: granularity as CoinbaseCandleGranularity,
    });

    return NextResponse.json({ candles: mapCoinbaseCandles(candles) });
  } catch (error) {
    console.error("[coinbase/trade-candles]", error);
    return NextResponse.json({ candles: null }, { status: 200 });
  }
}
