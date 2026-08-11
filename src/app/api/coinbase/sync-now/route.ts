import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { runPollSync } from "@/lib/sync/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Manual, explicit "sync now" for the validation phase described in
 * docs/VALIDATION_CHECKLIST.md -- deliberately does NOT check or require
 * app_settings.auto_sync_enabled (that gate is only for the recurring ~5
 * min cron; runPollSync's own docstring already anticipates being called
 * this way during validation). Triggered only by an explicit click on the
 * Settings page, never automatically.
 *
 * Lazily creates the user's one real (non-demo) Coinbase account row on
 * first use -- nothing else in the app creates one yet. portfolio_id is
 * only a descriptive label here (Coinbase's REST endpoints don't take a
 * portfolio filter; a CDP key is already scoped to one portfolio), so a
 * placeholder is fine rather than requiring a separate "connect portfolio"
 * step for what is, for now, always a single account per user.
 */
export async function GET() {
  const user = await requireUser();
  const env = serverEnv();

  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || !env.COINBASE_PRODUCT_ID) {
    return NextResponse.json(
      { ok: false, message: "Coinbase no está configurado todavía en este servidor." },
      { status: 200 },
    );
  }

  const supabase = createAdminClient();

  const { data: existingAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("venue", env.COINBASE_PRODUCT_VENUE)
    .eq("is_demo", false)
    .maybeSingle();

  let accountId = existingAccount?.id;

  if (!accountId) {
    const { data: created, error } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        portfolio_id: "default",
        venue: env.COINBASE_PRODUCT_VENUE,
        name: "Coinbase",
        is_demo: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("[coinbase/sync-now] failed to create account", error);
      return NextResponse.json({ ok: false, message: "No se pudo crear la cuenta de Coinbase." }, { status: 200 });
    }
    accountId = created.id;
  }

  const summary = await runPollSync(accountId);

  if (summary.status === "FAILED") {
    return NextResponse.json(
      { ok: false, message: summary.errorSummary ?? "La sincronización falló." },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, summary });
}
