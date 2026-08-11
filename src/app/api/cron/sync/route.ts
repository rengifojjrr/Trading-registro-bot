import { NextResponse } from "next/server";

import { runPollSync } from "@/lib/sync/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/sync/verify-cron-request";

export const maxDuration = 60;

/**
 * Meant to fire every ~5 minutes (app_settings.sync_interval_minutes is the
 * user-configured intent; the actual cadence is whatever the external
 * scheduler is set to -- see README.md). Only ever touches accounts whose
 * owner has explicitly flipped auto_sync_enabled on, which itself must not
 * happen before docs/VALIDATION_CHECKLIST.md has passed. Demo accounts
 * (is_demo=true) are never synced.
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
      const summary = await runPollSync(account.id);
      results.push({ accountId: account.id, ...summary });
    } catch (error) {
      results.push({
        accountId: account.id,
        status: "FAILED" as const,
        errorSummary: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ranFor: results.length, results });
}
