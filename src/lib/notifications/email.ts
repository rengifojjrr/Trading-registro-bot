import "server-only";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Optional email alerting for problems you would otherwise only find by
 * opening the app.
 *
 * Designed around a lesson learned the hard way on this project: a
 * misconfigured cron sent roughly 288 failure emails a day, none of which
 * pointed at a real fault, and the effect was that all alerting became
 * noise to be ignored. So:
 *
 * - **Off unless configured.** No key, no email, no error.
 * - **One digest, not one per event.** The nightly job sends a single
 *   message summarising everything unread, or nothing at all.
 * - **A hard daily cap.** Even a pathological loop cannot exceed it.
 * - **Only CRITICAL and WARNING.** Informational notices live in the app.
 *
 * Never throws: alerting failing must never take down the job that
 * discovered the problem.
 */

const MAX_EMAILS_PER_DAY = 3;

export interface AlertSummary {
  sent: boolean;
  reason?: string;
  notificationCount?: number;
}

/**
 * Sends one message immediately. Kept because raiseNotification() has
 * always used it for CRITICAL events that shouldn't wait for the nightly
 * digest -- a sync that has failed repeatedly is worth interrupting for.
 */
export async function sendCriticalAlertEmail(params: {
  subject: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO || !env.ALERT_EMAIL_FROM) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: [env.ALERT_EMAIL_TO],
        subject: params.subject,
        text: params.body,
      }),
    });

    if (!res.ok) {
      // Deliberately not logging the response body: it echoes request
      // details and this runs in a server log the user may share.
      console.error(`[alert-email] provider returned ${res.status}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch {
    console.error("[alert-email] request failed");
    return { sent: false, reason: "request_failed" };
  }
}

export async function sendPendingAlerts(userId: string): Promise<AlertSummary> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO || !env.ALERT_EMAIL_FROM) {
    return { sent: false, reason: "No configurado" };
  }

  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // The cap is enforced from what was actually sent, not from a counter
    // in memory -- a redeploy must not reset someone's daily allowance.
    const { count: sentToday } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("emailed", true)
      .gte("emailed_at", since);

    if ((sentToday ?? 0) >= MAX_EMAILS_PER_DAY) {
      return { sent: false, reason: "Tope diario alcanzado" };
    }

    const { data: pending } = await supabase
      .from("notifications")
      .select("id, type, severity, title, message, created_at")
      .eq("user_id", userId)
      .eq("is_read", false)
      .eq("emailed", false)
      .in("severity", ["CRITICAL", "WARNING"])
      .order("created_at", { ascending: false })
      .limit(20);

    const notifications = pending ?? [];
    if (notifications.length === 0) return { sent: false, reason: "Nada que avisar" };

    const critical = notifications.filter((n) => n.severity === "CRITICAL").length;
    const subject =
      critical > 0
        ? `Trading Registro: ${critical} aviso(s) crítico(s)`
        : `Trading Registro: ${notifications.length} aviso(s)`;

    const body = [
      "Avisos pendientes en tu diario de trading:",
      "",
      ...notifications.map((n) => `• [${n.severity}] ${n.title}\n  ${n.message}`),
      "",
      "Entra a la aplicación para revisarlos. Este es el único correo que se envía por tanda;",
      `como máximo se envían ${MAX_EMAILS_PER_DAY} al día.`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        to: env.ALERT_EMAIL_TO,
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      console.error(`[alert-email] provider returned ${res.status}`);
      return { sent: false, reason: `Resend ${res.status}` };
    }

    // Mark them so the next run doesn't repeat the same digest.
    await supabase
      .from("notifications")
      .update({ emailed: true, emailed_at: new Date().toISOString() })
      .in(
        "id",
        notifications.map((n) => n.id),
      );

    return { sent: true, notificationCount: notifications.length };
  } catch (error) {
    console.error("[email] no se pudo enviar el aviso", error);
    return { sent: false, reason: "Error interno" };
  }
}
