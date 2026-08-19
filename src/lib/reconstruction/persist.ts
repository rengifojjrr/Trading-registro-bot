import "server-only";

import { recordAudit } from "@/lib/audit/log";
import { raiseNotification } from "@/lib/notifications/create";
import { calculatePnl } from "@/lib/pnl/calculate";
import { classifySession } from "@/lib/sessions/classify";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  changedFigures,
  describeChangedFigures,
  parseStoredFigures,
  snapshotFigures,
} from "@/lib/validation/figures";

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
        "entry_id, product_id, side, price, size, commission, sequence_timestamp, trade_time, trade_type, future_legs, sync_run_id",
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
      .eq("product_id", params.productId),
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

  // A fill with no sync_run_id was never fetched from Coinbase -- today that
  // means it was imported from a CSV. Used below to label each trade by where
  // its fills actually came from, instead of assuming the API.
  const importedFillIds = new Set(
    (rawFills ?? []).filter((f) => f.sync_run_id === null).map((f) => f.entry_id),
  );

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
    (existingTrades ?? [])
      .filter((t) => t.opening_fill_id !== null)
      .map((t) => [t.opening_fill_id as string, t.id]),
  );
  /** Todas las operaciones de este (cuenta, producto), abran algo o no. */
  const scopeTradeIds = (existingTrades ?? []).map((t) => t.id);
  const newOpeningFillIds = new Set(trades.map((t) => t.openingFillId));
  const orphanedOpeningFillIds = [...existingByOpeningFillId.keys()].filter(
    (id) => !newOpeningFillIds.has(id),
  );

  // Las huérfanas se marcan **antes** de escribir, no después.
  //
  // Esta función hace N escrituras seguidas sin transacción, así que puede
  // morirse a la mitad. Con el marcado al final, morirse a la mitad dejaba las
  // operaciones viejas y las nuevas conviviendo, las dos visibles y las dos
  // sumando: el panel llegó a enseñar +305 en un día en el que se ganaron 152,
  // porque contaba el largo de 42 contratos y el de 43 a la vez. Marcándolas
  // primero, un fallo a media escritura deja de menos, nunca de más -- que en
  // una aplicación que cuenta dinero es la única dirección aceptable.
  if (orphanedOpeningFillIds.length > 0) {
    await supabase
      .from("trades")
      .update({ orphaned_at: new Date().toISOString() })
      .eq("user_id", params.userId)
      .in("opening_fill_id", orphanedOpeningFillIds)
      .is("orphaned_at", null);
  }

  // Y se vacían los enlaces de fills de TODO el ámbito de una vez, no los de
  // cada operación cuando le toca.
  //
  // `trade_fills` lleva UNIQUE (raw_fill_id, role) global, no por operación:
  // un fill sólo puede estar asignado una vez como entrada y una como salida
  // en toda la tabla. Es la restricción correcta -- sin ella, dos operaciones
  // activas podrían reclamar el mismo fill y el P&L se contaría dos veces sin
  // que nada lo detectara -- pero implica que, cuando un recálculo mueve los
  // límites, la operación vieja no puede seguir agarrando sus enlaces
  // mientras la nueva reclama los mismos. Borrando por operación, como se
  // hacía antes, la vieja los retenía y la nueva chocaba:
  // «duplicate key value violates unique constraint
  // trade_fills_raw_fill_id_role_key», y la reconstrucción entera se quedaba a
  // medias.
  //
  // La consecuencia es que una operación huérfana pierde sus enlaces. Se
  // acepta a conciencia: la fila se queda -- con su dirección, su tamaño, sus
  // precios y su resultado, que es lo que hace falta para auditarla -- y los
  // enlaces pasan a describir el reparto vigente, que es lo único que pueden
  // describir con esta restricción.
  if (scopeTradeIds.length > 0) {
    const { error: clearError } = await supabase
      .from("trade_fills")
      .delete()
      .eq("user_id", params.userId)
      .in("trade_id", scopeTradeIds);
    if (clearError) {
      throw new Error(`Failed to clear trade_fills for the recomputed scope: ${clearError.message}`);
    }
  }

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

    // Only a trade built entirely from imported fills counts as CSV_IMPORT.
    // If even one fill came from the API, the trade is still checkable
    // against Coinbase, so it stays COINBASE_SYNC and keeps appearing in
    // the validation queue.
    const source =
      trade.fillAllocations.length > 0 &&
      trade.fillAllocations.every((a) => importedFillIds.has(a.rawFillId))
        ? ("CSV_IMPORT" as const)
        : ("COINBASE_SYNC" as const);

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
      source,
      // A trade the recomputation produces is current by definition. Clearing
      // this matters as much as setting it: a fill that arrives late can make
      // a previously-orphaned trade real again, and it must come back rather
      // than stay marked as gone.
      orphaned_at: null,
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

    // Los enlaces de todo el ámbito ya se vaciaron arriba; aquí sólo se
    // escriben los nuevos.
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

  await flagVerifiedFiguresThatMoved(params.userId, touchedTradeIds);

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

