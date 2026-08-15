import { NextResponse } from "next/server";

import { GRANULARITY_LABELS, windowForGranularity } from "@/lib/analytics/chart-window";
import { requireUser } from "@/lib/auth/require-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { mapCoinbaseCandles } from "@/lib/coinbase/fetch-trade-candles";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { createClient } from "@/lib/supabase/server";

const VALID_GRANULARITIES = new Set(Object.keys(GRANULARITY_LABELS));

/**
 * Backs the granularity selector on a trade's chart (see
 * components/trades/trade-chart.tsx).
 *
 * Takes a trade id and a granularity, and derives the window itself from
 * the trade's own timestamps. It used to take start/end from the client and
 * hold them fixed across granularity changes, which is what made the finer
 * timeframes unusable -- a week-wide window can't be drawn in 300 one-minute
 * candles, so they were all disabled. Now the granularity picks the window,
 * and the client can't ask for an arbitrary range either.
 *
 * Never throws into the client: chart data is decoration, and the trade
 * page must keep working when Coinbase doesn't answer.
 */
export async function GET(request: Request) {
  const user = await requireUser();

  // Bounds what one account can pull through this route no matter how many
  // tabs are polling. See lib/rate-limit.ts.
  const limit = checkRateLimit(`trade-candles:${user.id}`, { capacity: 20, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const tradeId = url.searchParams.get("tradeId");
  const granularity = url.searchParams.get("granularity");

  if (!tradeId || !granularity || !VALID_GRANULARITIES.has(granularity)) {
    return NextResponse.json({ candles: null }, { status: 200 });
  }

  // Read through the user-scoped client so RLS -- not this handler -- is
  // what stops one account charting another's trade.
  const supabase = await createClient();
  const { data: trade } = await supabase
    .from("trades")
    .select("product_id, opened_at, closed_at, source")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!trade || trade.source !== "COINBASE_SYNC") {
    return NextResponse.json({ candles: null }, { status: 200 });
  }

  const openedAt = new Date(trade.opened_at);
  const closedAt = trade.closed_at ? new Date(trade.closed_at) : new Date();
  const window = windowForGranularity(openedAt, closedAt, granularity as CoinbaseCandleGranularity);
  if (!window) {
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

    const candles = await adapter.getCandles(trade.product_id, {
      start: String(Math.floor(window.start.getTime() / 1000)),
      end: String(Math.floor(window.end.getTime() / 1000)),
      granularity: granularity as CoinbaseCandleGranularity,
    });

    return NextResponse.json({ candles: mapCoinbaseCandles(candles) });
  } catch (error) {
    console.error("[coinbase/trade-candles]", error);
    return NextResponse.json({ candles: null }, { status: 200 });
  }
}
