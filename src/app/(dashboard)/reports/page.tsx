import { FileText } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSessionBreakdown, computeWeekdayBreakdown } from "@/lib/analytics/breakdowns";
import { fetchAccounts, fetchTradesForBreakdown, fetchTradesForStats } from "@/lib/analytics/queries";
import { computeStats } from "@/lib/analytics/stats";
import { requireUser } from "@/lib/auth/require-user";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Month-end review. Previously a placeholder promising a report "at the
 * close of the first month"; nothing generated one, so it never appeared.
 * This computes it on demand from the same functions the dashboard uses,
 * which also means it can never disagree with the dashboard for the same
 * period -- a real risk with a separately-cached report table.
 */
export default async function ReportsPage(props: PageProps<"/reports">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ data: settings }, accounts, { data: firstTrade }] = await Promise.all([
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    supabase
      .from("trades")
      .select("opened_at")
      .eq("user_id", user.id)
      .order("opened_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!firstTrade) {
    return (
      <>
        <PageHeader title="Reportes mensuales" description="Cómo cerró cada mes." />
        <EmptyState
          icon={FileText}
          title="Sin operaciones todavía"
          description="El primer reporte aparecerá en cuanto tengas operaciones sincronizadas."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const currency = accounts[0]?.currency ?? "USD";
  const now = DateTime.now().setZone(timezone);

  const requested = typeof searchParams.month === "string" ? searchParams.month : null;
  const month = requested && DateTime.fromFormat(requested, "yyyy-LL", { zone: timezone }).isValid
    ? DateTime.fromFormat(requested, "yyyy-LL", { zone: timezone })
    : now.startOf("month");

  const monthStart = month.startOf("month");
  const monthEnd = month.endOf("month");
  const previousStart = monthStart.minus({ months: 1 });

  const rangeFor = (start: DateTime, end: DateTime) => ({
    dateFrom: start.toUTC().toISO() ?? undefined,
    dateTo: end.toUTC().toISO() ?? undefined,
  });

  const [trades, previousTrades, breakdownTrades] = await Promise.all([
    fetchTradesForStats(rangeFor(monthStart, monthEnd)),
    fetchTradesForStats(rangeFor(previousStart, previousStart.endOf("month"))),
    fetchTradesForBreakdown(rangeFor(monthStart, monthEnd)),
  ]);

  const stats = computeStats(trades);
  const previousStats = computeStats(previousTrades);
  const delta = Number(stats.netPnl) - Number(previousStats.netPnl);

  // The month the user's history actually starts, so navigation can't walk
  // backwards forever into empty months.
  const earliestMonth = DateTime.fromISO(firstTrade.opened_at, { zone: "utc" }).setZone(timezone).startOf("month");
  const canGoBack = monthStart > earliestMonth;
  const canGoForward = monthStart < now.startOf("month");

  const monthLabel = monthStart.setLocale("es").toFormat("LLLL yyyy");

  return (
    <>
      <PageHeader
        title="Reportes mensuales"
        description="Cómo cerró cada mes, comparado con el anterior."
      />

      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-5">
          {/* A `disabled` attribute does nothing on an anchor, so an
              unavailable month renders as a real disabled button rather
              than a link that still navigates. */}
          <MonthNavButton
            href={canGoBack ? `?month=${monthStart.minus({ months: 1 }).toFormat("yyyy-LL")}` : null}
            label="← Anterior"
          />
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <MonthNavButton
            href={canGoForward ? `?month=${monthStart.plus({ months: 1 }).toFormat("yyyy-LL")}` : null}
            label="Siguiente →"
          />
        </CardContent>
      </Card>

      {stats.tradesCount === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin operaciones este mes"
          description="Usa las flechas para revisar otro mes."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              size="lg"
              label="P&L neto del mes"
              value={formatSignedMoney(stats.netPnl, { currency })}
              tone={pnlTone(stats.netPnl)}
              sub={
                previousStats.tradesCount > 0
                  ? `${delta >= 0 ? "+" : ""}${formatMoney(String(delta), { currency })} vs. mes anterior`
                  : "Sin mes anterior con el que comparar"
              }
              description="Resultado de las operaciones cerradas dentro del mes, después de comisiones."
            />
            <StatTile
              size="lg"
              label="Operaciones"
              value={stats.tradesCount}
              sub={`${stats.closedTradesCount} cerradas`}
              description="Operaciones abiertas dentro de este mes."
            />
            <StatTile
              size="lg"
              label="Win rate"
              value={stats.winRate === null ? "--" : formatPercent(stats.winRate)}
              description="Porcentaje de operaciones cerradas con resultado positivo."
            />
            <StatTile
              size="lg"
              label="Profit factor"
              value={stats.profitFactor === null ? "--" : formatNumber(stats.profitFactor)}
              tone={stats.profitFactor === null ? "neutral" : stats.profitFactor >= 1 ? "positive" : "negative"}
              description="Ganancias divididas entre pérdidas. Por encima de 1 ganas más de lo que pierdes."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-foreground">
                Resumen del mes
                <InfoHint label="Resumen del mes">
                  Se calcula en el momento con las mismas funciones que el dashboard, así que nunca puede
                  contradecirlo para el mismo período.
                </InfoHint>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col divide-y divide-border text-sm">
                <Row label="P&L bruto" value={formatSignedMoney(stats.grossPnl, { currency })} />
                <Row label="Comisiones pagadas" value={formatMoney(stats.totalCommissions, { currency })} />
                <Row
                  label="Mejor operación"
                  value={stats.bestTrade ? formatSignedMoney(stats.bestTrade.netPnl, { currency }) : "--"}
                />
                <Row
                  label="Peor operación"
                  value={stats.worstTrade ? formatSignedMoney(stats.worstTrade.netPnl, { currency }) : "--"}
                />
                <Row label="Drawdown máximo" value={formatMoney(stats.maxDrawdown, { currency })} />
                <Row
                  label="Racha más larga"
                  value={`${stats.longestWinStreak} ganadoras · ${stats.longestLossStreak} perdedoras`}
                />
              </dl>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownTable
              title="Por sesión"
              buckets={computeSessionBreakdown(breakdownTrades)}
              currency={currency}
            />
            <BreakdownTable
              title="Por día de la semana"
              buckets={computeWeekdayBreakdown(breakdownTrades, timezone)}
              currency={currency}
            />
          </div>
        </>
      )}
    </>
  );
}

function MonthNavButton({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
