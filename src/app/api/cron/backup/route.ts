import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/sync/verify-cron-request";

export const maxDuration = 60;

/**
 * Scheduled backup of everything the app cannot recompute.
 *
 * There has always been a "download a backup" button, which only helps if
 * someone remembers to press it. This writes the same export to Supabase
 * Storage on a schedule, so the answer to "when was your last backup" stops
 * depending on memory.
 *
 * Deliberately exports the *raw* layer plus the human-authored layer, not
 * the computed one: trades, stats and allocations can all be rebuilt from
 * raw_fills by the reconstruction engine, but a journal entry, a manual
 * override or a verification exists nowhere else.
 *
 * Los siete módulos de vida entran enteros y por el mismo motivo, sólo que en
 * ellos no hay capa que recalcular: una noche que dormiste en marzo no se
 * reconstruye desde ningún sitio. Estuvieron fuera de esta lista desde el
 * principio, que es el fallo silencioso más caro que ha tenido este proyecto.
 */
const TABLES = [
  // -------------------------------------------------------------- Trading
  "raw_fills",
  "raw_orders",
  "accounts",
  "trade_grouping_overrides",
  "journal_entries",
  "journal_templates",
  "trade_comments",
  "trade_tags",
  "tags",
  "strategies",
  "playbook_items",
  "trade_playbook_checks",
  "trade_mistakes",
  "trade_verifications",
  "chart_drawings",
  "saved_views",

  // ----------------------------------------------------- Los siete de vida
  //
  // No estaban. Ninguno de los siete módulos de vida se estaba copiando: 244
  // marcas de hábitos, 71 noches, 58 piezas de contenido y 54 tareas fuera del
  // respaldo, y encima la pantalla de comprobación decía «la copia se puede
  // restaurar» sin mencionar que ignoraba cinco módulos enteros.
  //
  // Es peor que no tener copia: una copia que se cree completa y no lo es hace
  // que nadie busque otra forma de guardar lo que falta.
  //
  // Y aquí nada se recalcula desde nada. Una operación se reconstruye desde
  // sus fills; una noche que dormiste en marzo no se reconstruye desde ningún
  // sitio. Si se pierde, se perdió.
  "sleep_entries",
  "habits_definitions",
  "habits_entries",
  "tasks_items",
  "tasks_projects",
  "meals_entries",
  "meals_ingredients",
  "reading_books",
  "reading_sessions",
  "content_pieces",

  // ---------------------------------------- Piezas comunes y configuración
  "core_comments",
  "core_attachments",
  "core_relations",
  "core_templates",
  "core_module_views",
  "app_settings",
  "csv_imports",
  "audit_log",
] as const;

/** Anything older than this is deleted on each run, so backups don't grow without bound. */
const RETENTION_DAYS = 90;

export async function GET(request: Request) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const { data: users } = await supabase.from("app_settings").select("user_id");
  if (!users || users.length === 0) {
    return NextResponse.json({ backedUp: 0 });
  }

  const results = [];

  for (const { user_id: userId } of users) {
    try {
      const payload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        schemaNote:
          "Capa cruda y capa escrita por una persona. Las operaciones y estadísticas no se incluyen: se reconstruyen desde raw_fills.",
      };

      for (const table of TABLES) {
        const { data } = await supabase.from(table).select("*").eq("user_id", userId);
        payload[table] = data ?? [];
      }

      // products is shared rather than per-user (it holds contract specs,
      // not personal data), so it has no user_id to filter on -- but a
      // backup without it can't be restored: every P&L depends on the
      // contract multipliers stored here.
      const { data: products } = await supabase.from("products").select("*");
      payload.products = products ?? [];

      const path = `${userId}/${new Date().toISOString().slice(0, 10)}.json`;
      const { error: uploadError } = await supabase.storage
        .from("backups")
        .upload(path, JSON.stringify(payload), {
          contentType: "application/json",
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

      await pruneOldBackups(userId);

      await recordAudit({
        userId,
        action: "BACKUP_EXPORTED",
        entityType: "backup",
        entityId: path,
        metadata: { automatic: true, tables: TABLES.length },
      });

      results.push({ userId, path, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      console.error("[cron/backup] falló para", userId, message);

      // A backup that silently stops running is worse than no backup at
      // all, because you only find out when you need it.
      await raiseNotification({
        userId,
        type: "SYNC_FAILURE",
        severity: "CRITICAL",
        title: "El respaldo automático falló",
        message: `No se pudo guardar la copia de seguridad: ${message}. Descarga una manualmente desde Configuración mientras se resuelve.`,
        dedupKey: `BACKUP_FAILED:${userId}`,
      });

      results.push({ userId, ok: false, error: message });
    }
  }

  return NextResponse.json({ backedUp: results.filter((r) => r.ok).length, results });
}

async function pruneOldBackups(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: files } = await supabase.storage.from("backups").list(userId, { limit: 1000 });
  if (!files) return;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = files.filter((f) => new Date(f.created_at ?? 0).getTime() < cutoff);
  if (stale.length === 0) return;

  await supabase.storage.from("backups").remove(stale.map((f) => `${userId}/${f.name}`));
}
