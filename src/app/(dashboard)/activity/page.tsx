import { Activity as ActivityIcon } from "lucide-react";

import { NotificationsList, type NotificationRow } from "@/components/activity/notifications-list";
import { PageHeader } from "@/components/layout/page-header";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Raw pipeline statuses are stored in English because that's what the
 * sync/reconciliation code writes; everything user-facing in this app is
 * Spanish, so they're translated at the edge here rather than leaking
 * SUCCESS/FAILED/PARTIAL into the UI.
 */
const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Correcto",
  SYNCED: "Sincronizado",
  FAILED: "Falló",
  ERROR: "Error",
  PARTIAL: "Parcial",
  RUNNING: "En curso",
  IDLE: "En espera",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusVariant(status: string) {
  if (status === "SUCCESS" || status === "SYNCED") return "positive" as const;
  if (status === "FAILED" || status === "ERROR") return "negative" as const;
  if (status === "PARTIAL" || status === "RUNNING") return "warning" as const;
  return "default" as const;
}

export default async function ActivityPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [syncStateRes, syncRunsRes, reconciliationRes, notificationsRes, settingsRes] = await Promise.all([
    supabase
      .from("sync_state")
      .select("sync_type, status, last_success_at, last_attempt_at, consecutive_failures")
      .eq("user_id", user.id),
    supabase
      .from("sync_runs")
      .select("id, status, started_at, finished_at, fills_new, trades_created, trades_updated, error_summary")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("reconciliation_runs")
      .select("id, run_date, status, coinbase_fill_count, db_fill_count, resolved")
      .eq("user_id", user.id)
      .order("run_date", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, type, severity, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);

  const pollState = syncStateRes.data?.find((s) => s.sync_type === "POLL");
  const reconcileState = syncStateRes.data?.find((s) => s.sync_type === "RECONCILE");
  const syncRuns = syncRunsRes.data ?? [];
  const reconciliations = reconciliationRes.data ?? [];
  const notifications = (notificationsRes.data ?? []) as NotificationRow[];
  // Every other page renders dates in the user's configured zone; this one
  // used the browser's raw locale formatting, so the same event could show
  // a different time here than on the trade it came from.
  const timezone = settingsRes.data?.timezone || "UTC";

  return (
    <>
      <PageHeader
        title="Actividad"
        description="Estado de la sincronización con Coinbase y avisos del sistema."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sincronización con Coinbase</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {pollState ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(pollState.status)}>{statusLabel(pollState.status)}</Badge>
                  <span className="text-xs text-muted-foreground">se revisa cada ~5 min</span>
                </div>
                <p className="text-muted-foreground">
                  Última vez correcta:{" "}
                  {pollState.last_success_at ? formatDateTime(pollState.last_success_at, timezone) : "nunca"}
                </p>
                {pollState.consecutive_failures > 0 ? (
                  <p className="text-negative">{pollState.consecutive_failures} fallos seguidos</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Todavía no se ha ejecutado ninguna sincronización.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conciliación nocturna</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {reconcileState ? (
              <p>
                Última vez correcta:{" "}
                {reconcileState.last_success_at ? formatDateTime(reconcileState.last_success_at, timezone) : "nunca"}
              </p>
            ) : (
              <p>Todavía no se ha ejecutado ninguna conciliación.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationsList notifications={notifications} timezone={timezone} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection
            title="Historial de sincronizaciones"
            subtitle={syncRuns.length > 0 ? `Últimas ${syncRuns.length} corridas` : undefined}
          >
            {syncRuns.length === 0 ? (
              <EmptyState
                icon={ActivityIcon}
                title="Sin actividad todavía"
                description="Cada corrida de sincronización aparecerá aquí con lo que importó."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {syncRuns.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-y-1 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
                      <span className="text-muted-foreground">{formatDateTime(run.started_at, timezone)}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      +{run.fills_new} fills · {run.trades_created} nuevas · {run.trades_updated} actualizadas
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </CardContent>
      </Card>

      {reconciliations.length > 0 ? (
        <Card>
          <CardContent className="pt-5">
            <CollapsibleSection title="Historial de conciliación">
              <ul className="flex flex-col divide-y divide-border">
                {reconciliations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 py-2 text-sm">
                    <span>{r.run_date}</span>
                    <span className="tabular-nums text-muted-foreground">
                      Coinbase: {r.coinbase_fill_count ?? "--"} · Registrado: {r.db_fill_count ?? "--"}
                    </span>
                    <Badge variant={r.resolved ? "positive" : "warning"}>
                      {r.resolved ? "Resuelto" : "Pendiente"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
