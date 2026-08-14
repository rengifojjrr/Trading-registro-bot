/**
 * Table sorting/paging vocabulary, deliberately in its own module with no
 * imports: both the server query layer (queries.ts, which is `server-only`)
 * and the URL parser used from client-reachable code need these, and
 * putting them in queries.ts dragged `server-only` into every consumer.
 */

/** Columns the trades table can be ordered by, as an allowlist -- the value comes from the URL and is interpolated into an ORDER BY. */
export const TRADE_SORT_KEYS = [
  "opened_at",
  "product_id",
  "max_size",
  "net_pnl",
  "return_pct",
  "duration_seconds",
] as const;

export type TradeSortKey = (typeof TRADE_SORT_KEYS)[number];

export interface TradePageParams {
  page: number; // zero-based
  pageSize: number;
  sortKey: TradeSortKey;
  sortDir: "asc" | "desc";
  /** Free-text match against product_id -- the only searchable column that lives on trades itself. */
  search?: string;
}
