import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { serverEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { evaluateMissingPosition, evaluateSizeMismatch, evaluateUnrealizedDrift } from "@/lib/risk/drift";
import { signedVenueSize } from "@/lib/sync/position-check";

/**
 * Compares this app's open position against what Coinbase reports for the
 * same product: first the contracts, then the unrealised P&L.
 *
 * This is the check the whole project started from: the original complaint
 * was that the profit shown "no es ni cercana" to Coinbase's. Everything
 * since has been about computing it correctly; this is what proves it, by
 * asking Coinbase for its own number and putting them side by side.
 *
 * The contracts go first because comparing the P&L of two different sizes
 * says nothing -- and once said "coincide" over 50 contracts against 22,
 * after Coinbase had liquidated 28 that this app had not synced yet.
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
  // The size this app still believes is open. Without it, "Coinbase has no
  // position" cannot be told apart from "we agree there is no position".
  const ourSize = url.searchParams.get("ourSize");
  // El lado, para poner signo al tamaño: un largo de 22 y un corto de 22 no
  // son la misma posición.
  const direction = url.searchParams.get("direction");
  // Contratos × tamaño de contrato × precio. Con él la diferencia se juzga
  // en precio en vez de en P&L, que es lo único que no distorsiona el
  // apalancamiento.
  const notional = url.searchParams.get("notional");

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

    // Coinbase reporting no position at all, while this app still shows one
    // open, is the single most important discrepancy this endpoint can find
    // -- it used to be swallowed as "nothing to compare against", which hid
    // a phantom position instead of reporting it.
    if (!position) {
      const missing = evaluateMissingPosition({ ourSize: ourSize ?? "0" });
      if (missing) {
        return NextResponse.json({ available: true, theirs: null, theirSize: "0", ourSize, ...missing });
      }
      return NextResponse.json({ available: false });
    }

    // Los contratos antes que el P&L. Con signo por los dos lados.
    const theirSigned = signedVenueSize(position);
    const ourSigned =
      ourSize !== null && Number.isFinite(Number(ourSize))
        ? direction === "SHORT"
          ? -Math.abs(Number(ourSize))
          : Math.abs(Number(ourSize))
        : null;

    if (theirSigned !== null && ourSigned !== null) {
      const mismatch = evaluateSizeMismatch({ ourSize: ourSigned, theirSize: theirSigned.toString() });
      if (mismatch) {
        return NextResponse.json({
          available: true,
          theirs: position.unrealized_pnl ?? null,
          theirSize: theirSigned.toString(),
          ourSize: String(ourSigned),
          ...mismatch,
        });
      }
    }

    // A position that exists but carries no P&L genuinely has nothing to
    // compare, which is a different situation.
    if (position.unrealized_pnl === undefined) {
      return NextResponse.json({ available: false });
    }

    const drift = evaluateUnrealizedDrift({ ours, theirs: position.unrealized_pnl, notional });

    return NextResponse.json({
      available: true,
      theirs: position.unrealized_pnl,
      theirSize: theirSigned?.toString() ?? null,
      ourSize: ourSigned === null ? null : String(ourSigned),
      ...drift,
    });
  } catch (error) {
    console.error("[coinbase/position-drift]", error);
    return NextResponse.json({ available: false });
  }
}
