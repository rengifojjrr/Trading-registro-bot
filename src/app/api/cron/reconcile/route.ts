import { NextResponse } from "next/server";

import { purgeExpiredTrash } from "@/core/purge-trash";
import { persistSnapshots } from "@/lib/analytics/persist-snapshots";
import { raiseNotification } from "@/lib/notifications/create";
import { sendPendingAlerts } from "@/lib/notifications/email";
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

  // Sin filtrar por `auto_sync_enabled`.
  //
  // Antes se saltaba a todo el mundo que no tuviera la sincronización
  // automática encendida, que es justamente quien más necesita esto: quien no
  // sincroniza solo es quien acumula huecos. El resultado fue que en ocho días
  // no corrió ni una vez -- cero filas en `reconciliation_runs` -- mientras la
  // aplicación enseñaba una posición fantasma.
  //
  // Y el interruptor no protege de nada aquí. Conciliar es leer de Coinbase y
  // comparar; lo único que escribe son los fills que faltaban, que es la
  // reparación, no un riesgo. La puerta de validación existe para no *confiar*
  // en cifras automáticas, no para dejar de comprobarlas.
  const { data: eligibleSettings } = await supabase
    .from("app_settings")
    .select("user_id, timezone");

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

  const timezoneByUser = new Map(eligibleSettings.map((s) => [s.user_id, s.timezone || "UTC"]));

  const results = [];
  for (const account of accounts ?? []) {
    try {
      const summary = await runNightlyReconciliation(account.id);

      // Snapshot after reconciling, not before: the point is to record the
      // figures as they stand once the night's corrections have landed.
      const snapshot = await persistSnapshots({
        userId: account.user_id,
        accountId: account.id,
        timezone: timezoneByUser.get(account.user_id) ?? "UTC",
      });

      // A closed period whose total moved means history was rewritten --
      // by an override, a late correction from Coinbase, or an algorithm
      // change. Whatever the cause, it must not pass unnoticed.
      if (snapshot.changedPeriods.length > 0) {
        await raiseNotification({
          userId: account.user_id,
          type: "DISCREPANCY",
          severity: "WARNING",
          title: "Cambiaron cifras de periodos ya cerrados",
          message: `${snapshot.changedPeriods.length} periodo(s) tienen ahora un P&L distinto al que se guardó la última vez: ${snapshot.changedPeriods.slice(0, 5).join(", ")}. Revisa los cambios manuales en Actividad.`,
          dedupKey: `STATS_PERIOD_CHANGED:${account.id}:${snapshot.changedPeriods[0]}`,
        });
      }

      results.push({ accountId: account.id, ...summary, snapshot });
    } catch (error) {
      results.push({
        accountId: account.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // One digest per user per night, after everything else has run -- so a
  // problem discovered by the reconciliation is included in the same
  // message rather than arriving separately tomorrow. No-op unless email
  // is configured.
  const alerts = [];
  let purged = 0;
  for (const userId of new Set(userIds)) {
    alerts.push({ userId, ...(await sendPendingAlerts(userId)) });

    // Los treinta días que la papelera prometía y nadie cumplía. Va aquí y no
    // en su propio cron porque Vercel Hobby permite dos al día y ya están los
    // dos usados; purgar es barato y no depende de nada de lo anterior.
    purged += await purgeExpiredTrash(userId);
  }

  return NextResponse.json({ ranFor: results.length, results, alerts, purged });
}
