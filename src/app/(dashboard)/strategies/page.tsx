import { Target } from "lucide-react";

import { FilterBar } from "@/components/dashboard/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StrategyPerformanceCard } from "@/components/strategies/strategy-performance-card";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { computeStrategyPerformance } from "@/lib/analytics/strategy-report";
import { fetchAccounts, fetchDistinctProductIds, fetchTradesForStrategyReport } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function StrategiesPage(props: PageProps<"/strategies">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ data: strategies }, { data: settings }, accounts, products] = await Promise.all([
    supabase.from("strategies").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    fetchDistinctProductIds(),
  ]);

  if (!strategies || strategies.length === 0) {
    return (
      <>
        <PageHeader
          title="Estrategias"
          description="Reglas de cada setup y su rendimiento comparado: profit factor, expectativa, drawdown, R promedio y tamaño de muestra."
        />
        <EmptyState
          icon={Target}
          title="Todavía no hay estrategias definidas"
          description="Cuando definas una estrategia y la asignes a tus operaciones, esta sección mostrará su rendimiento -- y advertirá visualmente cuando una conclusión se base en muy pocas operaciones. Ninguna estrategia se declarará rentable solo por win rate o por una muestra pequeña."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);
  const trades = await fetchTradesForStrategyReport(filters);
  const performance = computeStrategyPerformance(trades, strategies);

  return (
    <>
      <PageHeader
        title="Estrategias"
        description="Reglas de cada setup y su rendimiento comparado: profit factor, expectativa, drawdown y tamaño de muestra."
      />
      <FilterBar accounts={accounts} products={products} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {performance.map((p) => (
          <StrategyPerformanceCard key={p.strategyId ?? "none"} performance={p} />
        ))}
      </div>
    </>
  );
}
