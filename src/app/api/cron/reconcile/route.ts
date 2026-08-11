import { NextResponse } from "next/server";

import { runNightlyReconciliation } from "@/lib/sync/reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/sync/verify-cron-request";

export const maxDuration = 60;

/**
 * Meant to fire once nightly (app_settings.reconciliation_hour_local is the
 * user-configured intent, converted to a UTC cron schedule by whatever
 * external scheduler is wired up -- see README.md). Runs for the same
 * accounts the sync cron covers.
 */
export async function GET(request: Request) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const { data: eligibleSettings } = await supabase
    .from("app_settings")
    .select("user_id")
    .eq("auto_sync_enabled", true);

  if (!eligibleSettings || eligibleSettings.length === 0) {
    return NextResponse.json({ ranFor: 0, results: [] });
  }

  const userIds = eligibleSettings.map((s) => s.user_id);
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id")
    .in("user_id", userIds)
    .eq("is_active", true)
    .eq("is_demo", false);

  const results = [];
  for (const account of accounts ?? []) {
    try {
      const summary = await runNightlyReconciliation(account.id);
      results.push({ accountId: account.id, ...summary });
    } catch (error) {
      results.push({
        accountId: account.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ranFor: results.length, results });
}
