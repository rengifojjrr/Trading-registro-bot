"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { evaluateValidationGate } from "@/lib/validation/gate";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.from("trade_verifications").upsert(
    {
      user_id: user.id,
      trade_id: tradeId,
      matches,
      note: note.trim().slice(0, 1000) || null,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "trade_id" },
  );

  if (error) return { error: "No se pudo guardar la revisión." };

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
        .eq("status", "CLOSED"),
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

  revalidatePath("/settings");
  revalidatePath("/validation");
  return { error: null };
}
