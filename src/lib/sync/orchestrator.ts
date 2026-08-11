import "server-only";

import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { IntxAdapter } from "@/lib/coinbase/venues/intx";
import type { MarketDataPort } from "@/lib/coinbase/ports";
import type { CoinbaseFill, CoinbaseProduct } from "@/lib/coinbase/types";
import { serverEnv } from "@/lib/env";
import { raiseNotification } from "@/lib/notifications/create";
import { persistReconstruction } from "@/lib/reconstruction/persist";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const RECONSTRUCTION_ALGORITHM_VERSION = 1;
const DEFAULT_INITIAL_BACKFILL_DAYS = 90;
const CONSECUTIVE_FAILURES_BEFORE_ALERT = 3;

export interface SyncRunSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  fillsFetched: number;
  fillsNew: number;
  tradesCreated: number;
  tradesUpdated: number;
  errorSummary?: string;
}

/**
 * Runs one ~5-minute poll cycle for a single account: fetch new fills since
 * the last high-water mark (minus the configured overlap window), persist
 * them, and recompute trades. UNVERIFIED AGAINST LIVE COINBASE -- see
 * lib/coinbase/client.ts. Never called by anything until
 * docs/VALIDATION_CHECKLIST.md has passed and app_settings.auto_sync_enabled
 * is true for the account (callers are responsible for checking that gate;
 * this function itself doesn't re-check it, so it can also be invoked for
 * a one-off manual "sync now" during the validation phase itself).
 */
export async function runPollSync(accountId: string): Promise<SyncRunSummary> {
  const supabase = createAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, user_id, venue")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    throw new Error(`Unknown account ${accountId}: ${accountError?.message}`);
  }

  const { data: syncState } = await supabase
    .from("sync_state")
    .select("id, high_water_mark, overlap_window_seconds, consecutive_failures")
    .eq("account_id", accountId)
    .eq("sync_type", "POLL")
    .maybeSingle();

  const syncStateId = syncState?.id ?? (await ensureSyncState(accountId, account.user_id));
  const overlapSeconds = syncState?.overlap_window_seconds ?? 300;

  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ user_id: account.user_id, sync_state_id: syncStateId, status: "RUNNING" })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`Failed to create sync_runs row: ${runError?.message}`);
  }

  try {
    const env = serverEnv();
    if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || !env.COINBASE_PRODUCT_ID) {
      throw new Error(
        "Coinbase credentials or COINBASE_PRODUCT_ID are not configured -- see .env.example.",
      );
    }

    const adapter: MarketDataPort =
      env.COINBASE_PRODUCT_VENUE === "INTX"
        ? new IntxAdapter()
        : new CfmAdapter({
            apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
            privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
          });

    const productId = env.COINBASE_PRODUCT_ID;
    const nowIso = new Date().toISOString();
    const startIso = syncState?.high_water_mark
      ? new Date(
          new Date(syncState.high_water_mark).getTime() - overlapSeconds * 1000,
        ).toISOString()
      : new Date(Date.now() - DEFAULT_INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const product = await refreshProductSpec(adapter, productId);
    if (!product.contractSize) {
      await raiseNotification({
        userId: account.user_id,
        type: "MISSING_CONTRACT_SPEC",
        severity: "CRITICAL",
        title: "Falta la especificación de contrato",
        message: `Coinbase no devolvió un contract_size para ${productId}. La sincronización se detuvo -- el motor de P&L no puede calcular resultados sin el multiplicador real del contrato.`,
        dedupKey: `MISSING_CONTRACT_SPEC:${productId}`,
      });
      throw new Error(`Missing contract_size for product ${productId}`);
    }

    const fills = await adapter.listFills({
      product_ids: [productId],
      product_types: ["FUTURE"],
      start_sequence_timestamp: startIso,
      end_sequence_timestamp: nowIso,
      limit: 100,
    });

    const fillsNew = await upsertRawFills(account.user_id, accountId, run.id, fills);
    const orderIds = [...new Set(fills.map((f) => f.order_id))];
    await upsertRawOrders(adapter, account.user_id, accountId, productId, run.id, orderIds);

    const result = await persistReconstruction({
      userId: account.user_id,
      accountId,
      productId,
      contractSize: product.contractSize,
      algorithmVersion: RECONSTRUCTION_ALGORITHM_VERSION,
    });

    if (result.unclassifiedFillIds.length > 0) {
      await raiseNotification({
        userId: account.user_id,
        type: "UNCLASSIFIED_FILL",
        severity: "WARNING",
        title: "Fills sin clasificar",
        message: `${result.unclassifiedFillIds.length} fill(s) no se procesaron automáticamente (tipo de ajuste o combo no confirmado -- ver docs/COINBASE_INTEGRATION.md). No afectan las operaciones ya calculadas, pero no están incluidos.`,
        relatedEntityType: "product",
        relatedEntityId: productId,
        dedupKey: `UNCLASSIFIED_FILL:account:${accountId}:product:${productId}`,
      });
    }

    if (result.orphanedOpeningFillIds.length > 0) {
      await raiseNotification({
        userId: account.user_id,
        type: "DISCREPANCY",
        severity: "WARNING",
        title: "Límites de operación cambiaron",
        message: `${result.orphanedOpeningFillIds.length} operación(es) ya no corresponden a un límite de posición bajo el recálculo más reciente. Revísalas manualmente -- no se eliminaron automáticamente.`,
        dedupKey: `TRADE_BOUNDARY_CHANGED:account:${accountId}:product:${productId}`,
      });
    }

    const newHighWaterMark = fills.reduce(
      (max, f) => (f.sequence_timestamp > max ? f.sequence_timestamp : max),
      syncState?.high_water_mark ?? "1970-01-01T00:00:00Z",
    );

    await supabase
      .from("sync_state")
      .update({
        high_water_mark: newHighWaterMark,
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        status: "SUCCESS",
        consecutive_failures: 0,
      })
      .eq("id", syncStateId);

    await supabase
      .from("sync_runs")
      .update({
        status: "SUCCESS",
        finished_at: new Date().toISOString(),
        fills_fetched: fills.length,
        fills_new: fillsNew,
        trades_created: result.tradesCreated,
        trades_updated: result.tradesUpdated,
        discrepancies_found: result.orphanedOpeningFillIds.length,
      })
      .eq("id", run.id);

    return {
      status: "SUCCESS",
      fillsFetched: fills.length,
      fillsNew,
      tradesCreated: result.tradesCreated,
      tradesUpdated: result.tradesUpdated,
    };
  } catch (error) {
    // Sanitized: never include the raw error object (could theoretically
    // contain request/response details) in what gets stored -- message
    // only, and even that is meant to be human-readable, not a stack dump.
    const errorSummary = error instanceof Error ? error.message : "Unknown sync error";

    const newFailureCount = (syncState?.consecutive_failures ?? 0) + 1;
    await supabase
      .from("sync_state")
      .update({
        last_attempt_at: new Date().toISOString(),
        status: "FAILED",
        consecutive_failures: newFailureCount,
      })
      .eq("id", syncStateId);

    await supabase
      .from("sync_runs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_summary: errorSummary,
      })
      .eq("id", run.id);

    if (newFailureCount >= CONSECUTIVE_FAILURES_BEFORE_ALERT) {
      await raiseNotification({
        userId: account.user_id,
        type: "SYNC_FAILURE",
        severity: "CRITICAL",
        title: "La sincronización con Coinbase sigue fallando",
        message: `${newFailureCount} intentos consecutivos han fallado. Último error: ${errorSummary}`,
        dedupKey: `SYNC_FAILURE:account:${accountId}`,
      });
    }

    return { status: "FAILED", fillsFetched: 0, fillsNew: 0, tradesCreated: 0, tradesUpdated: 0, errorSummary };
  }
}

