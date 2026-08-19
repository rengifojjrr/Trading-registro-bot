"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { snapshotFigures } from "@/lib/validation/figures";
import { evaluateValidationGate } from "@/lib/validation/gate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Records the outcome of manually comparing one reconstructed trade
 * against Coinbase's own history. Upserted on trade_id so re-checking a
 * trade replaces the verdict instead of inflating the count.
 */
export async function recordVerification(
  tradeId: string,
  matches: boolean,
  note: string,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };

  const supabase = await createClient();

  // Freeze the numbers being signed off on. Without this, a later
  // recomputation could move them while the verification still claimed
  // they matched Coinbase.
  const { data: trade } = await supabase
    .from("trades")
    .select("net_pnl, entry_wap, exit_wap, max_size, total_commissions")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) return { error: "Operación no encontrada." };

  const figures = snapshotFigures(trade);

  const { error } = await supabase.from("trade_verifications").upsert(
    {
      user_id: user.id,
      trade_id: tradeId,
      matches,
      note: note.trim().slice(0, 1000) || null,
      verified_at: new Date().toISOString(),
      verified_figures: figures as unknown as Json,
      // Re-verifying clears a previous drift warning: the user has just
      // looked at the current numbers and accepted them.
      figures_changed_at: null,
    },
    { onConflict: "trade_id" },
  );

  if (error) return { error: "No se pudo guardar la revisión." };

  await recordAudit({
    userId: user.id,
    action: "TRADE_VERIFIED",
    entityType: "trade",
    entityId: tradeId,
    metadata: { matches, figures },
  });

  revalidatePath("/validation");
  revalidatePath("/settings");
  return { error: null };
}

export async function clearVerification(tradeId: string): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("trade_verifications")
    .delete()
    .eq("trade_id", tradeId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo borrar la revisión." };

  await recordAudit({
    userId: user.id,
    action: "VERIFICATION_CLEARED",
    entityType: "trade",
    entityId: tradeId,
  });

  revalidatePath("/validation");
  revalidatePath("/settings");
  return { error: null };
}

/**
 * Turns automatic syncing on or off.
 *
 * Enabling re-evaluates the validation gate server-side rather than
 * trusting the client: the UI disables the control when the gate is
 * closed, but that's a convenience, not the enforcement. Disabling is
 * always allowed -- stopping something is never gated.
 */
export async function setAutoSyncEnabled(enabled: boolean): Promise<{ error: string | null }> {
  const user = await requireUser();
  const supabase = await createClient();

  if (enabled) {
    const [{ data: verifications }, { count: closedCount }] = await Promise.all([
      supabase.from("trade_verifications").select("matches").eq("user_id", user.id),
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "CLOSED")
        .is("orphaned_at", null),
    ]);

    const rows = verifications ?? [];
    const gate = evaluateValidationGate({
      matching: rows.filter((v) => v.matches).length,
      mismatching: rows.filter((v) => !v.matches).length,
      available: closedCount ?? 0,
    });

    if (!gate.canEnable) {
      return { error: gate.blockedReason ?? "Todavía no se puede activar." };
    }
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ auto_sync_enabled: enabled })
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo cambiar la sincronización automática." };

  await recordAudit({
    userId: user.id,
    action: "AUTO_SYNC_TOGGLED",
    entityType: "app_settings",
    metadata: { enabled },
  });

  revalidatePath("/settings");
  revalidatePath("/validation");
  return { error: null };
}
