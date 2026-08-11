import { NextResponse } from "next/server";

import { CoinbaseApiError } from "@/lib/coinbase/client";
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
    // Full detail only ever goes to the server's own function logs (private
    // to the project) -- the client response below stays sanitized, never
    // echoing the raw error (could theoretically include request details).
    console.error("[coinbase/test-connection]", error);

    if (error instanceof CoinbaseApiError) {
      return NextResponse.json(
        {
          connected: false,
          message: `Coinbase rechazó la solicitud (HTTP ${error.status}). Verifica que la clave sea válida, tenga permiso de lectura, y que COINBASE_PRODUCT_ID sea correcto.`,
        },
        { status: 200 },
      );
    }

    if (error instanceof Error && error.message.includes("Could not parse Coinbase CDP private key")) {
      // error.message here is built by describePemShape() (lib/coinbase/jwt.ts)
      // from counts/booleans only -- safe to forward as-is, never contains
      // key material even though it's derived from the secret.
      return NextResponse.json(
        {
          connected: false,
          message: `La clave privada de Coinbase no tiene un formato PEM válido. ${error.message}`,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        connected: false,
        message: "No se pudo contactar a Coinbase. Revisa los logs del servidor (Vercel -> Logs) para más detalle.",
      },
      { status: 200 },
    );
  }
}
