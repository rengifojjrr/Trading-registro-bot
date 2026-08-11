import { NextResponse } from "next/server";

import { processNotionSyncQueue } from "@/lib/notion/sync";
import { verifyCronRequest } from "@/lib/sync/verify-cron-request";

export const maxDuration = 60;

/**
 * Meant to fire on the same ~5 min cadence as /api/cron/sync (see
 * README.md) -- drains notion_sync_queue, which enqueueNotionSync() only
 * ever fills for trades whose owner has app_settings.notion_enabled=true.
 * Fully decoupled from Coinbase sync: a Notion outage here never touches
 * raw_fills/trades, and a Coinbase outage never blocks this route.
 */
export async function GET(request: Request) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

  const result = await processNotionSyncQueue();
  return NextResponse.json(result);
}
