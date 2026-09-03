import "server-only";

import { recordAudit } from "@/lib/audit/log";
import { raiseNotification } from "@/lib/notifications/create";
import { calculatePnl } from "@/lib/pnl/calculate";
import { classifySession } from "@/lib/sessions/classify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  changedFigures,
  describeChangedFigures,
  parseStoredFigures,
  snapshotFigures,
} from "@/lib/validation/figures";

import { reconstructTrades } from "./engine";
import type { GroupingOverrideInput, ReconstructionFillInput, RejectedOverride } from "./types";

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
  /** Los mismos, con el motivo: es lo que hace que el aviso diga qué hacer. */
  rejectedOverrides: RejectedOverride[];
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

  const { trades, unclassifiedFillIds, unsupportedOverrideIds, rejectedOverrides } = reconstructTrades(
    engineFills,
    engineOverrides,
  );

  const existingByOpeningFillId = new Map(
    (existingTrades ?? [])
      .filter((t) => t.opening_fill_id !== null)
      .map((t) => [t.opening_fill_id as string, t.id]),
  );
  const newOpeningFillIds = new Set(trades.map((t) => t.openingFillId));
  const orphanedOpeningFillIds = [...existingByOpeningFillId.keys()].filter(
    (id) => !newOpeningFillIds.has(id),
  );

  // Todo lo que sigue va en **una sola transacción**, dentro de
  // `persist_reconstruction`. El cálculo se queda aquí, que es donde está
  // probado; sólo baja la escritura, que es la parte que tiene que ser
  // todo-o-nada.
  //
  // Antes eran entre diez y cien escrituras sueltas contra PostgREST, cada
  // una su propia transacción, y morirse a la mitad no era teórico: pasó, y
  // dejó la operación nueva creada, las viejas sin marcar como huérfanas y
  // las siguientes sin crear. El panel enseñó +305 dólares en un día en el
  // que se ganaron 152, porque contaba dos versiones de la misma operación.
  const payload = trades.map((trade) => {
    const pnl = calculatePnl({
      direction: trade.direction,
      entryWap: trade.entryWap,
      exitWap: trade.exitWap,
      totalEntryQty: trade.totalEntryQty,
      totalExitQty: trade.totalExitQty,
      entryCommissions: trade.entryCommissions,
      exitCommissions: trade.exitCommissions,
      contractSize: params.contractSize,
      // Sólo mientras está abierta: es cuando el reparto entre lo cobrado y
      // lo flotante existe, y cuando tiene que ser el de Coinbase. Cerrada,
      // las dos fórmulas dan lo mismo y la de los WAP deja las cifras
      // guardadas exactamente como estaban.
      fifoRealizedPoints: trade.status === "OPEN" ? trade.fifoRealizedPoints : null,
    });

    // Sólo una operación construida enteramente con fills importados cuenta
    // como CSV_IMPORT. Si uno solo vino de la API, la operación se puede
    // seguir comprobando contra Coinbase y sigue siendo COINBASE_SYNC.
    const source =
      trade.fillAllocations.length > 0 &&
      trade.fillAllocations.every((a) => importedFillIds.has(a.rawFillId))
        ? "CSV_IMPORT"
        : "COINBASE_SYNC";

    return {
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
      open_lots_wap: trade.openLotsWap,
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
      session_computed: classifySession(trade.openedAt),
      source,
      allocations: trade.fillAllocations.map((a) => ({
        raw_fill_id: a.rawFillId,
        role: a.role,
        allocated_size: a.allocatedSize,
        allocated_commission: a.allocatedCommission,
        sequence_no: a.sequenceNo,
      })),
    };
  });

  const { data: written, error: writeError } = await supabase.rpc("persist_reconstruction", {
    p_user_id: params.userId,
    p_account_id: params.accountId,
    p_product_id: params.productId,
    p_orphaned_opening_fill_ids: orphanedOpeningFillIds,
    p_trades: payload as unknown as Json,
  });

  if (writeError) {
    throw new Error(`Failed to persist the reconstruction: ${writeError.message}`);
  }

  const result = (written ?? {}) as {
    created?: number;
    updated?: number;
    closed?: number;
    touched?: string[];
  };
  const tradesCreated = result.created ?? 0;
  const tradesUpdated = result.updated ?? 0;
  const tradesClosed = result.closed ?? 0;
  const touchedTradeIds = result.touched ?? [];

  await flagVerifiedFiguresThatMoved(params.userId, touchedTradeIds);

  // Qué parte de cada operación la cerró Coinbase y no tú. Va aquí y no en
  // la sincronización porque la reconstrucción se lanza desde cuatro sitios
  // (sincronización, conciliación nocturna, correcciones manuales e
  // importación de CSV) y el dato tiene que ser cierto salga de donde salga.
  await refreshLiquidations(params.userId, params.productId);

  return {
    tradesCreated,
    tradesUpdated,
    tradesClosed,
    unclassifiedFillIds,
    unsupportedOverrideIds,
    rejectedOverrides,
    orphanedOpeningFillIds,
    touchedTradeIds,
  };
}

/**
 * Marca en cada operación cuántos contratos cerró una liquidación de Coinbase.
 *
 * `trades.liquidated_qty` se deriva de `trade_fills` + `raw_orders`, así que
 * tiene que recalcularse cada vez que cambia el reparto de fills -- y el RPC
 * `persist_reconstruction` sólo escribe las columnas que conoce. Se hace en
 * la base de datos, en una sola sentencia por producto, porque es un join
 * de tres tablas que aquí serían tres viajes.
 *
 * Nunca lanza: una reconstrucción correcta no puede fallar porque no se haya
 * podido poner una etiqueta.
 */
async function refreshLiquidations(userId: string, productId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("refresh_trade_liquidations", {
      p_user_id: userId,
      p_product_id: productId,
    });
    if (error) {
      console.error("[persist] no se pudo marcar qué cerró Coinbase por su cuenta", error);
    }
  } catch (error) {
    console.error("[persist] no se pudo marcar qué cerró Coinbase por su cuenta", error);
  }
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
