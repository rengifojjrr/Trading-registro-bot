import { Target } from "lucide-react";

import { FilterBar } from "@/components/dashboard/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateStrategyForm } from "@/components/strategies/create-strategy-form";
import { StrategyManager } from "@/components/strategies/strategy-manager";
import { StrategyPerformanceCard } from "@/components/strategies/strategy-performance-card";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { computeStrategyPerformance } from "@/lib/analytics/strategy-report";
import { fetchAccounts, fetchDistinctProductIds, fetchFilterOptions, fetchTradesForStrategyReport } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function StrategiesPage(props: PageProps<"/strategies">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  // All strategies (including archived ones) for the manager below; the
  // performance report itself only compares the active ones.
  const [{ data: allStrategies }, { data: settings }, accounts, products, filterOptions] = await Promise.all([
    supabase
      .from("strategies")
      .select("id, name, description, is_active")
      .order("name", { ascending: true }),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    fetchDistinctProductIds(),
    fetchFilterOptions(),
  ]);

  const { data: playbookItems } = await supabase
    .from("playbook_items")
    .select("id, strategy_id, label")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const strategies = (allStrategies ?? []).filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }));

  if (strategies.length === 0) {
    return (
      <>
        <PageHeader
          title="Estrategias"
          description="Cómo rinde cada setup: profit factor, expectativa, drawdown y tamaño de muestra."
        />
        <EmptyState
          icon={Target}
          title="Todavía no hay estrategias"
          description="Crea una y asígnala a tus operaciones desde el diario de cada una. Aquí verás su rendimiento comparado, avisando cuando una conclusión se base en muy pocas operaciones."
          action={<CreateStrategyForm />}
        />
        <StrategyManager strategies={allStrategies ?? []} playbookItems={playbookItems ?? []} />
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
        description="Cómo rinde cada setup: profit factor, expectativa, drawdown y tamaño de muestra."
        action={<CreateStrategyForm />}
      />
      <FilterBar
        accounts={accounts}
        products={products}
        strategies={filterOptions.strategies}
        tags={filterOptions.tags}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {performance.map((p) => (
          <StrategyPerformanceCard key={p.strategyId ?? "none"} performance={p} />
        ))}
      </div>
      <StrategyManager strategies={allStrategies ?? []} playbookItems={playbookItems ?? []} />
    </>
  );
}
