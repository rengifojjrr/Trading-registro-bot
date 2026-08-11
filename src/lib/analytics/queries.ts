import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, SessionLabel, TradeSource } from "@/types/database";

import type { TradeForStats } from "./stats";

export interface TradeFilters {
  accountId?: string;
  productId?: string;
  direction?: "LONG" | "SHORT";
  status?: "OPEN" | "CLOSED";
  dateFrom?: string; // ISO, filters on opened_at
  dateTo?: string; // ISO, filters on opened_at
  session?: SessionLabel;
  source?: TradeSource;
  netPnlMin?: number;
  netPnlMax?: number;
}

type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

/**
 * Exactly the columns TABLE_COLUMNS selects -- kept as an explicit Pick
 * (not the full TradeRow) so referencing a column this query never fetched
 * (e.g. contract_multiplier, session_computed) is a type error instead of a
 * silent `undefined` at runtime.
 */
export type TradeTableRow = Pick<
  TradeRow,
  | "id"
  | "product_id"
  | "account_id"
  | "direction"
  | "status"
  | "opened_at"
  | "closed_at"
  | "duration_seconds"
  | "max_size"
  | "total_entry_qty"
  | "total_exit_qty"
  | "entry_wap"
  | "exit_wap"
  | "notional_value"
  | "total_commissions"
  | "gross_pnl"
  | "net_pnl"
  | "return_pct"
  | "entries_count"
  | "exits_count"
  | "session_effective"
  | "source"
  | "is_manually_adjusted"
>;

const STATS_COLUMNS = "id, status, opened_at, closed_at, net_pnl, gross_pnl, total_commissions";

const TABLE_COLUMNS =
  "id, product_id, account_id, direction, status, opened_at, closed_at, duration_seconds, max_size, total_entry_qty, total_exit_qty, entry_wap, exit_wap, notional_value, total_commissions, gross_pnl, net_pnl, return_pct, entries_count, exits_count, session_effective, source, is_manually_adjusted";

function applyFilters<T>(query: T, filters: TradeFilters): T {
  // Supabase's query builder is fluent (each call returns `this`), so this
  // cast-free chain works despite the generic -- the alternative
  // (threading a wider union type through every .eq/.gte call) hurts
  // readability for no real safety gain here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.accountId) q = q.eq("account_id", filters.accountId);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.direction) q = q.eq("direction", filters.direction);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("opened_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("opened_at", filters.dateTo);
  if (filters.session) q = q.eq("session_effective", filters.session);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.netPnlMin !== undefined) q = q.gte("net_pnl", filters.netPnlMin);
  if (filters.netPnlMax !== undefined) q = q.lte("net_pnl", filters.netPnlMax);
  return q as T;
}

/** Minimal columns for lib/analytics/stats.ts -- every dashboard metric and chart goes through this same query shape, filtered or not. */
export async function fetchTradesForStats(filters: TradeFilters = {}) {
  const supabase = await createClient();
  let query = supabase.from("trades").select(STATS_COLUMNS);
  query = applyFilters(query, filters);
  const { data, error } = await query.order("opened_at", { ascending: true });
  if (error) throw new Error(`fetchTradesForStats: ${error.message}`);

  return (data ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    openedAt: t.opened_at,
    closedAt: t.closed_at,
    netPnl: t.net_pnl,
    grossPnl: t.gross_pnl,
    totalCommissions: t.total_commissions,
  }));
}

/** Richer columns for the trades table. */
export async function fetchTradesForTable(filters: TradeFilters = {}): Promise<TradeTableRow[]> {
  const supabase = await createClient();
  let query = supabase.from("trades").select(TABLE_COLUMNS);
  query = applyFilters(query, filters);
  const { data, error } = await query.order("opened_at", { ascending: false });
  if (error) throw new Error(`fetchTradesForTable: ${error.message}`);
  return (data ?? []) as unknown as TradeTableRow[];
}

