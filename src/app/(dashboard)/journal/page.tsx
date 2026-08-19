import { BookOpen } from "lucide-react";
import Link from "next/link";

import { SavedViews } from "@/components/dashboard/saved-views";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { TagManager, type ManagedTag } from "@/components/journal/tag-manager";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { fetchAccounts, fetchDistinctProductIds, fetchFilterOptions, fetchTradesForTable } from "@/lib/analytics/queries";
import { fetchSavedViews } from "@/lib/analytics/saved-views";
import { requireUser } from "@/lib/auth/require-user";
import { formatDate, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * The Diario section used to be a permanent "nothing here yet" placeholder
 * even for accounts with hundreds of journalled trades -- it was never
 * wired to real data. It now lists the actual trades and shows, at a
 * glance, which ones still need writing up, which is the one question this
 * page exists to answer. Editing still happens on each trade's own page;
 * this is the index into it.
 */
export default async function JournalPage(props: PageProps<"/journal">) {
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
        <PageHeader title="Diario" description="Tus notas y reflexiones sobre cada operación." />
        <EmptyState
          icon={BookOpen}
          title="El diario se llena junto con tus operaciones"
          description="Cuando haya operaciones sincronizadas desde Coinbase, aparecerán aquí para que registres estrategia, riesgo, emociones y lecciones en cada una."
        />
      </>
    );
  }

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);
  const trades = await fetchTradesForTable(filters);

  const [{ data: journalRows }, { data: tagRows }, { data: tagUsage }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("trade_id, strategy_id, lesson_learned, notes, emotional_state, result_r")
      .eq("user_id", user.id),
    supabase.from("tags").select("id, name").eq("user_id", user.id).order("name", { ascending: true }),
    supabase.from("trade_tags").select("tag_id").eq("user_id", user.id),
  ]);

  // Counted in JS rather than a grouped query: PostgREST has no
  // group-by shorthand, and the tag/trade_tag counts here are small.
  const usageByTagId = new Map<string, number>();
  for (const row of tagUsage ?? []) {
    usageByTagId.set(row.tag_id, (usageByTagId.get(row.tag_id) ?? 0) + 1);
  }
  const managedTags: ManagedTag[] = (tagRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    usageCount: usageByTagId.get(t.id) ?? 0,
  }));

  const journalByTradeId = new Map((journalRows ?? []).map((j) => [j.trade_id, j]));

  // "Written up" means there's something a human actually typed -- a row
  // that only carries a strategy dropdown value isn't a journal entry in
  // any useful sense, so it still counts as pending.
  const isWrittenUp = (tradeId: string) => {
    const entry = journalByTradeId.get(tradeId);
    if (!entry) return false;
    return Boolean(entry.lesson_learned || entry.notes || entry.emotional_state);
  };

  const pendingCount = trades.filter((t) => !isWrittenUp(t.id)).length;

  return (
    <>
      <PageHeader
        title="Diario"
        description={
          pendingCount > 0
            ? `${pendingCount} de ${trades.length} operaciones sin anotar todavía.`
            : `Las ${trades.length} operaciones del período tienen anotaciones.`
        }
      />
      <FilterBar
        accounts={accounts}
        products={products}
        strategies={filterOptions.strategies}
        tags={filterOptions.tags}
      />

      <SavedViews views={await fetchSavedViews("/journal")} />

      <TagManager tags={managedTags} />

      {trades.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Ninguna operación coincide con estos filtros"
          description="Ajusta o limpia los filtros para ver tus operaciones."
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border pt-2">
            {trades.map((trade) => {
              const entry = journalByTradeId.get(trade.id);
              const writtenUp = isWrittenUp(trade.id);
              const preview = entry?.lesson_learned || entry?.notes || null;

              return (
                <Link
                  key={trade.id}
                  href={`/trades/${trade.id}`}
                  className="flex flex-col gap-1 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{trade.direction === "LONG" ? "Long" : "Short"}</Badge>
                      <span className="font-medium">{trade.product_id}</span>
                      <span className="text-muted-foreground">{formatDate(trade.opened_at, timezone)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {trade.net_pnl !== null ? (
                        <span className={cn("text-sm tabular-nums", pnlColorClass(trade.net_pnl))}>
                          {formatSignedMoney(trade.net_pnl)}
                        </span>
                      ) : null}
                      <Badge variant={writtenUp ? "positive" : "warning"}>
                        {writtenUp ? "Anotada" : "Sin anotar"}
                      </Badge>
                    </div>
                  </div>
                  {preview ? (
                    <p className="line-clamp-1 text-xs text-muted-foreground">{preview}</p>
                  ) : null}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
