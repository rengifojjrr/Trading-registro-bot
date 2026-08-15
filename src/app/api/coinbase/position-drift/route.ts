import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { serverEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { evaluateUnrealizedDrift } from "@/lib/risk/drift";

/**
 * Compares the unrealised P&L this app computes against the figure
 * Coinbase reports for the same open position.
 *
 * This is the check the whole project started from: the original complaint
 * was that the profit shown "no es ni cercana" to Coinbase's. Everything
 * since has been about computing it correctly; this is what proves it, by
 * asking Coinbase for its own number and putting them side by side.
 *
 * Read-only and never throws: an unavailable comparison hides the panel
 * rather than breaking the page.
 */
export async function GET(request: Request) {
  const user = await requireUser();

  const limit = checkRateLimit(`position-drift:${user.id}`, { capacity: 10, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const ours = url.searchParams.get("ours");

  if (!productId || ours === null || !Number.isFinite(Number(ours))) {
    return NextResponse.json({ available: false });
  }

  const env = serverEnv();
  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || env.COINBASE_PRODUCT_VENUE !== "FCM") {
    return NextResponse.json({ available: false });
  }

  try {
    const adapter = new CfmAdapter({
      apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
      privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
    });

    const positions = await adapter.listOpenPositions();
    const position = positions.find((p) => p.product_id === productId);

    // Coinbase not reporting the position, or reporting it without a P&L,
    // is not a discrepancy -- there is simply nothing to compare against.
    if (!position || position.unrealized_pnl === undefined) {
      return NextResponse.json({ available: false });
    }

    const drift = evaluateUnrealizedDrift({ ours, theirs: position.unrealized_pnl });

    return NextResponse.json({
      available: true,
      theirs: position.unrealized_pnl,
      ...drift,
    });
  } catch (error) {
    console.error("[coinbase/position-drift]", error);
    return NextResponse.json({ available: false });
  }
}