/**
 * Compares every just-recomputed trade against the figures the user signed
 * off on, and flags any that moved.
 *
 * The verification is not revoked: deciding whether the new number is the
 * correct one is a judgement call, and silently un-ticking work someone did
 * would be its own kind of surprise. What this guarantees is that the
 * change cannot pass unnoticed -- which is the whole point of a journal
 * that claims to be authoritative.
 *
 * Never throws into the caller: a sync that computed the right trades must
 * not fail because a warning couldn't be written.
 */
async function flagVerifiedFiguresThatMoved(userId: string, tradeIds: string[]): Promise<void> {
  if (tradeIds.length === 0) return;

  try {
    const supabase = createAdminClient();

    const { data: verifications } = await supabase
      .from("trade_verifications")
      .select("trade_id, verified_figures, figures_changed_at")
      .eq("user_id", userId)
      .in("trade_id", tradeIds);

    const verified = (verifications ?? []).filter((v) => v.verified_figures !== null);
    if (verified.length === 0) return;

    const { data: trades } = await supabase
      .from("trades")
      .select("id, product_id, net_pnl, entry_wap, exit_wap, max_size, total_commissions")
      .in(
        "id",
        verified.map((v) => v.trade_id),
      );

    const tradeById = new Map((trades ?? []).map((t) => [t.id, t]));

    for (const verification of verified) {
      const trade = tradeById.get(verification.trade_id);
      if (!trade) continue;

      const moved = changedFigures(
        parseStoredFigures(verification.verified_figures),
        snapshotFigures(trade),
      );
      if (moved.length === 0) continue;

      // Already flagged and not re-verified since: don't renotify on every
      // five-minute sync for the same unresolved difference.
      if (verification.figures_changed_at) continue;

      await supabase
        .from("trade_verifications")
        .update({ figures_changed_at: new Date().toISOString() })
        .eq("trade_id", verification.trade_id);

      await raiseNotification({
        userId,
        type: "DISCREPANCY",
        severity: "WARNING",
        title: "Cambiaron cifras que ya habías verificado",
        message: `Una operación de ${trade.product_id} que marcaste como coincidente con Coinbase cambió: ${describeChangedFigures(moved)}. Revísala de nuevo para confirmar cuál es la cifra buena.`,
        relatedEntityType: "trade",
        relatedEntityId: verification.trade_id,
        dedupKey: `VERIFIED_FIGURES_CHANGED:${verification.trade_id}`,
      });

      await recordAudit({
        userId,
        action: "VERIFIED_FIGURES_CHANGED",
        entityType: "trade",
        entityId: verification.trade_id,
        metadata: { changed: moved, current: snapshotFigures(trade) },
      });
    }
  } catch (error) {
    console.error("[persist] no se pudo comprobar las cifras verificadas", error);
  }
}
