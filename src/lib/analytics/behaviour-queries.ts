import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import type { MistakeCode } from "@/lib/journal/mistakes";
import { createClient } from "@/lib/supabase/server";

import { applyFilters, applyIdRestriction, resolveJournalFilters, type TradeFilters } from "./queries";
import type { TradeForStats } from "./stats";

/**
 * Reads for the behaviour analytics. Kept apart from queries.ts because
 * these join tables the rest of the dashboard doesn't know about (mistakes,
 * playbook checks) and would otherwise widen every existing query.
 */

export interface TradeWithBehaviour extends TradeForStats {
  maxSize: string;
  productId: string;
  mistakes: MistakeCode[];
}

export async function fetchTradesWithBehaviour(
  filters: TradeFilters = {},
): Promise<TradeWithBehaviour[]> {
  const user = await requireUser();
  const supabase = await createClient();

  // Strategy/tag filters resolve to a set of trade ids first; everything
  // else is a plain column predicate. Same two-step every other query in
  // queries.ts uses, so a filtered behaviour view matches a filtered
  // dashboard exactly.
  const restrictedIds = await resolveJournalFilters(filters);
  let query = supabase
    .from("trades")
    .select("id, status, opened_at, closed_at, net_pnl, gross_pnl, total_commissions, max_size, product_id");
  query = applyFilters(query, filters);
  query = applyIdRestriction(query, restrictedIds);

  const { data: trades, error } = await query.order("opened_at", { ascending: true });
  if (error) throw new Error(`fetchTradesWithBehaviour: ${error.message}`);

  const rows = trades ?? [];
  if (rows.length === 0) return [];

  const { data: mistakeRows } = await supabase
    .from("trade_mistakes")
    .select("trade_id, mistake_code")
    .eq("user_id", user.id)
    .in(
      "trade_id",
      rows.map((t) => t.id),
    );

  const byTrade = new Map<string, MistakeCode[]>();
  for (const row of mistakeRows ?? []) {
    const list = byTrade.get(row.trade_id) ?? [];
    list.push(row.mistake_code as MistakeCode);
    byTrade.set(row.trade_id, list);
  }

  return rows.map((t) => ({
    id: t.id,
    status: t.status,
    openedAt: t.opened_at,
    closedAt: t.closed_at,
    netPnl: t.net_pnl,
    grossPnl: t.gross_pnl,
    totalCommissions: t.total_commissions ?? "0",
    maxSize: t.max_size,
    productId: t.product_id,
    mistakes: byTrade.get(t.id) ?? [],
  }));
}
