import "server-only";

import { Decimal } from "decimal.js";

import { createClient } from "@/lib/supabase/server";
import type { Database, SessionLabel, TradeSource } from "@/types/database";

import type { TradeExcursion, TradeForBreakdown } from "./breakdowns";
import type { TradePageParams, TradeSortKey } from "./trade-sort";
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
  /**
   * Both live on journal_entries / trade_tags rather than on trades, so
   * they can't be applied in the same PostgREST query as the rest --
   * resolveJournalFilters() turns them into a trade-id set first. Kept in
   * the same TradeFilters shape so callers and the URL don't need to know
   * where a given filter physically lives.
   */
  strategyId?: string;
  tagId?: string;
}

/**
 * Turns the journal/tag filters into an explicit trade-id list, or null
 * when neither is active. Returning an empty array (rather than null) is
 * meaningful: it means "a filter was applied and nothing matched", which
 * must produce zero results, not every result.
 */
export async function resolveJournalFilters(filters: TradeFilters): Promise<string[] | null> {
  if (!filters.strategyId && !filters.tagId) return null;

  const supabase = await createClient();
  const idSets: string[][] = [];

  if (filters.strategyId) {
    const { data } = await supabase
      .from("journal_entries")
      .select("trade_id")
      .eq("strategy_id", filters.strategyId);
    idSets.push((data ?? []).map((r) => r.trade_id));
  }

  if (filters.tagId) {
    const { data } = await supabase.from("trade_tags").select("trade_id").eq("tag_id", filters.tagId);
    idSets.push((data ?? []).map((r) => r.trade_id));
  }

  // Multiple filters intersect -- "strategy X AND tag Y", not "either".
  return idSets.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
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

/** Exported so the compare page selects exactly what TradeTableRow declares. */
export const TABLE_COLUMNS_FOR_COMPARE =
  "id, product_id, account_id, direction, status, opened_at, closed_at, duration_seconds, max_size, total_entry_qty, total_exit_qty, entry_wap, exit_wap, notional_value, total_commissions, gross_pnl, net_pnl, return_pct, entries_count, exits_count, session_effective, source, is_manually_adjusted";

const TABLE_COLUMNS = TABLE_COLUMNS_FOR_COMPARE;

export function applyFilters<T>(query: T, filters: TradeFilters): T {
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

/** Applies the id restriction from resolveJournalFilters, if any. */
export function applyIdRestriction<T>(query: T, tradeIds: string[] | null): T {
  if (tradeIds === null) return query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).in("id", tradeIds) as T;
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

/** Richer columns for the trades table. Unpaginated -- used by exports and the journal index, which need every matching row. */
export async function fetchTradesForTable(filters: TradeFilters = {}): Promise<TradeTableRow[]> {
  const supabase = await createClient();
  const restrictedIds = await resolveJournalFilters(filters);
  if (restrictedIds !== null && restrictedIds.length === 0) return [];

  let query = supabase.from("trades").select(TABLE_COLUMNS);
  query = applyFilters(query, filters);
  query = applyIdRestriction(query, restrictedIds);
  const { data, error } = await query.order("opened_at", { ascending: false });
  if (error) throw new Error(`fetchTradesForTable: ${error.message}`);
  return (data ?? []) as unknown as TradeTableRow[];
}

export type { TradePageParams, TradeSortKey };

export interface TradePage {
  rows: TradeTableRow[];
  /** Total matching rows, not just this page -- for the "N operaciones" count and page numbers. */
  total: number;
}

/**
 * One page of trades, sorted and counted by Postgres.
 *
 * Previously the page fetched every matching row and sorted/paginated in
 * the browser, which is fine for hundreds of trades but grows without
 * bound: with years of history every page load transfers the whole
 * history to render 25 rows.
 */
export async function fetchTradesPage(
  filters: TradeFilters,
  params: TradePageParams,
): Promise<TradePage> {
  const supabase = await createClient();
  const restrictedIds = await resolveJournalFilters(filters);
  if (restrictedIds !== null && restrictedIds.length === 0) return { rows: [], total: 0 };

  let query = supabase.from("trades").select(TABLE_COLUMNS, { count: "exact" });
  query = applyFilters(query, filters);
  query = applyIdRestriction(query, restrictedIds);

  if (params.search) {
    // ilike rather than a text-search index: product ids are short and
    // few, and this keeps the query honest about what it actually
    // searches (see the placeholder on the input).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).ilike("product_id", `%${params.search}%`);
  }

  const from = params.page * params.pageSize;
  const { data, error, count } = await query
    .order(params.sortKey, { ascending: params.sortDir === "asc", nullsFirst: false })
    .range(from, from + params.pageSize - 1);

  if (error) throw new Error(`fetchTradesPage: ${error.message}`);
  return { rows: (data ?? []) as unknown as TradeTableRow[], total: count ?? 0 };
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
    // A trade the latest recomputation no longer produces is not something
    // that is open right now, whatever the status column still says.
    .is("orphaned_at", null)
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
    .select("id, name, venue, currency, is_demo, is_active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`fetchAccounts: ${error.message}`);
  return data ?? [];
}

/** Strategies and tags for the FilterBar's selectors -- both are per-user, so RLS scopes them. */
export async function fetchFilterOptions() {
  const supabase = await createClient();
  const [{ data: strategies }, { data: tags }] = await Promise.all([
    supabase.from("strategies").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("tags").select("id, name").order("name", { ascending: true }),
  ]);
  return { strategies: strategies ?? [], tags: tags ?? [] };
}

/**
 * Everything the breakdown views need in one pass: the trade's own columns
 * plus the journalled R multiple, which lives on journal_entries.
 */
export async function fetchTradesForBreakdown(filters: TradeFilters = {}): Promise<TradeForBreakdown[]> {
  const supabase = await createClient();
  const restrictedIds = await resolveJournalFilters(filters);
  if (restrictedIds !== null && restrictedIds.length === 0) return [];

  let query = supabase.from("trades").select("id, status, opened_at, net_pnl, session_effective");
  query = applyFilters(query, filters);
  query = applyIdRestriction(query, restrictedIds);
  const { data: trades, error } = await query.order("opened_at", { ascending: true });
  if (error) throw new Error(`fetchTradesForBreakdown: ${error.message}`);

  const tradeIds = (trades ?? []).map((t) => t.id);
  const resultRByTradeId = new Map<string, string | null>();
  if (tradeIds.length > 0) {
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("trade_id, result_r")
      .in("trade_id", tradeIds);
    for (const e of entries ?? []) resultRByTradeId.set(e.trade_id, e.result_r);
  }

  return (trades ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    openedAt: t.opened_at,
    netPnl: t.net_pnl,
    session: t.session_effective,
    resultR: resultRByTradeId.get(t.id) ?? null,
  }));
}

/**
 * Stored MFE/MAE joined to each trade's realized result. Only trades with
 * an actual computed value are returned -- rows carrying an
 * unavailable_reason are skipped so they can't be mistaken for zero
 * excursion. `totalTrades` lets the UI say "computed for N of M".
 */
export async function fetchExcursions(
  filters: TradeFilters = {},
): Promise<{ excursions: TradeExcursion[]; totalClosed: number }> {
  const supabase = await createClient();
  const restrictedIds = await resolveJournalFilters(filters);
  if (restrictedIds !== null && restrictedIds.length === 0) return { excursions: [], totalClosed: 0 };

  let query = supabase
    .from("trades")
    .select("id, direction, entry_wap, max_size, contract_multiplier, net_pnl")
    .eq("status", "CLOSED")
    .not("net_pnl", "is", null);
  query = applyFilters(query, filters);
  query = applyIdRestriction(query, restrictedIds);
  const { data: trades, error } = await query;
  if (error) throw new Error(`fetchExcursions: ${error.message}`);

  const tradeIds = (trades ?? []).map((t) => t.id);
  if (tradeIds.length === 0) return { excursions: [], totalClosed: 0 };

  const { data: extremes } = await supabase
    .from("trade_price_extremes")
    .select("trade_id, mfe_price, mae_price")
    .in("trade_id", tradeIds);

  const extremeByTradeId = new Map((extremes ?? []).map((e) => [e.trade_id, e]));

  const excursions: TradeExcursion[] = [];
  for (const trade of trades ?? []) {
    const extreme = extremeByTradeId.get(trade.id);
    if (!extreme?.mfe_price || !extreme.mae_price || !trade.entry_wap) continue;

    // Convert the stored extreme prices into account-currency amounts the
    // same way lib/analytics/mfe-mae.ts does, so both views agree.
    const size = new Decimal(trade.max_size).times(trade.contract_multiplier);
    const entry = new Decimal(trade.entry_wap);
    const sign = trade.direction === "LONG" ? 1 : -1;
    const mfe = new Decimal(extreme.mfe_price).minus(entry).times(sign).times(size);
    const mae = new Decimal(extreme.mae_price).minus(entry).times(sign).times(size);

    excursions.push({
      tradeId: trade.id,
      mfeAmount: Decimal.max(0, mfe).toString(),
      maeAmount: Decimal.max(0, mae.negated()).toString(),
      netPnl: trade.net_pnl!,
    });
  }

  return { excursions, totalClosed: tradeIds.length };
}
