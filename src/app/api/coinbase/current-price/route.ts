import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";

/**
 * Backs the live price poll on an OPEN trade's detail page (see
 * components/trades/live-unrealized-pnl.tsx). Read-only: GET
 * /products/{id} only, same call "Probar conexión" already makes. Never
 * throws into the client -- an unavailable price just means the live
 * widget hides itself.
 */
export async function GET(request: Request) {
  await requireUser();

  const productId = new URL(request.url).searchParams.get("productId");
  const env = serverEnv();

  if (
    !productId ||
    !env.COINBASE_CDP_API_KEY_NAME ||
    !env.COINBASE_CDP_PRIVATE_KEY ||
    env.COINBASE_PRODUCT_VENUE !== "FCM"
  ) {
    return NextResponse.json({ price: null }, { status: 200 });
  }

  try {
    const adapter = new CfmAdapter({
      apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
      privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
    });
    const product = await adapter.getProduct(productId);
    const price = product.price ? Number(product.price) : null;
    return NextResponse.json({ price: Number.isFinite(price) ? price : null });
  } catch (error) {
    console.error("[coinbase/current-price]", error);
    return NextResponse.json({ price: null }, { status: 200 });
  }
}
