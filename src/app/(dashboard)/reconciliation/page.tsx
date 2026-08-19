import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DiscrepancyList, type DiscrepancyRow } from "@/components/reconciliation/discrepancy-list";
import { ReReadButton } from "@/components/reconciliation/re-read-button";
import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * What Coinbase says versus what this app recorded.
 *
 * The nightly reconciliation has been writing discrepancies since the sync
 * engine was built, but there was nowhere to read them: they only surfaced
 * as a one-line notification saying a number existed. This is the page that
 * makes the app's central claim -- that its history matches the exchange's
 * -- something you can actually check rather than take on faith.
 */
export default async function ReconciliationPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: runs }, { data: discrepancies }] = await Promise.all([
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("reconciliation_runs")
      .select("id, run_date, status, window_start, window_end, coinbase_fill_count, db_fill_count, resolved, finished_at")
      .eq("user_id", user.id)
      .order("run_date", { ascending: false })
      .limit(30),
    supabase
      .from("reconciliation_discrepancies")
      .select("id, discrepancy_type, entity_type, entity_id, expected, actual, resolved_at, resolution_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const timezone = settings?.timezone || "UTC";
  const runRows = runs ?? [];
  const discrepancyRows = (discrepancies ?? []) as DiscrepancyRow[];
  const open = discrepancyRows.filter((d) => !d.resolved_at);

  const lastRun = runRows[0];
  const totalCoinbase = runRows.reduce((sum, r) => sum + (r.coinbase_fill_count ?? 0), 0);
  const totalDb = runRows.reduce((sum, r) => sum + (r.db_fill_count ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Conciliación"
        description="Compara, ejecución por ejecución, lo que Coinbase reporta contra lo que esta aplicación tiene registrado."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Estado
            <InfoHint label="Conciliación">
              Cada noche se vuelve a pedir a Coinbase la lista de ejecuciones de una ventana reciente y se
              compara contra lo guardado. Una diferencia no se corrige sola: se registra para que la
              resuelvas tú, porque decidir cuál de las dos versiones es la buena no es algo que deba
              hacer un proceso automático.
            </InfoHint>
          </CardTitle>
          <CardDescription>
            {lastRun
              ? `Última conciliación: ${formatDateTime(lastRun.finished_at ?? lastRun.window_end, timezone)}`
              : "Todavía no se ha ejecutado ninguna conciliación."}
          </CardDescription>
          {/*
            Pedirla a mano es lo único que recupera un fill que llegó tarde:
            la sincronización normal sólo mira hacia adelante desde su
            marcador, y lo que quede detrás no lo vuelve a pedir nunca.
          */}
          <ReReadButton />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Figure label="Fills según Coinbase" value={totalCoinbase} />
          <Figure label="Fills registrados" value={totalDb} />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Diferencias abiertas</span>
            <span className="text-lg font-semibold tabular-nums">
              {open.length > 0 ? (
                <Badge variant="negative">{open.length}</Badge>
              ) : (
                <Badge variant="positive">Ninguna</Badge>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {discrepancyRows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin diferencias registradas"
          description="Cuando la conciliación nocturna encuentre una ejecución que Coinbase reporta y la app no tiene (o al revés), aparecerá aquí con los dos valores para comparar."
        />
      ) : (
        <DiscrepancyList rows={discrepancyRows} timezone={timezone} />
      )}

      {runRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial de ejecuciones</CardTitle>
            <CardDescription>Las últimas {runRows.length} conciliaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {runRows.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="tabular-nums">{run.run_date}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(run.window_start, timezone)} → {formatDateTime(run.window_end, timezone)}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    Coinbase {run.coinbase_fill_count ?? "--"} · App {run.db_fill_count ?? "--"}
                  </span>
                  <Badge variant={run.status === "SUCCESS" ? "positive" : run.status === "FAILED" ? "negative" : "warning"}>
                    {run.status === "SUCCESS" ? "Correcta" : run.status === "FAILED" ? "Falló" : "En curso"}
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

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
