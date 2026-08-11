import "server-only";

import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { IntxAdapter } from "@/lib/coinbase/venues/intx";
import type { MarketDataPort } from "@/lib/coinbase/ports";
import { serverEnv } from "@/lib/env";
import { enqueueNotionSync } from "@/lib/notion/sync";
import { raiseNotification } from "@/lib/notifications/create";
import { persistReconstruction } from "@/lib/reconstruction/persist";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const RECONCILIATION_WINDOW_DAYS = 3;
const RECONSTRUCTION_ALGORITHM_VERSION = 1;

/**
 * The nightly conciliación: re-fetches every fill Coinbase reports for the
 * last few days (ignoring sync_state's high-water mark entirely, unlike
 * the ~5 min poll) and compares against what's in the database, to catch
 * late-arriving or amended data the overlap window might have missed. Never
 * duplicates a fill (raw_fills.entry_id is the primary key), and
 * discrepancies are recorded individually, never silently corrected away.
 */
export async function runNightlyReconciliation(accountId: string) {
  const supabase = createAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("id", accountId)
    .single();
  if (accountError || !account) {
    throw new Error(`Unknown account ${accountId}: ${accountError?.message}`);
  }

  const env = serverEnv();
  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || !env.COINBASE_PRODUCT_ID) {
    throw new Error("Coinbase credentials or COINBASE_PRODUCT_ID are not configured.");
  }

  const productId = env.COINBASE_PRODUCT_ID;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - RECONCILIATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data: run, error: runError } = await supabase
    .from("reconciliation_runs")
    .insert({
      user_id: account.user_id,
      account_id: accountId,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      status: "RUNNING",
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create reconciliation_runs row: ${runError?.message}`);

  try {
    const adapter: MarketDataPort =
      env.COINBASE_PRODUCT_VENUE === "INTX"
        ? new IntxAdapter()
        : new CfmAdapter({
            apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
            privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
          });

    const coinbaseFills = await adapter.listFills({
      product_ids: [productId],
      product_types: ["FUTURE"],
      start_sequence_timestamp: windowStart.toISOString(),
      end_sequence_timestamp: windowEnd.toISOString(),
      limit: 100,
    });

    const { data: dbFills } = await supabase
      .from("raw_fills")
      .select("entry_id")
      .eq("account_id", accountId)
      .eq("product_id", productId)
      .gte("sequence_timestamp", windowStart.toISOString())
      .lte("sequence_timestamp", windowEnd.toISOString());

    const dbEntryIds = new Set((dbFills ?? []).map((f) => f.entry_id));
    const coinbaseEntryIds = new Set(coinbaseFills.map((f) => f.entry_id));
    const missingInDb = coinbaseFills.filter((f) => !dbEntryIds.has(f.entry_id));
    const missingInCoinbase = [...dbEntryIds].filter((id) => !coinbaseEntryIds.has(id));

    for (const fill of missingInDb) {
      await supabase.from("raw_fills").insert({
        entry_id: fill.entry_id,
        user_id: account.user_id,
        account_id: accountId,
        order_id: fill.order_id,
        product_id: fill.product_id,
        coinbase_trade_id: fill.trade_id,
        trade_time: fill.trade_time,
        sequence_timestamp: fill.sequence_timestamp,
        trade_type: fill.trade_type,
        side: fill.side,
        price: fill.price,
        size: fill.size,
        commission: fill.commission,
        commission_detail: fill.commission_detail_total as unknown as Json,
        liquidity_indicator: fill.liquidity_indicator,
        size_in_quote: fill.size_in_quote ?? false,
        retail_portfolio_id: fill.retail_portfolio_id,
        future_legs: (fill.future_legs ?? []) as unknown as Json,
        raw_payload: fill as unknown as Json,
      });

      await supabase.from("reconciliation_discrepancies").insert({
        user_id: account.user_id,
        reconciliation_run_id: run.id,
        discrepancy_type: "MISSING_IN_DB",
        entity_type: "raw_fill",
        entity_id: fill.entry_id,
        expected: fill as unknown as Json,
      });
    }

    for (const entryId of missingInCoinbase) {
      // A fill we have but Coinbase's window no longer reports -- flagged
      // for manual review, never auto-deleted (raw_fills is immutable by
      // design; if this happens it needs a human to understand why).
      await supabase.from("reconciliation_discrepancies").insert({
        user_id: account.user_id,
        reconciliation_run_id: run.id,
        discrepancy_type: "MISSING_IN_COINBASE",
        entity_type: "raw_fill",
        entity_id: entryId,
      });
    }

    if (missingInDb.length > 0) {
      const { data: product } = await supabase
        .from("products")
        .select("contract_size")
        .eq("product_id", productId)
        .maybeSingle();

      if (product?.contract_size) {
        const result = await persistReconstruction({
          userId: account.user_id,
          accountId,
          productId,
          contractSize: product.contract_size,
          algorithmVersion: RECONSTRUCTION_ALGORITHM_VERSION,
        });

        await Promise.all(
          result.touchedTradeIds.map((tradeId) => enqueueNotionSync(account.user_id, tradeId)),
        );
      }
    }

    const totalDiscrepancies = missingInDb.length + missingInCoinbase.length;
    await supabase
      .from("reconciliation_runs")
      .update({
        status: "SUCCESS",
        finished_at: new Date().toISOString(),
        coinbase_fill_count: coinbaseFills.length,
        db_fill_count: dbEntryIds.size,
        resolved: totalDiscrepancies === 0,
      })
      .eq("id", run.id);

    if (totalDiscrepancies > 0) {
      await raiseNotification({
        userId: account.user_id,
        type: "DISCREPANCY",
        severity: totalDiscrepancies > 5 ? "CRITICAL" : "WARNING",
        title: "La conciliación nocturna encontró discrepancias",
        message: `${missingInDb.length} fill(s) faltaban en la base de datos y se importaron; ${missingInCoinbase.length} fill(s) en la base de datos ya no aparecen en la ventana reportada por Coinbase. Revisa la página de Actividad.`,
        dedupKey: `DISCREPANCY:account:${accountId}:reconciliation`,
      });
    }

    return { coinbaseFillCount: coinbaseFills.length, dbFillCount: dbEntryIds.size, discrepancies: totalDiscrepancies };
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : "Unknown reconciliation error";
    await supabase
      .from("reconciliation_runs")
      .update({ status: "FAILED", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    throw new Error(errorSummary);
  }
}
