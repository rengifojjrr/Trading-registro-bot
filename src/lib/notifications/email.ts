import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Outbound email for critical alerts (repeated sync failures), so a broken
 * sync doesn't wait to be noticed until someone happens to open the
 * Actividad page.
 *
 * Sent through Resend's HTTP API rather than an SMTP/SDK dependency: it's
 * one fetch, and this is the only thing the app ever emails. Entirely
 * optional -- with no RESEND_API_KEY / ALERT_EMAIL_TO configured this is a
 * no-op, and it never throws into the sync pipeline, because failing to
 * send a warning must not itself break the run that produced the warning.
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
