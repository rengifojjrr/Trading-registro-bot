import { LayoutDashboard, SearchX } from "lucide-react";
import { DateTime } from "luxon";

import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { EquityCurveChart } from "@/components/dashboard/equity-curve-chart";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { OpenPositionsPanel } from "@/components/dashboard/open-positions-panel";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseTradeFilters, pickSearchParam } from "@/lib/analytics/filter-params";
import { fetchAccounts, fetchOpenLivePositions, fetchTradesForStats } from "@/lib/analytics/queries";
import { computeDailyPnl, computeEquityCurve, computeStats } from "@/lib/analytics/stats";
import { requireUser } from "@/lib/auth/require-user";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage(props: PageProps<"/">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ count: totalTradeCount }, { data: settings }, accounts, openPositions] = await Promise.all([
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    fetchOpenLivePositions(),
  ]);

  if (!totalTradeCount) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Capital, rendimiento y estadísticas de tus operaciones de futuros de Bitcoin."
        />
        <EmptyState
          icon={LayoutDashboard}
          title="Todavía no hay operaciones que analizar"
          description="Conecta Coinbase Advanced o importa un histórico en CSV para que el motor de reconstrucción genere tus primeras operaciones. Las métricas de este panel (P&L, win rate, profit factor, curva de capital, calendario diario, rendimiento por sesión) se calculan a partir de operaciones reales -- no se muestran cifras de ejemplo aquí."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);

  const trades = await fetchTradesForStats(filters);
  const stats = computeStats(trades);
  const equityCurve = computeEquityCurve(trades);
  const dailyPnl = computeDailyPnl(trades, (iso) =>
    DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone).toFormat("yyyy-LL-dd"),
  );

  const month = pickSearchParam(searchParams.month) ?? DateTime.now().setZone(timezone).toFormat("yyyy-LL");
  const buildMonthHref = (targetMonth: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "month" || typeof value !== "string" || value.length === 0) continue;
      params.set(key, value);
    }
    params.set("month", targetMonth);
    return `?${params.toString()}`;
  };

  const streakLabel =
    stats.currentStreak.type === "NONE"
      ? "--"
      : `${stats.currentStreak.count} ${stats.currentStreak.type === "WIN" ? "ganadora(s)" : "perdedora(s)"}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Capital, rendimiento y estadísticas de tus operaciones de futuros de Bitcoin."
      />

      <OpenPositionsPanel positions={openPositions} />

      <FilterBar accounts={accounts} />

      {trades.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ningún trade coincide con estos filtros"
          description="Ajusta o limpia los filtros para ver tus operaciones y estadísticas."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="P&L neto"
              value={formatSignedMoney(stats.netPnl)}
              tone={pnlTone(stats.netPnl)}
              description="Ganancia o pérdida de las operaciones cerradas en el período filtrado, después de comisiones."
            />
            <StatTile
              label="P&L bruto"
              value={formatSignedMoney(stats.grossPnl)}
              tone={pnlTone(stats.grossPnl)}
              description="Ganancia o pérdida de las operaciones cerradas antes de comisiones."
            />
            <StatTile
              label="Comisiones"
              value={formatMoney(stats.totalCommissions)}
              description="Suma de comisiones de entrada y salida de todas las operaciones del período filtrado (abiertas y cerradas)."
            />
            <StatTile
              label="Win rate"
              value={stats.winRate === null ? "--" : formatPercent(stats.winRate)}
              sub={`${stats.wins}/${stats.closedTradesCount} cerradas`}
              description="Porcentaje de operaciones cerradas con P&L neto positivo sobre el total de cerradas. Las operaciones en punto de equilibrio no cuentan como ganadas."
            />
            <StatTile
              label="Profit factor"
              value={stats.profitFactor === null ? "--" : formatNumber(stats.profitFactor)}
              tone={stats.profitFactor === null ? "neutral" : stats.profitFactor >= 1 ? "positive" : "negative"}
              description="Suma de ganancias netas dividida entre el valor absoluto de la suma de pérdidas netas. Sin operaciones perdedoras, no está definido."
            />
            <StatTile
              label="Expectancy"
              value={stats.expectancy === null ? "--" : formatSignedMoney(stats.expectancy)}
              tone={pnlTone(stats.expectancy)}
              description="P&L neto promedio por operación cerrada."
            />
            <StatTile
              label="Drawdown máximo"
              value={stats.maxDrawdown === "0" ? formatMoney("0") : `-${formatMoney(stats.maxDrawdown)}`}
              tone={stats.maxDrawdown === "0" ? "neutral" : "negative"}
              description="Mayor caída desde un máximo hasta un mínimo posterior en la curva de capital acumulada del período filtrado."
            />
            <StatTile
              label="Operaciones"
              value={stats.tradesCount}
              sub={`${stats.openTradesCount} abiertas · ${stats.closedTradesCount} cerradas`}
              description="Total de operaciones reconstruidas en el período filtrado."
            />
            <StatTile
              label="Mejor operación"
              value={stats.bestTrade ? formatSignedMoney(stats.bestTrade.netPnl) : "--"}
              tone={stats.bestTrade ? pnlTone(stats.bestTrade.netPnl) : "neutral"}
              description="Operación cerrada con el mayor P&L neto del período filtrado."
            />
            <StatTile
              label="Peor operación"
              value={stats.worstTrade ? formatSignedMoney(stats.worstTrade.netPnl) : "--"}
              tone={stats.worstTrade ? pnlTone(stats.worstTrade.netPnl) : "neutral"}
              description="Operación cerrada con el menor P&L neto del período filtrado."
            />
            <StatTile
              label="Racha actual"
              value={streakLabel}
              tone={
                stats.currentStreak.type === "WIN"
                  ? "positive"
                  : stats.currentStreak.type === "LOSS"
                    ? "negative"
                    : "neutral"
              }
              description="Operaciones ganadoras o perdedoras consecutivas más recientes, terminando en la última operación cerrada."
            />
            <StatTile
              label="Rachas máximas"
              value={`${stats.longestWinStreak}G · ${stats.longestLossStreak}P`}
              description="Racha ganadora y racha perdedora más largas del período filtrado."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Curva de capital</CardTitle>
              </CardHeader>
              <CardContent>
                {equityCurve.length > 0 ? (
                  <EquityCurveChart points={equityCurve} timezone={timezone} />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Sin operaciones cerradas todavía en este período.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Calendario de P&L diario</CardTitle>
              </CardHeader>
              <CardContent>
                <CalendarHeatmap month={month} daily={dailyPnl} buildMonthHref={buildMonthHref} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
