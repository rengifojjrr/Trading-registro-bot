import { NextResponse } from "next/server";

import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { IntxAdapter } from "@/lib/coinbase/venues/intx";
import type { MarketDataPort } from "@/lib/coinbase/ports";
import { serverEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Lets the Settings page verify a freshly-configured Coinbase key works
 * without waiting for the next cron cycle. Read-only: calls GET
 * /products/{id} only, never anything that could move funds (the key
 * itself should also carry only the "view" scope -- see README.md).
 * Requires a signed-in user (this reads server env, not user input, but
 * there is no reason to expose it to an unauthenticated caller).
 */
export async function GET() {
  await requireUser();

  const env = serverEnv();
  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || !env.COINBASE_PRODUCT_ID) {
    return NextResponse.json(
      { connected: false, message: "Coinbase no está configurado todavía en este servidor." },
      { status: 200 },
    );
  }

  try {
    const adapter: MarketDataPort =
      env.COINBASE_PRODUCT_VENUE === "INTX"
        ? new IntxAdapter()
        : new CfmAdapter({
            apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
            privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
          });

    const product = await adapter.getProduct(env.COINBASE_PRODUCT_ID);
    return NextResponse.json({
      connected: true,
      productId: product.product_id,
      displayName: product.display_name ?? product.product_id,
      contractSize: product.future_product_details?.contract_size ?? null,
    });
  } catch (error) {
    // Sanitized -- never echo the raw error (could theoretically include
    // request details) back to the client.
    return NextResponse.json(
      {
        connected: false,
        message:
          error instanceof Error && error.name === "CoinbaseApiError"
            ? "Coinbase rechazó la solicitud. Verifica que la clave sea válida y tenga permiso de lectura."
            : "No se pudo contactar a Coinbase.",
      },
      { status: 200 },
    );
  }
}
