import { Target } from "lucide-react";

import { FilterBar } from "@/components/dashboard/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateStrategyForm } from "@/components/strategies/create-strategy-form";
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
          description="Cómo rinde cada setup: profit factor, expectativa, drawdown y tamaño de muestra."
        />
        <EmptyState
          icon={Target}
          title="Todavía no hay estrategias"
          description="Crea una y asígnala a tus operaciones desde el diario de cada una. Aquí verás su rendimiento comparado, avisando cuando una conclusión se base en muy pocas operaciones."
          action={<CreateStrategyForm />}
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
        description="Cómo rinde cada setup: profit factor, expectativa, drawdown y tamaño de muestra."
        action={<CreateStrategyForm />}
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
