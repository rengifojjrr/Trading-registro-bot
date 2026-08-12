import "server-only";

import { calculatePnl } from "@/lib/pnl/calculate";
import { classifySession } from "@/lib/sessions/classify";
import { createAdminClient } from "@/lib/supabase/admin";

import { reconstructTrades } from "./engine";
import type { GroupingOverrideInput, ReconstructionFillInput } from "./types";

export interface PersistReconstructionParams {
  userId: string;
  accountId: string;
  productId: string;
  contractSize: string;
  algorithmVersion: number;
}

export interface PersistReconstructionResult {
  tradesCreated: number;
  tradesUpdated: number;
  tradesClosed: number;
  unclassifiedFillIds: string[];
  unsupportedOverrideIds: string[];
  /** opening_fill_id of trades that existed before but no longer appear in the recomputed set -- flagged, never silently deleted. See docs/RECONCILIATION_RULES.md #4. */
  orphanedOpeningFillIds: string[];
  /** trades.id of every trade created or updated this run -- callers use this to enqueue the Notion outbound mirror without re-deriving it. */
  touchedTradeIds: string[];
}

/**
 * The diff-and-upsert persistence layer around the pure reconstructTrades()
 * function -- reads all raw_fills for (accountId, productId), recomputes
 * the full trade set, and upserts by opening_fill_id so trades.id survives
 * across recomputation (see docs/RECONCILIATION_RULES.md #4). Never
 * deletes a trade whose opening fill disappeared from the new computation;
 * that gets flagged via reconciliation_discrepancies + a notification
 * instead, for a human to resolve deliberately.
 */
export async function persistReconstruction(
  params: PersistReconstructionParams,
): Promise<PersistReconstructionResult> {
  const supabase = createAdminClient();

  const [{ data: rawFills }, { data: overrideRows }, { data: existingTrades }] = await Promise.all([
    supabase
      .from("raw_fills")
      .select(
        "entry_id, product_id, side, price, size, commission, sequence_timestamp, trade_time, trade_type, future_legs",
      )
      .eq("account_id", params.accountId)
      .eq("product_id", params.productId),
    supabase
      .from("trade_grouping_overrides")
      .select("id, override_type, anchor_fill_id, payload, is_active")
      .eq("account_id", params.accountId)
      .eq("product_id", params.productId)
      .eq("is_active", true),
    supabase
      .from("trades")
      .select("id, opening_fill_id")
      .eq("account_id", params.accountId)
      .eq("product_id", params.productId)
      .not("opening_fill_id", "is", null),
  ]);

  const engineFills: ReconstructionFillInput[] = (rawFills ?? []).map((f) => ({
    entryId: f.entry_id,
    productId: f.product_id,
    side: f.side,
    price: f.price,
    size: f.size,
    commission: f.commission,
    sequenceTimestamp: f.sequence_timestamp,
    tradeTime: f.trade_time,
    tradeType: f.trade_type,
    hasFutureLegs: Array.isArray(f.future_legs) ? f.future_legs.length > 0 : false,
  }));

  const engineOverrides: GroupingOverrideInput[] = (overrideRows ?? []).map((o) => ({
    id: o.id,
    overrideType: o.override_type,
    anchorFillId: o.anchor_fill_id,
    payload: o.payload,
    isActive: o.is_active,
  }));

  const { trades, unclassifiedFillIds, unsupportedOverrideIds } = reconstructTrades(
    engineFills,
    engineOverrides,
  );

  const existingByOpeningFillId = new Map(
    (existingTrades ?? []).map((t) => [t.opening_fill_id as string, t.id]),
  );
  const newOpeningFillIds = new Set(trades.map((t) => t.openingFillId));
  const orphanedOpeningFillIds = [...existingByOpeningFillId.keys()].filter(
    (id) => !newOpeningFillIds.has(id),
  );

  let tradesCreated = 0;
  let tradesUpdated = 0;
  let tradesClosed = 0;
  const touchedTradeIds: string[] = [];

  for (const trade of trades) {
    const pnl = calculatePnl({
      direction: trade.direction,
      entryWap: trade.entryWap,
      exitWap: trade.exitWap,
      totalEntryQty: trade.totalEntryQty,
      totalExitQty: trade.totalExitQty,
      entryCommissions: trade.entryCommissions,
      exitCommissions: trade.exitCommissions,
      contractSize: params.contractSize,
    });
    const sessionComputed = classifySession(trade.openedAt);

    const row = {
      user_id: params.userId,
      account_id: params.accountId,
      product_id: trade.productId,
      opening_fill_id: trade.openingFillId,
      direction: trade.direction,
      status: trade.status,
      opened_at: trade.openedAt,
      closed_at: trade.closedAt,
      max_size: trade.maxSize,
      total_entry_qty: trade.totalEntryQty,
      total_exit_qty: trade.totalExitQty,
      entry_wap: trade.entryWap,
      exit_wap: trade.exitWap,
      contract_multiplier: params.contractSize,
      notional_value: pnl.notionalValue,
      entry_commissions: trade.entryCommissions,
      exit_commissions: trade.exitCommissions,
      gross_pnl: pnl.grossPnl,
      net_pnl: pnl.netPnl,
      return_pct: pnl.returnPct,
      entries_count: trade.entriesCount,
      exits_count: trade.exitsCount,
      reconstruction_version: params.algorithmVersion,
      session_computed: sessionComputed,
      source: "COINBASE_SYNC" as const,
    };

    const existingId = existingByOpeningFillId.get(trade.openingFillId);
    let tradeId: string;

    if (existingId) {
      const { error } = await supabase.from("trades").update(row).eq("id", existingId);
      if (error) {
        throw new Error(`Failed to update trade ${existingId} (opening_fill_id ${trade.openingFillId}): ${error.message}`);
      }
      tradeId = existingId;
      tradesUpdated += 1;
    } else {
      const { data: inserted, error } = await supabase
        .from("trades")
        .insert(row)
        .select("id")
        .single();
      if (error || !inserted) {
        throw new Error(`Failed to insert trade for opening_fill_id ${trade.openingFillId}: ${error?.message}`);
      }
      tradeId = inserted.id;
      tradesCreated += 1;
    }

    if (trade.status === "CLOSED") tradesClosed += 1;
    touchedTradeIds.push(tradeId);

    // Full replace of this trade's fill allocations -- cheap, derived data.
    const { error: deleteError } = await supabase.from("trade_fills").delete().eq("trade_id", tradeId);
    if (deleteError) {
      throw new Error(`Failed to clear trade_fills for trade ${tradeId}: ${deleteError.message}`);
    }
    if (trade.fillAllocations.length > 0) {
      const { error: fillsError } = await supabase.from("trade_fills").insert(
        trade.fillAllocations.map((a) => ({
          user_id: params.userId,
          trade_id: tradeId,
          raw_fill_id: a.rawFillId,
          role: a.role,
          allocated_size: a.allocatedSize,
          allocated_commission: a.allocatedCommission,
          sequence_no: a.sequenceNo,
        })),
      );
      if (fillsError) {
        throw new Error(`Failed to insert trade_fills for trade ${tradeId}: ${fillsError.message}`);
      }
    }
  }

  return {
    tradesCreated,
    tradesUpdated,
    tradesClosed,
    unclassifiedFillIds,
    unsupportedOverrideIds,
    orphanedOpeningFillIds,
    touchedTradeIds,
  };
}
