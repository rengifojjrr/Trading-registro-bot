import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { VerificationList, type VerifiableTrade } from "@/components/validation/verification-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { evaluateValidationGate, REQUIRED_VERIFICATIONS } from "@/lib/validation/gate";
import { cn } from "@/lib/utils";

/**
 * The manual check that gates automatic syncing.
 *
 * Everything else in this app is built on the assumption that the
 * reconstruction engine turns Coinbase's fills into the right trades.
 * Automated tests prove the code does what the code says; this proves what
 * the code says matches the real account. Until it passes, the cron job
 * deliberately skips this account (see api/cron/sync).
 */
export default async function ValidationPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: trades }, { data: verifications }, { count: closedCount }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("timezone, auto_sync_enabled")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("trades")
        .select(
          "id, product_id, direction, opened_at, closed_at, max_size, entry_wap, exit_wap, total_commissions, net_pnl, entries_count, exits_count",
        )
        .eq("user_id", user.id)
        .eq("status", "CLOSED")
        .eq("source", "COINBASE_SYNC")
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase.from("trade_verifications").select("trade_id, matches, note").eq("user_id", user.id),
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "CLOSED"),
    ]);

  const timezone = settings?.timezone || "UTC";
  const verificationByTradeId = new Map((verifications ?? []).map((v) => [v.trade_id, v]));
  const rows = verifications ?? [];

  const gate = evaluateValidationGate({
    matching: rows.filter((v) => v.matches).length,
    mismatching: rows.filter((v) => !v.matches).length,
    available: closedCount ?? 0,
  });

  const verifiableTrades: VerifiableTrade[] = (trades ?? []).map((t) => {
    const v = verificationByTradeId.get(t.id);
    return {
      id: t.id,
      productId: t.product_id,
      direction: t.direction,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
      maxSize: t.max_size,
      entryWap: t.entry_wap,
      exitWap: t.exit_wap,
      totalCommissions: t.total_commissions,
      netPnl: t.net_pnl,
      fillCount: t.entries_count + t.exits_count,
      verification: v ? { matches: v.matches, note: v.note } : null,
    };
  });

  // Unreviewed first: that's the work that remains.
  verifiableTrades.sort((a, b) => Number(Boolean(a.verification)) - Number(Boolean(b.verification)));

  const matching = rows.filter((v) => v.matches).length;
  const mismatching = rows.filter((v) => !v.matches).length;

  return (
    <>
      <PageHeader
        title="Validación"
        description="Compara lo que calculó la app contra tu historial real de Coinbase, antes de confiar en la sincronización automática."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-foreground">
            Progreso de la revisión
            <InfoHint label="Progreso de la revisión">
              Se piden {REQUIRED_VERIFICATIONS} operaciones revisadas sin ninguna diferencia. No es burocracia:
              es la única forma de detectar un error sistemático en el cálculo, que los tests automáticos no
              pueden ver porque comprueban que el código haga lo que el código dice.
            </InfoHint>
          </CardTitle>
          <CardDescription>
            {settings?.auto_sync_enabled
              ? "La sincronización automática ya está activa."
              : "La sincronización automática está desactivada hasta completar esto."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold tabular-nums">
              {matching}/{REQUIRED_VERIFICATIONS}
            </span>
            {mismatching > 0 ? <Badge variant="negative">{mismatching} con diferencias</Badge> : null}
            {gate.canEnable ? <Badge variant="positive">Listo para activar</Badge> : null}
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full transition-all", mismatching > 0 ? "bg-negative" : "bg-positive")}
              style={{ width: `${gate.progressPct.toFixed(1)}%` }}
            />
          </div>

          {gate.blockedReason ? (
            <p className="text-sm text-muted-foreground">{gate.blockedReason}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Puedes activar la sincronización automática desde Configuración → General.
            </p>
          )}
        </CardContent>
      </Card>

      {verifiableTrades.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin operaciones cerradas que revisar"
          description="Cuando haya operaciones cerradas sincronizadas desde Coinbase, aparecerán aquí para compararlas una a una."
        />
      ) : (
        <VerificationList trades={verifiableTrades} timezone={timezone} />
      )}
    </>
  );
}
