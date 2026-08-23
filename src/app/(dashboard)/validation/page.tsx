import { ShieldAlert, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { VerificationList, type VerifiableTrade } from "@/components/validation/verification-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { readGateEvidence } from "@/lib/validation/evidence";
import { evaluateValidationGate } from "@/lib/validation/gate";
import { cn } from "@/lib/utils";

/**
 * The manual check that gates automatic syncing.
 *
 * Everything else in this app is built on the assumption that the
 * reconstruction engine turns Coinbase's fills into the right trades.
 * Automated tests prove the code does what the code says; this proves what
 * the code says matches the real account. Ya no bloquea nada: la puerta de la
 * sincronización automática se decide con las comprobaciones que la propia
 * aplicación rehace en cada pasada (ver lib/validation/gate.ts). Revisar a
 * mano sigue detectando errores de criterio que ninguna máquina ve.
 */
export default async function ValidationPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: trades }, { data: verifications }] = await Promise.all([
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
        .is("orphaned_at", null)
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase.from("trade_verifications").select("trade_id, matches, note").eq("user_id", user.id),
    ]);

  const timezone = settings?.timezone || "UTC";
  const verificationByTradeId = new Map((verifications ?? []).map((v) => [v.trade_id, v]));
  const rows = verifications ?? [];

  const gate = evaluateValidationGate(await readGateEvidence(user.id));

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
            ¿Se puede confiar en las cifras?
            <InfoHint label="Cómo se decide">
              Antes esto pedía veinte operaciones revisadas a mano. La intención era buena y el efecto fue
              el contrario: nadie tecleó veinte revisiones, la puerta nunca se abrió, la conciliación diaria
              nunca corrió, y la app pasó ocho días enseñando una posición que no existía. Ahora la decisión
              sale de pruebas que la propia app rehace en cada sincronización, así que la puerta también se
              vuelve a cerrar sola si algo deja de cuadrar.
            </InfoHint>
          </CardTitle>
          <CardDescription>
            {settings?.auto_sync_enabled
              ? "La sincronización automática está activa."
              : gate.canEnable
                ? "Todo cuadra. Puedes activar la sincronización automática desde Configuración → General."
                : "La sincronización automática está desactivada hasta que todo esto cuadre."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {gate.checks.map((check) => (
            <div key={check.label} className="flex items-start gap-2">
              {check.passed ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
              )}
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-sm font-medium",
                    check.passed ? "text-foreground" : "text-negative",
                  )}
                >
                  {check.label}
                </span>
                <span className="text-xs text-muted-foreground">{check.detail}</span>
              </div>
            </div>
          ))}

          {mismatching > 0 ? (
            <Badge variant="negative" className="self-start">
              {mismatching} revisión(es) con diferencias
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revisar a mano</CardTitle>
          <CardDescription>
            Ya no hace falta para activar nada, y sigue mereciendo la pena: comparar una operación contra
            Coinbase con tus propios ojos detecta errores de criterio que ninguna comprobación automática
            sabe ver. Llevas {matching} revisada(s).
          </CardDescription>
        </CardHeader>
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
