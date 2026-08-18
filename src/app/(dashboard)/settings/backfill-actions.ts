"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type BackfillState = { error: string | null; message: string | null };

/**
 * Widens the next sync's window back to the full initial backfill.
 *
 * Normal syncs only ask Coinbase for fills newer than the high water mark,
 * which is right almost always and wrong in exactly one situation: a fill
 * that should have been ingested earlier never was, so the mark advanced
 * past it and no later sync will ever look that far back again. That is not
 * hypothetical -- it left a position of 42 contracts against a sell order
 * of 43, and a phantom short made of the difference.
 *
 * Clearing the mark is safe. Nothing is deleted, and the sync inserts only
 * fills it does not already have (raw_fills is keyed by Coinbase's own
 * entry_id), so re-fetching a window that is already complete does nothing
 * at all. The cost is one larger request.
 */
export async function requestFullBackfill(): Promise<BackfillState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: states, error } = await supabase
    .from("sync_state")
    .update({ high_water_mark: null })
    .eq("user_id", user.id)
    .eq("sync_type", "POLL")
    .select("id");

  if (error) {
    return { error: "No se pudo preparar el rebackfill.", message: null };
  }
  if (!states || states.length === 0) {
    return { error: "Todavía no hay una sincronización configurada que rehacer.", message: null };
  }

  await recordAudit({
    userId: user.id,
    action: "BACKFILL_REQUESTED",
    metadata: { note: "Se borró la marca de agua para que la próxima sincronización rehaga el histórico." },
  });

  revalidatePath("/settings");
  return {
    error: null,
    message:
      "Listo. La próxima sincronización pedirá el histórico completo en lugar de sólo lo nuevo. Pulsa «Sincronizar ahora».",
  };
}
