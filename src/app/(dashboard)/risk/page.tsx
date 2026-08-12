import { Decimal } from "decimal.js";

import { PageHeader } from "@/components/layout/page-header";
import { LivePositionsSection, type LivePositionData } from "@/components/risk/live-positions-section";
import { MarginCalculator, type CalculatorProduct } from "@/components/risk/margin-calculator";
import { fetchOpenLivePositions } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import { extractLiveMarginRates } from "@/lib/risk/product-margin";
import type { RiskConstants } from "@/lib/risk/margin";
import { createClient } from "@/lib/supabase/server";

export default async function RiskPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [positions, { data: settings }, { data: products }] = await Promise.all([
    fetchOpenLivePositions(),
    supabase
      .from("app_settings")
      .select("maintenance_margin_rate, target_margin_ratio, trading_fee_pct, min_fee_per_contract")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("products")
      .select("product_id, display_name, contract_size, raw_metadata")
      .eq("product_type", "FUTURE")
      // Most-recently-synced first: the calculator defaults to products[0]
      // (see margin-calculator.tsx's makeInitialState), and this table can
      // hold stale/never-fully-synced rows (an old expired contract, a
      // one-off QA product) alongside the one actually being traded --
      // recency is the simplest reliable proxy for "the real, active one."
      .order("updated_at", { ascending: false }),
  ]);

  const productsById = new Map((products ?? []).map((p) => [p.product_id, p]));

  const riskConstants: RiskConstants = {
    maintenanceMarginRate: String(settings?.maintenance_margin_rate ?? 0.1),
    targetMarginRatio: String(settings?.target_margin_ratio ?? 0.75),
    tradingFeePct: String(settings?.trading_fee_pct ?? 0.0002),
    minFeePerContract: String(settings?.min_fee_per_contract ?? 0.15),
  };

  const livePositions: LivePositionData[] = positions.map((p) => {
    const product = productsById.get(p.product_id);
    return {
      id: p.id,
      productId: p.product_id,
      displayName: product?.display_name ?? null,
      direction: p.direction,
      entryWap: p.entry_wap!,
      openQty: new Decimal(p.total_entry_qty).minus(p.total_exit_qty).toString(),
      contractSize: p.contract_multiplier,
      entryCommissions: p.entry_commissions,
      liveMarginRates: product ? extractLiveMarginRates(product.raw_metadata, p.direction) : null,
    };
  });

  // Only products with a real, currently-synced contract size are usable in
  // the calculator -- excludes Notion-imported synthetic products (no
  // contract_size at all) and stale/incomplete rows.
  const calculatorProducts: CalculatorProduct[] = (products ?? [])
    .filter((p): p is typeof p & { contract_size: string } => p.contract_size !== null)
    .map((p) => ({
      productId: p.product_id,
      displayName: p.display_name ?? p.product_id,
      contractSize: p.contract_size,
      longMarginRates: extractLiveMarginRates(p.raw_metadata, "LONG"),
      shortMarginRates: extractLiveMarginRates(p.raw_metadata, "SHORT"),
    }));

  return (
    <>
      <PageHeader
        title="Riesgo"
        description="Margen estimado de tus posiciones abiertas en vivo, y una calculadora de tamaño de posición."
      />
      <LivePositionsSection positions={livePositions} riskConstants={riskConstants} />
      <MarginCalculator riskConstants={riskConstants} products={calculatorProducts} />
    </>
  );
}
