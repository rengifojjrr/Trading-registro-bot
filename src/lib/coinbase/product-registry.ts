import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface ProductSpec {
  productId: string;
  venue: string;
  contractSize: number;
  contractRootUnit: string | null;
  contractExpiryType: "EXPIRING" | "PERPETUAL" | null;
  contractExpiry: string | null;
}

/**
 * The single place the P&L engine (Phase 3) and everything else reads
 * contract multipliers from -- never hardcode a contract_size inline.
 * Backed by the `products` table (populated by the Phase 2 sync job's
 * product-spec refresh, or by scripts/seed-demo-data for the demo
 * account), not a live Coinbase call: this function is a DB read.
 *
 * Returns null rather than throwing when the spec is missing, so callers
 * can raise a MISSING_CONTRACT_SPEC notification instead of crashing or
 * silently assuming a multiplier of 1.
 */
export async function getProductSpec(productId: string): Promise<ProductSpec | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("product_id, venue, contract_size, contract_root_unit, contract_expiry_type, contract_expiry")
    .eq("product_id", productId)
    .maybeSingle();

  if (!data || data.contract_size == null) {
    return null;
  }

  return {
    productId: data.product_id,
    venue: data.venue,
    contractSize: Number(data.contract_size),
    contractRootUnit: data.contract_root_unit,
    contractExpiryType: data.contract_expiry_type,
    contractExpiry: data.contract_expiry,
  };
}
