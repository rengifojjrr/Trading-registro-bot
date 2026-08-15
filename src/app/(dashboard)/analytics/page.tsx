import { BarChart3 } from "lucide-react";

import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { ExcursionPanel } from "@/components/analytics/excursion-panel";
import { RDistributionChart } from "@/components/analytics/r-distribution";
import { SavedViews } from "@/components/dashboard/saved-views";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  computeHourBreakdown,
  computeRDistribution,
  computeSessionBreakdown,
  computeWeekdayBreakdown,
  summarizeExcursions,
} from "@/lib/analytics/breakdowns";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import {
  fetchAccounts,
  fetchDistinctProductIds,
  fetchExcursions,
  fetchFilterOptions,
  fetchTradesForBreakdown,
} from "@/lib/analytics/queries";
import { fetchSavedViews } from "@/lib/analytics/saved-views";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * The "where does my money actually come from / go?" page. Everything here
 * slices the same filtered trade set the dashboard uses, so a filter set
 * on either page means the same thing on both.
 */
export default async function AnalyticsPage(props: PageProps<"/analytics">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ count: totalTradeCount }, { data: settings }, accounts, products, filterOptions] = await Promise.all([
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    fetchDistinctProductIds(),
    fetchFilterOptions(),
  ]);

  if (!totalTradeCount) {
    return (
      <>
        <PageHeader title="Análisis" description="Dónde ganas y dónde pierdes, por sesión, día y hora." />
        <EmptyState
          icon={BarChart3}
          title="Sin operaciones que analizar todavía"
          description="Cuando tengas operaciones sincronizadas, aquí verás en qué sesiones, días y horas rinde mejor tu operativa."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);

  const [trades, { excursions, totalClosed }] = await Promise.all([
    fetchTradesForBreakdown(filters),
    fetchExcursions(filters),
  ]);

  // Every open account shares one currency in practice; falling back to USD
  // matches the accounts table default rather than assuming.
  const currency = accounts[0]?.currency ?? "USD";

  const sessions = computeSessionBreakdown(trades);
  const weekdays = computeWeekdayBreakdown(trades, timezone);
  const hours = computeHourBreakdown(trades, timezone);
  const rDistribution = computeRDistribution(trades);
  const excursionSummary = summarizeExcursions(excursions);

  return (
    <>
      <PageHeader title="Análisis" description="Dónde ganas y dónde pierdes, por sesión, día y hora." />
      <FilterBar
        accounts={accounts}
        products={products}
        strategies={filterOptions.strategies}
        tags={filterOptions.tags}
      />

      <SavedViews views={await fetchSavedViews("/analytics")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Por sesión"
          description="En qué sesión del mercado te va mejor."
          buckets={sessions}
          currency={currency}
        />
        <BreakdownTable
          title="Por día de la semana"
          description={`Calculado en tu zona horaria (${timezone}).`}
          buckets={weekdays}
          currency={currency}
        />
      </div>

      <BreakdownTable
        title="Por hora de apertura"
        description={`A qué hora sueles abrir tus mejores y peores operaciones (${timezone}).`}
        buckets={hours}
        currency={currency}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RDistributionChart distribution={rDistribution} />
        <ExcursionPanel summary={excursionSummary} totalClosed={totalClosed} currency={currency} />
      </div>
    </>
  );
}
