import { ListOrdered, SearchX } from "lucide-react";

import { SavedViews } from "@/components/dashboard/saved-views";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TradesTable } from "@/components/trades/trades-table";
import { parseTradeFilters, parseTradePageParams } from "@/lib/analytics/filter-params";
import { fetchAccounts, fetchDistinctProductIds, fetchFilterOptions, fetchTradesPage } from "@/lib/analytics/queries";
import { fetchSavedViews } from "@/lib/analytics/saved-views";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function TradesPage(props: PageProps<"/trades">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ count: totalTradeCount }, { data: settings }, accounts, products, filterOptions] = await Promise.all([
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("orphaned_at", null),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
    fetchDistinctProductIds(),
    fetchFilterOptions(),
  ]);

  if (!totalTradeCount) {
    return (
      <>
        <PageHeader
          title="Operaciones"
          description="Todas tus operaciones reconstruidas a partir de los fills de Coinbase."
        />
        <EmptyState
          icon={ListOrdered}
          title="Todavía no hay operaciones reconstruidas"
          description="Conecta Coinbase Advanced o importa un histórico en CSV para que el motor de reconstrucción genere tus primeras operaciones. Esta tabla se llena solo con datos reales -- no muestra ejemplos."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);
  const pageParams = parseTradePageParams(searchParams);
  const { rows, total } = await fetchTradesPage(filters, pageParams);
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader
        title="Operaciones"
        description="Todas tus operaciones reconstruidas a partir de los fills de Coinbase."
      />
      <FilterBar
        accounts={accounts}
        products={products}
        strategies={filterOptions.strategies}
        tags={filterOptions.tags}
      />

      <SavedViews views={await fetchSavedViews("/trades")} />
      {total === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ninguna operación coincide"
          description="Ajusta o limpia los filtros para ver tus operaciones."
        />
      ) : (
        <TradesTable
          rows={rows}
          total={total}
          page={pageParams.page}
          pageSize={pageParams.pageSize}
          sortKey={pageParams.sortKey}
          sortDir={pageParams.sortDir}
          search={pageParams.search ?? ""}
          accountsById={accountsById}
          timezone={timezone}
        />
      )}
    </>
  );
}