async function ensureSyncState(accountId: string, userId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sync_state")
    .insert({ user_id: userId, account_id: accountId, sync_type: "POLL" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create sync_state: ${error?.message}`);
  return data.id;
}

async function refreshProductSpec(
  adapter: MarketDataPort,
  productId: string,
): Promise<{ contractSize: string | null }> {
  const supabase = createAdminClient();
  const product: CoinbaseProduct = await adapter.getProduct(productId);
  const details = product.future_product_details;

  await supabase.from("products").upsert(
    {
      product_id: product.product_id,
      venue: product.product_venue ?? "FCM",
      product_type: product.product_type,
      base_currency_id: product.base_currency_id,
      quote_currency_id: product.quote_currency_id,
      contract_size: details?.contract_size,
      contract_root_unit: details?.contract_root_unit,
      contract_expiry_type: details?.contract_expiry_type,
      contract_expiry: details?.contract_expiry,
      contract_expiry_timezone: details?.contract_expiry_timezone,
      risk_managed_by: details?.risk_managed_by,
      display_name: product.display_name,
      raw_metadata: product as unknown as Json,
      fetched_at: new Date().toISOString(),
      is_stale: false,
    },
    { onConflict: "product_id" },
  );

  return { contractSize: details?.contract_size ?? null };
}

async function upsertRawFills(
  userId: string,
  accountId: string,
  syncRunId: string,
  fills: CoinbaseFill[],
): Promise<number> {
  if (fills.length === 0) return 0;
  const supabase = createAdminClient();

  const entryIds = fills.map((f) => f.entry_id);
  const { data: existing } = await supabase
    .from("raw_fills")
    .select("entry_id")
    .in("entry_id", entryIds);
  const existingIds = new Set((existing ?? []).map((r) => r.entry_id));
  const newFills = fills.filter((f) => !existingIds.has(f.entry_id));
  if (newFills.length === 0) return 0;

  await supabase.from("raw_fills").insert(
    newFills.map((f) => ({
      entry_id: f.entry_id,
      user_id: userId,
      account_id: accountId,
      order_id: f.order_id,
      product_id: f.product_id,
      coinbase_trade_id: f.trade_id,
      trade_time: f.trade_time,
      sequence_timestamp: f.sequence_timestamp,
      trade_type: f.trade_type,
      side: f.side,
      price: f.price,
      size: f.size,
      commission: f.commission,
      commission_detail: f.commission_detail_total as unknown as Json,
      liquidity_indicator: f.liquidity_indicator,
      size_in_quote: f.size_in_quote ?? false,
      retail_portfolio_id: f.retail_portfolio_id,
      future_legs: (f.future_legs ?? []) as unknown as Json,
      raw_payload: f as unknown as Json,
      sync_run_id: syncRunId,
    })),
  );

  return newFills.length;
}

async function upsertRawOrders(
  adapter: MarketDataPort,
  userId: string,
  accountId: string,
  productId: string,
  syncRunId: string,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  const supabase = createAdminClient();

  try {
    const orders = await adapter.listOrders(orderIds);
    await supabase.from("raw_orders").upsert(
      orders.map((o) => ({
        order_id: o.order_id,
        user_id: userId,
        account_id: accountId,
        product_id: o.product_id ?? productId,
        order_side: o.side,
        status: o.status,
        raw_payload: o as unknown as Json,
        sync_run_id: syncRunId,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "order_id" },
    );
  } catch {
    // Order detail is supplementary context, not required for
    // reconstruction (which only reads fills) -- a failure here must never
    // fail the whole sync run.
  }
}
