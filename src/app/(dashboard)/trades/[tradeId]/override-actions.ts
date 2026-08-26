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
 * Se ofrecen dos: EXCLUDE_FILL y MERGE.
 *
 * `SPLIT` y `REASSIGN` no se ofrecen, y no por estar sin hacer: partir una
 * posición continua en dos no puede dar un P&L honesto -- el segundo trozo
 * heredaría contratos sin fill de entrada, así que su cantidad de salida
 * superaría a la de entrada. Hacerlo bien exige contabilidad por lotes
 * (FIFO/LIFO), que es otro modelo para toda la aplicación y no un ajuste por
 * operación. Ofrecerlo aquí daría números seguros y equivocados.
 *
 * `MERGE` sí es honesto porque no inventa nada: coge dos viajes de cero a cero
 * consecutivos y del mismo sentido, y los cuenta como uno. Todos los fills
 * siguen siendo los mismos y la suma no cambia -- lo que cambia es dónde se
 * pone la frontera.
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

/**
 * Funde esta operación con la anterior.
 *
 * El caso: cerraste a cero por un parcial que se llevó todo y volviste a
 * entrar a los diez segundos con la misma idea. Son dos viajes de cero a cero
 * y el motor tiene razón en separarlas; para quien operaba fue una decisión, y
 * las rachas, la duración y el tamaño medio salen mal contados.
 *
 * Se comprueba aquí, antes de escribir, que la fusión es posible: crear un
 * ajuste que el motor va a rechazar deja al usuario con una corrección puesta
 * que no hace nada y un aviso que explica por qué -- dos pasos para enterarse
 * de algo que se sabía antes de empezar.
 */
export async function mergeWithPrevious(
  tradeId: string,
  note: string,
): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };

  const { user, supabase, trade } = await loadTradeContext(tradeId);
  if (!trade) return { error: "Operación no encontrada." };

  const { data: esta } = await supabase
    .from("trades")
    .select("opening_fill_id, direction, opened_at")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!esta?.opening_fill_id) {
    return { error: "Esta operación no tiene un fill de apertura al que anclar la fusión." };
  }

  // La anterior del mismo producto y cuenta, por fecha de apertura.
  const { data: anterior } = await supabase
    .from("trades")
    .select("id, direction, status, closed_at")
    .eq("user_id", user.id)
    .eq("account_id", trade.account_id)
    .eq("product_id", trade.product_id)
    .is("orphaned_at", null)
    .lt("opened_at", esta.opened_at)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anterior) {
    return { error: "No hay ninguna operación anterior de este producto con la que fundir." };
  }
  if (anterior.status !== "CLOSED") {
    return { error: "La operación anterior no está cerrada, así que no hay dos que fundir." };
  }
  if (anterior.direction !== esta.direction) {
    return {
      error:
        "La anterior va en el sentido contrario. Fundirlas daría un precio de entrada que promedia compras de los dos extremos, y eso no significa nada.",
    };
  }

  const { error } = await supabase.from("trade_grouping_overrides").insert({
    user_id: user.id,
    account_id: trade.account_id,
    product_id: trade.product_id,
    override_type: "MERGE",
    anchor_fill_id: esta.opening_fill_id,
    note: note.trim().slice(0, 500) || null,
  });

  if (error) return { error: "No se pudo crear la fusión." };

  await recordAudit({
    userId: user.id,
    action: "TRADES_MERGED",
    entityType: "trade",
    entityId: tradeId,
    metadata: {
      productId: trade.product_id,
      anchorFillId: esta.opening_fill_id,
      previousTradeId: anterior.id,
      note: note.trim().slice(0, 500) || null,
    },
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
