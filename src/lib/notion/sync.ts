import "server-only";

import { createHash } from "node:crypto";

import { APIErrorCode, isHTTPResponseError } from "@notionhq/client";

import { serverEnv } from "@/lib/env";
import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";

import { getNotionClient, isNotionConfigured } from "./client";
import { buildNotionProperties, type MapperInput } from "./mapper";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_MAX_SECONDS = 3600;

/**
 * Called right after a trade (or its journal entry) changes -- Coinbase
 * sync, reconciliation, or a manual journal save. Only writes/bumps a
 * notion_sync_queue row if the user has enabled the mirror in Settings and
 * Notion credentials are actually configured. Never throws: a Notion outage
 * or misconfiguration must never block the caller's own work (see
 * supabase/migrations/20260811120800_notion.sql's header comment).
 */
export async function enqueueNotionSync(userId: string, tradeId: string): Promise<void> {
  try {
    if (!isNotionConfigured()) return;

    const supabase = createAdminClient();
    const { data: settings } = await supabase
      .from("app_settings")
      .select("notion_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (!settings?.notion_enabled) return;

    const nowIso = new Date().toISOString();
    const { data: existing } = await supabase
      .from("notion_sync_queue")
      .select("id")
      .eq("trade_id", tradeId)
      .in("status", ["PENDING", "PROCESSING"])
      .maybeSingle();

    if (existing) {
      // Already queued (or mid-flight) -- just make sure it's due now
      // instead of piling up a second row for the same trade.
      await supabase.from("notion_sync_queue").update({ next_attempt_at: nowIso }).eq("id", existing.id);
      return;
    }

    await supabase.from("notion_sync_queue").insert({
      user_id: userId,
      trade_id: tradeId,
      status: "PENDING",
      next_attempt_at: nowIso,
    });
  } catch {
    // Best-effort by design -- see docstring above.
  }
}

export interface ProcessQueueResult {
  processed: number;
  succeeded: number;
  retrying: number;
  failedPermanent: number;
}

/**
 * Drains due notion_sync_queue rows, called from /api/cron/notion-sync on
 * the same ~5 min cadence as the Coinbase poll. Service-role only. Never
 * throws -- each item's failure is recorded on its own queue row and
 * notion_sync_history entry, and processing moves on to the next item.
 */
export async function processNotionSyncQueue(limit = 20): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = { processed: 0, succeeded: 0, retrying: 0, failedPermanent: 0 };
  if (!isNotionConfigured()) return result;

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await supabase
    .from("notion_sync_queue")
    .select("id, user_id, trade_id, attempt_count")
    .eq("status", "PENDING")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  for (const item of due ?? []) {
    const { data: claimed } = await supabase
      .from("notion_sync_queue")
      .update({ status: "PROCESSING" })
      .eq("id", item.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // raced with another run and lost the claim

    result.processed += 1;
    const outcome = await processOne(supabase, item);
    if (outcome === "SUCCEEDED") result.succeeded += 1;
    else if (outcome === "FAILED_PERMANENT") result.failedPermanent += 1;
    else result.retrying += 1;
  }

  return result;
}

interface QueueItem {
  id: string;
  user_id: string;
  trade_id: string;
  attempt_count: number;
}

interface SyncTarget {
  pageId: string;
  databaseId: string;
  lastSyncedHash: string | null;
}

async function processOne(
  supabase: SupabaseAdmin,
  item: QueueItem,
): Promise<"SUCCEEDED" | "RETRYING" | "FAILED_PERMANENT"> {
  const startedAt = Date.now();
  // Only ever flipped to "UPDATE" once resolveTargetPage has actually
  // succeeded and found something -- if that lookup itself throws, we must
  // NOT fall through to a "no target" create, or a trade that already has a
  // Notion page could get a duplicate. See docs/NOTION_IMPORT.md and the
  // notion_sync_links-then-notion_import_links design this mirrors.
  let action: "CREATE" | "UPDATE" = "CREATE";

  try {
    const [target, context] = await Promise.all([
      resolveTargetPage(supabase, item.trade_id),
      loadTradeContext(supabase, item.trade_id),
    ]);
    action = target ? "UPDATE" : "CREATE";

    const properties = buildNotionProperties(context);
    const payloadHash = hashProperties(properties);

    if (target && target.lastSyncedHash === payloadHash) {
      // Nothing actually changed since the last successful sync -- skip the
      // Notion API call entirely to stay well under its rate limits.
      await supabase.from("notion_sync_queue").update({ status: "SUCCEEDED", last_error: null }).eq("id", item.id);
      return "SUCCEEDED";
    }

    const notion = getNotionClient();
    let pageId: string;
    let databaseId: string;

    if (target) {
      const updated = await notion.pages.update({ page_id: target.pageId, properties });
      pageId = updated.id;
      databaseId = target.databaseId;
    } else {
      databaseId = await resolveDatabaseId(item.user_id, supabase);
      const dataSourceId = await resolveDataSourceId(databaseId);
      const created = await notion.pages.create({ parent: { data_source_id: dataSourceId }, properties });
      pageId = created.id;
    }

    await supabase.from("notion_sync_links").upsert(
      {
        user_id: item.user_id,
        trade_id: item.trade_id,
        notion_page_id: pageId,
        notion_database_id: databaseId,
        status: "SYNCED",
        last_synced_at: new Date().toISOString(),
        last_synced_hash: payloadHash,
        error_message: null,
      },
      { onConflict: "trade_id" },
    );

    await supabase.from("notion_sync_history").insert({
      user_id: item.user_id,
      trade_id: item.trade_id,
      action,
      status: "SUCCESS",
      http_status: 200,
      rate_limited: false,
      duration_ms: Date.now() - startedAt,
    });

    await supabase.from("notion_sync_queue").update({ status: "SUCCEEDED", last_error: null }).eq("id", item.id);
    return "SUCCEEDED";
  } catch (error) {
    return handleFailure(supabase, item, action, error, startedAt);
  }
}

async function resolveTargetPage(supabase: SupabaseAdmin, tradeId: string): Promise<SyncTarget | null> {
  const { data: link } = await supabase
    .from("notion_sync_links")
    .select("notion_page_id, notion_database_id, last_synced_hash")
    .eq("trade_id", tradeId)
    .maybeSingle();
  if (link) {
    return { pageId: link.notion_page_id, databaseId: link.notion_database_id, lastSyncedHash: link.last_synced_hash };
  }

  // Trade originated FROM Notion (historical import) -- reuse that same
  // page instead of ever creating a second one for it.
  const { data: imported } = await supabase
    .from("notion_import_links")
    .select("notion_page_id, notion_database_id")
    .eq("trade_id", tradeId)
    .maybeSingle();
  if (imported) {
    return { pageId: imported.notion_page_id, databaseId: imported.notion_database_id, lastSyncedHash: null };
  }

  return null;
}

async function loadTradeContext(supabase: SupabaseAdmin, tradeId: string): Promise<MapperInput> {
  const { data: trade, error } = await supabase.from("trades").select("*").eq("id", tradeId).single();
  if (error || !trade) {
    throw new Error(`Trade ${tradeId} no encontrado: ${error?.message ?? "sin datos"}`);
  }

  const [{ data: journalEntry }, { data: account }, { data: product }, { data: mappings }] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("trade_id", tradeId).maybeSingle(),
    supabase.from("accounts").select("name").eq("id", trade.account_id).single(),
    supabase.from("products").select("display_name, product_id").eq("product_id", trade.product_id).maybeSingle(),
    supabase.from("notion_field_mappings").select("internal_field").eq("user_id", trade.user_id).eq("enabled", false),
  ]);

  return {
    trade,
    journalEntry,
    accountName: account?.name ?? "Cuenta",
    productDisplayName: product?.display_name ?? product?.product_id ?? trade.product_id,
    disabledFields: new Set((mappings ?? []).map((m) => m.internal_field)),
  };
}

