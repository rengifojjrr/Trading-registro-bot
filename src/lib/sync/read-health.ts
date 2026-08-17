import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { evaluateSyncHealth, type SyncHealth } from "@/lib/sync/freshness";

/**
 * How current the synced data is, for the pages that show live state.
 *
 * Reads the POLL sync_state row (the one the fills sync advances) rather
 * than the reconciliation row -- a reconciliation that ran recently says
 * nothing about whether new fills have been fetched.
 */
export async function readSyncHealth(): Promise<SyncHealth> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: state }, { data: settings }] = await Promise.all([
    supabase
      .from("sync_state")
      .select("last_success_at")
      .eq("user_id", user.id)
      .eq("sync_type", "POLL")
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("sync_interval_minutes, auto_sync_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return evaluateSyncHealth({
    lastSuccessAt: state?.last_success_at ?? null,
    intervalMinutes: settings?.sync_interval_minutes ?? 5,
    autoSyncEnabled: settings?.auto_sync_enabled ?? false,
  });
}
