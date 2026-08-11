import { Activity as ActivityIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

function statusVariant(status: string) {
  if (status === "SUCCESS" || status === "SYNCED") return "positive" as const;
  if (status === "FAILED" || status === "ERROR") return "negative" as const;
  if (status === "PARTIAL" || status === "RUNNING") return "warning" as const;
  return "default" as const;
}

export default async function ActivityPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [syncStateRes, syncRunsRes, reconciliationRes, notificationsRes] =
    await Promise.all([
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
    ]);

  const pollState = syncStateRes.data?.find((s) => s.sync_type === "POLL");
  const reconcileState = syncStateRes.data?.find((s) => s.sync_type === "RECONCILE");
  const syncRuns = syncRunsRes.data ?? [];
  const reconciliations = reconciliationRes.data ?? [];
  const notifications = notificationsRes.data ?? [];

  return (
    <>
      <PageHeader
        title="Actividad y estado del sistema"
        description="Última sincronización, conciliación nocturna y notificaciones internas -- sin exponer claves ni tokens."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sincronización con Coinbase (cada ~5 min)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {pollState ? (
              <>
                <p>
                  Estado: <Badge variant={statusVariant(pollState.status)}>{pollState.status}</Badge>
                </p>
                <p className="text-muted-foreground">
                  Último éxito:{" "}
                  {pollState.last_success_at
                    ? new Date(pollState.last_success_at).toLocaleString("es")
                    : "nunca"}
                </p>
                {pollState.consecutive_failures > 0 ? (
                  <p className="text-negative">
                    {pollState.consecutive_failures} fallos consecutivos
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                Todavía no se ha ejecutado ninguna sincronización.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conciliación nocturna</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {reconcileState ? (
              <p className="text-muted-foreground">
                Último éxito:{" "}
                {reconcileState.last_success_at
                  ? new Date(reconcileState.last_success_at).toLocaleString("es")
                  : "nunca"}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Todavía no se ha ejecutado ninguna conciliación.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Corridas de sincronización recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {syncRuns.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title="Sin actividad todavía"
              description="Cuando se conecte una clave de Coinbase de solo lectura y comience la sincronización, cada corrida (fills importados, operaciones creadas o actualizadas, discrepancias) aparecerá aquí."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {syncRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(run.started_at).toLocaleString("es")}
                    </span>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    +{run.fills_new} fills · {run.trades_created} nuevas · {run.trades_updated}{" "}
                    actualizadas
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <EmptyState
              title="Sin notificaciones"
              description="Fallos repetidos de sincronización, discrepancias frente a Coinbase, fills sin clasificar, especificaciones de contrato faltantes o cálculos no verificables aparecerán aquí -- nunca se ocultan ni se completan con datos inventados."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={n.severity === "CRITICAL" ? "negative" : "warning"}
                    >
                      {n.severity}
                    </Badge>
                    <span className="font-medium text-foreground">{n.title}</span>
                  </div>
                  <p className="text-muted-foreground">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {reconciliations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial de conciliación</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {reconciliations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.run_date}</span>
                  <span className="tabular-nums text-muted-foreground">
                    Coinbase: {r.coinbase_fill_count ?? "--"} · BD: {r.db_fill_count ?? "--"}
                  </span>
                  <Badge variant={r.resolved ? "positive" : "warning"}>
                    {r.resolved ? "resuelto" : "pendiente"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