const OPEN_POSITION_COLUMNS =
  "id, product_id, direction, opened_at, entry_wap, max_size, total_entry_qty, total_exit_qty, contract_multiplier, entry_commissions";

export type OpenPositionRow = Pick<
  TradeRow,
  | "id"
  | "product_id"
  | "direction"
  | "opened_at"
  | "entry_wap"
  | "max_size"
  | "total_entry_qty"
  | "total_exit_qty"
  | "contract_multiplier"
  | "entry_commissions"
>;

/**
 * Currently-open Coinbase-synced positions, for the dashboard's live
 * panel -- deliberately ignores the dashboard's own date-range/account
 * filters (TradeFilters), since "what's open right now" is a status fact,
 * not a historical view someone would want to filter by month.
 */
export async function fetchOpenLivePositions(): Promise<OpenPositionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select(OPEN_POSITION_COLUMNS)
    .eq("status", "OPEN")
    .eq("source", "COINBASE_SYNC")
    .not("entry_wap", "is", null)
    .order("opened_at", { ascending: false });
  if (error) throw new Error(`fetchOpenLivePositions: ${error.message}`);
  return (data ?? []) as unknown as OpenPositionRow[];
}

export interface TradeWithStrategy extends TradeForStats {
  strategyId: string | null;
}

/**
 * Same filtered trade set as fetchTradesForStats, each tagged with its
 * journal strategy_id (null if the trade has no journal entry or no
 * strategy assigned) -- for lib/analytics/strategy-report.ts to group by.
 * Two queries plus an in-JS join, rather than a single PostgREST embedded
 * select: this project's hand-maintained types/database.ts always declares
 * an empty Relationships tuple per table (see that file's own top comment),
 * so supabase-js has nothing to infer an embedded journal_entries(...)
 * select's shape from here. Mirrors the same two-query-plus-Map pattern
 * already used for trade_fills/raw_fills on the trade detail page.
 */
export async function fetchTradesForStrategyReport(filters: TradeFilters = {}): Promise<TradeWithStrategy[]> {
  const supabase = await createClient();
  let query = supabase.from("trades").select(STATS_COLUMNS);
  query = applyFilters(query, filters);
  const { data: trades, error } = await query.order("opened_at", { ascending: true });
  if (error) throw new Error(`fetchTradesForStrategyReport: ${error.message}`);

  const tradeIds = (trades ?? []).map((t) => t.id);
  const strategyByTradeId = new Map<string, string | null>();
  if (tradeIds.length > 0) {
    const { data: entries, error: entriesError } = await supabase
      .from("journal_entries")
      .select("trade_id, strategy_id")
      .in("trade_id", tradeIds);
    if (entriesError) throw new Error(`fetchTradesForStrategyReport: ${entriesError.message}`);
    for (const e of entries ?? []) strategyByTradeId.set(e.trade_id, e.strategy_id);
  }

  return (trades ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    openedAt: t.opened_at,
    closedAt: t.closed_at,
    netPnl: t.net_pnl,
    grossPnl: t.gross_pnl,
    totalCommissions: t.total_commissions,
    strategyId: strategyByTradeId.get(t.id) ?? null,
  }));
}

/**
 * Distinct product_ids the user has ever traded, for the FilterBar's
 * product selector. Fetches just the one column and dedupes in JS rather
 * than a DISTINCT query -- PostgREST has no query-builder shorthand for it,
 * and this app's trade counts (hundreds to low thousands, see
 * trades-table.tsx) make a single-column full scan cheap enough that it's
 * not worth a database view just for this.
 */
export async function fetchDistinctProductIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("trades").select("product_id").order("product_id", { ascending: true });
  if (error) throw new Error(`fetchDistinctProductIds: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r) => r.product_id)));
}

export async function fetchAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, venue, is_demo, is_active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`fetchAccounts: ${error.message}`);
  return data ?? [];
}
