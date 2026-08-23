import { LayoutDashboard, SearchX } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

import { CalendarHeatmap } from "@/components/dashboard/calendar-heatmap";
import { EquityCurveChart } from "@/components/dashboard/equity-curve-chart";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { OpenPositionsPanel } from "@/components/dashboard/open-positions-panel";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseTradeFilters, pickSearchParam, previousPeriodFilters } from "@/lib/analytics/filter-params";
import { fetchAccounts, fetchDistinctProductIds, fetchFilterOptions, fetchOpenLivePositions, fetchTradesForStats } from "@/lib/analytics/queries";
import { computeDailyPnl, computeEquityCurve, computeStats } from "@/lib/analytics/stats";
import { requireUser } from "@/lib/auth/require-user";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { readSyncStatus } from "@/lib/sync/read-status";
import { createClient } from "@/lib/supabase/server";

export default async function TradingDashboardPage(props: PageProps<"/trading">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ count: totalTradeCount }, { data: settings }, accounts, products, openPositions, filterOptions] =
    await Promise.all([
      supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("orphaned_at", null),
      supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
      fetchAccounts(),
      fetchDistinctProductIds(),
      fetchOpenLivePositions(),
      fetchFilterOptions(),
    ]);

  if (!totalTradeCount) {
    return (
      <>
        <PageHeader
          title="Trading"
          description="Capital, rendimiento y estadísticas de tus operaciones de futuros de Bitcoin."
        />
        <EmptyState
          icon={LayoutDashboard}
          title="Todavía no hay operaciones que analizar"
          description="Conecta tu cuenta de Coinbase para que se importen tus operaciones. Todo lo que ves aquí se calcula con datos reales -- nunca se muestran cifras de ejemplo."
          action={
            <Button asChild size="sm">
              <Link href="/settings">Ir a Configuración</Link>
            </Button>
          }
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  // Amounts are shown in the account's own currency rather than a hardcoded
  // USD, falling back to the accounts-table default when unset.
  const currency = accounts[0]?.currency ?? "USD";
  const filters = parseTradeFilters(searchParams, timezone);

  const trades = await fetchTradesForStats(filters);
  const stats = computeStats(trades);

  // Only meaningful when the user picked an explicit date range -- an
  // open-ended "everything ever" view has no previous period to compare
  // against, so the KPI simply omits the comparison rather than inventing
  // one.
  const previousFilters = previousPeriodFilters(filters);
  const previousStats = previousFilters ? computeStats(await fetchTradesForStats(previousFilters)) : null;
  const netPnlDelta =
    previousStats && Number(previousStats.netPnl) !== 0
      ? ((Number(stats.netPnl) - Number(previousStats.netPnl)) / Math.abs(Number(previousStats.netPnl))) * 100
      : null;
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

  /**
   * The same filters that produced these figures, pointed at the trades
   * list. A KPI you can open and count yourself is a very different thing
   * from one you have to take on faith -- which matters more here than in
   * most dashboards, because these are the numbers the whole app exists to
   * be trusted on.
   */
  const tradesHref = (extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "month" || key === "page" || typeof value !== "string" || value.length === 0) continue;
      params.set(key, value);
    }
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const query = params.toString();
    return query ? `/trades?${query}` : "/trades";
  };

  const streakLabel =
    stats.currentStreak.type === "NONE"
      ? "--"
      : `${stats.currentStreak.count} ${stats.currentStreak.type === "WIN" ? "ganadora(s)" : "perdedora(s)"}`;

  return (
    <>
      <PageHeader
        title="Trading"
        description="Capital, rendimiento y estadísticas de tus operaciones de futuros de Bitcoin."
      />

      {/* Encima de las posiciones, no debajo: si los datos son de hace cinco
          días -- o si falta un fill, o si la posición no cuadra con Coinbase --
          eso hay que leerlo antes que las cifras que matiza. */}
      <SyncStatusBar status={await readSyncStatus(user.id)} />

      <OpenPositionsPanel positions={openPositions} />

      <FilterBar
        accounts={accounts}
        products={products}
        strategies={filterOptions.strategies}
        tags={filterOptions.tags}
      />

      {trades.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ningún trade coincide con estos filtros"
          description="Ajusta o limpia los filtros para ver tus operaciones y estadísticas."
        />
      ) : (
        <>
          {/* The four numbers that answer "how am I doing?" -- deliberately
              larger and alone on their row. Everything else is supporting
              detail and lives behind the fold below, so the headline figures
              aren't competing with eight tiles of equal weight. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              size="lg"
              label="P&L neto"
              value={formatSignedMoney(stats.netPnl, { currency })}
              tone={pnlTone(stats.netPnl)}
              sub={
                netPnlDelta !== null
                  ? `${netPnlDelta >= 0 ? "+" : ""}${netPnlDelta.toFixed(0)}% vs. período anterior`
                  : undefined
              }
              description="Ganancia o pérdida de las operaciones cerradas en el período filtrado, después de comisiones. La comparación aparece solo cuando eliges un rango de fechas concreto."
              provenanceHref={tradesHref({ sort: "net_pnl", dir: "desc" })}
              provenanceLabel={`Ver las ${stats.closedTradesCount} operaciones`}
            />
            <StatTile
              size="lg"
              label="Win rate"
              value={stats.winRate === null ? "--" : formatPercent(stats.winRate)}
              sub={`${stats.wins}/${stats.closedTradesCount} cerradas`}
              description="Porcentaje de operaciones cerradas con P&L neto positivo sobre el total de cerradas. Las operaciones en punto de equilibrio no cuentan como ganadas."
              provenanceHref={tradesHref({ sort: "net_pnl", dir: "desc" })}
              provenanceLabel="Ver cuáles ganaron"
            />
            <StatTile
              size="lg"
              label="Profit factor"
              value={stats.profitFactor === null ? "--" : formatNumber(stats.profitFactor)}
              tone={stats.profitFactor === null ? "neutral" : stats.profitFactor >= 1 ? "positive" : "negative"}
              description="Suma de ganancias netas dividida entre el valor absoluto de la suma de pérdidas netas. Por encima de 1 ganas más de lo que pierdes. Sin operaciones perdedoras, no está definido."
              provenanceHref={tradesHref({ sort: "net_pnl", dir: "asc" })}
              provenanceLabel="Ver las pérdidas"
            />
            <StatTile
              size="lg"
              label="Drawdown máximo"
              value={stats.maxDrawdown === "0" ? formatMoney("0", { currency }) : `-${formatMoney(stats.maxDrawdown, { currency })}`}
              tone={stats.maxDrawdown === "0" ? "neutral" : "negative"}
              description="Mayor caída desde un máximo hasta un mínimo posterior en la curva de capital acumulada del período filtrado."
              provenanceHref={tradesHref({ sort: "opened_at", dir: "asc" })}
              provenanceLabel="Ver la secuencia completa"
            />
          </div>

          <CollapsibleSection title="Más estadísticas" subtitle="Comisiones, rachas, mejores y peores operaciones">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="P&L bruto"
                value={formatSignedMoney(stats.grossPnl, { currency })}
                tone={pnlTone(stats.grossPnl)}
                description="Ganancia o pérdida de las operaciones cerradas antes de comisiones."
              />
              <StatTile
                label="Comisiones"
                value={formatMoney(stats.totalCommissions, { currency })}
                description="Suma de comisiones de entrada y salida de todas las operaciones del período filtrado (abiertas y cerradas)."
              />
              <StatTile
                label="Expectancy"
                value={stats.expectancy === null ? "--" : formatSignedMoney(stats.expectancy, { currency })}
                tone={pnlTone(stats.expectancy)}
                description="P&L neto promedio por operación cerrada. Es lo que, en promedio, deja cada operación."
              />
              <StatTile
                label="Operaciones"
                value={stats.tradesCount}
                sub={`${stats.openTradesCount} abiertas · ${stats.closedTradesCount} cerradas`}
                description="Total de operaciones reconstruidas en el período filtrado."
              />
              <StatTile
                label="Mejor operación"
                value={stats.bestTrade ? formatSignedMoney(stats.bestTrade.netPnl, { currency }) : "--"}
                tone={stats.bestTrade ? pnlTone(stats.bestTrade.netPnl) : "neutral"}
                description="Operación cerrada con el mayor P&L neto del período filtrado."
              />
              <StatTile
                label="Peor operación"
                value={stats.worstTrade ? formatSignedMoney(stats.worstTrade.netPnl, { currency }) : "--"}
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
          </CollapsibleSection>

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
