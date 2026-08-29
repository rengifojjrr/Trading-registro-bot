import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import { sendPushToUser } from "@/lib/push/send";

import { sendCriticalAlertEmail } from "./email";

type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];
type NotificationSeverity = Database["public"]["Tables"]["notifications"]["Row"]["severity"];

/**
 * The one place notifications get created. Dedups against
 * notifications.dedup_key (see supabase/migrations 20260811120900_system.sql):
 * a repeated issue (Notion down, the same unclassified fill on every sync)
 * bumps occurrence_count on the existing unresolved row instead of spamming
 * a new one every ~5 minutes.
 */
export async function raiseNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dedupKey?: string;
  /**
   * Additionally email this alert. Deliberately only sent when the
   * notification is genuinely NEW -- a deduped repeat bumps the counter
   * silently, so a sync failing every five minutes produces one email, not
   * one every five minutes.
   */
  alsoEmail?: { subject: string; body: string };
}) {
  const supabase = createAdminClient();

  if (params.dedupKey) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id, occurrence_count")
      .eq("user_id", params.userId)
      .eq("dedup_key", params.dedupKey)
      .is("resolved_at", null)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("notifications")
        .update({
          occurrence_count: existing.occurrence_count + 1,
          last_seen_at: new Date().toISOString(),
          message: params.message,
        })
        .eq("id", existing.id);
      return;
    }
  }

  await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    severity: params.severity ?? "WARNING",
    title: params.title,
    message: params.message,
    related_entity_type: params.relatedEntityType,
    related_entity_id: params.relatedEntityId,
    dedup_key: params.dedupKey,
  });

  if (params.alsoEmail) {
    await sendCriticalAlertEmail(params.alsoEmail);
  }

  // Y al teléfono. Sólo cuando el aviso es **nuevo**, como el correo y por lo
  // mismo: los repetidos suben el contador en silencio, así que una
  // sincronización que falla cada cinco minutos manda un aviso, no uno cada
  // cinco minutos.
  //
  // Sin claves VAPID configuradas esto no hace nada, y la notificación se
  // guarda igual: el aviso al teléfono es una mejora, no un requisito.
  await sendPushToUser(params.userId);
}
