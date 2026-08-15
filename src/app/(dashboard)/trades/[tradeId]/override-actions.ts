"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { persistReconstruction } from "@/lib/reconstruction/persist";
import { createClient } from "@/lib/supabase/server";

const RECONSTRUCTION_ALGORITHM_VERSION = 1;

/**
 * Manual corrections to how fills are grouped into trades.
 *
 * These are stored as *overrides*, never as edits to the computed trades:
 * reconstruction is a pure function of (raw fills, active overrides), so a
 * correction is re-applied on every future sync instead of being
 * overwritten by it. That's also why "undo" deactivates the override
 * rather than editing the trade back.
 *
 * Only EXCLUDE_FILL is offered. The schema also allows SPLIT/MERGE/
 * REASSIGN, but splitting one continuous position into two trades cannot
 * produce honest P&L: the second piece would inherit contracts it has no
 * entry fill for, so its exit quantity would exceed its entry quantity.
 * Supporting that properly means per-lot (FIFO/LIFO) accounting, which is
 * a different accounting model for the whole app -- not a per-trade
 * override. Offering it here would produce confident, wrong numbers.
 */
async function loadTradeContext(tradeId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id, account_id, product_id, contract_multiplier")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, supabase, trade };
}

export async function excludeFill(
  tradeId: string,
  rawFillId: string,
  note: string,
): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };
  if (!rawFillId.trim()) return { error: "Fill inválido." };

  const { user, supabase, trade } = await loadTradeContext(tradeId);
  if (!trade) return { error: "Operación no encontrada." };

  const { error } = await supabase.from("trade_grouping_overrides").insert({
    user_id: user.id,
    account_id: trade.account_id,
    product_id: trade.product_id,
    override_type: "EXCLUDE_FILL",
    anchor_fill_id: rawFillId,
    note: note.trim().slice(0, 500) || null,
  });

  if (error) return { error: "No se pudo excluir el fill." };

  await recordAudit({
    userId: user.id,
    action: "FILL_EXCLUDED",
    entityType: "raw_fill",
    entityId: rawFillId,
    metadata: { tradeId, productId: trade.product_id, note: note.trim().slice(0, 500) || null },
  });

  return rebuild(tradeId, trade);
}

/** Reactivates a previously excluded fill by deactivating its override -- the record of the correction is kept. */
export async function undoOverride(tradeId: string, overrideId: string): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(overrideId).success) return { error: "Corrección inválida." };

  const { user, supabase, trade } = await loadTradeContext(tradeId);
  if (!trade) return { error: "Operación no encontrada." };

  const { error } = await supabase
    .from("trade_grouping_overrides")
    .update({ is_active: false })
    .eq("id", overrideId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo deshacer la corrección." };

  await recordAudit({
    userId: user.id,
    action: "OVERRIDE_UNDONE",
    entityType: "trade_grouping_override",
    entityId: overrideId,
    metadata: { tradeId, productId: trade.product_id },
  });

  return rebuild(tradeId, trade);
}

/**
 * Recomputes every trade for this product from the raw fills. Safe to run
 * at any time -- reconstruction is deterministic, so with no override
 * changes it produces exactly the same trades.
 */
export async function recalculateProduct(tradeId: string): Promise<{ error: string | null }> {
  const { user, trade } = await loadTradeContext(tradeId);
  if (!trade) return { error: "Operación no encontrada." };

  await recordAudit({
    userId: user.id,
    action: "PRODUCT_RECALCULATED",
    entityType: "product",
    entityId: trade.product_id,
    metadata: { tradeId, triggeredManually: true },
  });

  return rebuild(tradeId, trade);
}

async function rebuild(
  tradeId: string,
  trade: { account_id: string; product_id: string; contract_multiplier: string },
): Promise<{ error: string | null }> {
  const user = await requireUser();

  try {
    await persistReconstruction({
      userId: user.id,
      accountId: trade.account_id,
      productId: trade.product_id,
      contractSize: trade.contract_multiplier,
      algorithmVersion: RECONSTRUCTION_ALGORITHM_VERSION,
    });
  } catch {
    return { error: "La reconstrucción falló. Tus datos crudos no se modificaron." };
  }

  // The trade this correction started from may no longer exist after the
  // rebuild (its boundaries can change), so refresh the list too.
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
  return { error: null };
}