async function resolveDatabaseId(userId: string, supabase: SupabaseAdmin): Promise<string> {
  const { data: settings } = await supabase
    .from("app_settings")
    .select("notion_database_id")
    .eq("user_id", userId)
    .maybeSingle();
  const databaseId = settings?.notion_database_id || serverEnv().NOTION_DATABASE_ID;
  if (!databaseId) {
    throw new Error("No hay NOTION_DATABASE_ID configurado (ni en Ajustes ni en el entorno).");
  }
  return databaseId;
}

// database_id -> data_source_id. Notion's 2025-09-03 API model requires the
// data source id (not the database id) to create a page -- see
// scripts/import-notion-journal.ts, which resolves the same way for reads.
// Safe to cache at module scope: the Notion integration is process-wide
// (NOTION_DATABASE_ID / app_settings.notion_database_id), not per-request.
const dataSourceIdCache = new Map<string, string>();

async function resolveDataSourceId(databaseId: string): Promise<string> {
  const cached = dataSourceIdCache.get(databaseId);
  if (cached) return cached;

  const notion = getNotionClient();
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = (database as { data_sources?: Array<{ id: string }> }).data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`La base de datos de Notion ${databaseId} no tiene ningún data source.`);
  }
  dataSourceIdCache.set(databaseId, dataSourceId);
  return dataSourceId;
}

function hashProperties(properties: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(properties)).digest("hex");
}

async function handleFailure(
  supabase: SupabaseAdmin,
  item: QueueItem,
  action: "CREATE" | "UPDATE",
  error: unknown,
  startedAt: number,
): Promise<"RETRYING" | "FAILED_PERMANENT"> {
  const message = error instanceof Error ? error.message : "Error desconocido";
  const httpStatus = isHTTPResponseError(error) ? error.status : null;
  const rateLimited = isHTTPResponseError(error) && error.code === APIErrorCode.RateLimited;

  await supabase.from("notion_sync_history").insert({
    user_id: item.user_id,
    trade_id: item.trade_id,
    action,
    status: rateLimited ? "RATE_LIMITED" : "ERROR",
    http_status: httpStatus,
    rate_limited: rateLimited,
    duration_ms: Date.now() - startedAt,
    error_message: message.slice(0, 2000),
  });

  const attemptCount = item.attempt_count + 1;

  if (attemptCount >= MAX_ATTEMPTS) {
    await supabase
      .from("notion_sync_queue")
      .update({ status: "FAILED_PERMANENT", attempt_count: attemptCount, last_error: message })
      .eq("id", item.id);

    await supabase
      .from("notion_sync_links")
      .update({ status: "ERROR", error_message: message })
      .eq("trade_id", item.trade_id);

    await raiseNotification({
      userId: item.user_id,
      type: "NOTION_ERROR",
      severity: "WARNING",
      title: "No se pudo sincronizar una operación con Notion",
      message: `Después de ${attemptCount} intentos, esta operación no se pudo reflejar en Notion. Último error: ${message}`,
      relatedEntityType: "trade",
      relatedEntityId: item.trade_id,
      dedupKey: `NOTION_ERROR:trade:${item.trade_id}`,
    });

    return "FAILED_PERMANENT";
  }

  const delaySeconds = Math.min(BACKOFF_BASE_SECONDS * 2 ** (attemptCount - 1), BACKOFF_MAX_SECONDS);
  await supabase
    .from("notion_sync_queue")
    .update({
      status: "PENDING",
      attempt_count: attemptCount,
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      last_error: message,
    })
    .eq("id", item.id);

  return "RETRYING";
}
