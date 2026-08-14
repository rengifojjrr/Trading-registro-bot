import { DateTime } from "luxon";

import type { TradeFilters } from "./queries";
import { TRADE_SORT_KEYS, type TradePageParams, type TradeSortKey } from "./trade-sort";
import type { SessionLabel } from "@/types/database";

export function pickSearchParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickNumberParam(value: string | string[] | undefined): number | undefined {
  const raw = pickSearchParam(value);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Builds TradeFilters from raw URL search params (as Next.js hands them to
 * a page's searchParams prop). Date-only dateFrom/dateTo values are
 * converted to UTC instants at day boundaries in the account's configured
 * timezone -- comparing against UTC midnight instead would silently clip
 * part of the user's actual day, the same timezone-correctness concern
 * that governs session classification. Shared by the dashboard and the
 * trades page so a given filter means exactly the same query on both.
 */
export function parseTradeFilters(
  searchParams: Record<string, string | string[] | undefined>,
  timezone: string,
): TradeFilters {
  const dateFromRaw = pickSearchParam(searchParams.dateFrom);
  const dateToRaw = pickSearchParam(searchParams.dateTo);

  const dateFrom = dateFromRaw
    ? (DateTime.fromISO(dateFromRaw, { zone: timezone }).startOf("day").toUTC().toISO() ?? undefined)
    : undefined;
  const dateTo = dateToRaw
    ? (DateTime.fromISO(dateToRaw, { zone: timezone }).endOf("day").toUTC().toISO() ?? undefined)
    : undefined;

  return {
    accountId: pickSearchParam(searchParams.accountId),
    productId: pickSearchParam(searchParams.productId),
    direction: pickSearchParam(searchParams.direction) as TradeFilters["direction"],
    status: pickSearchParam(searchParams.status) as TradeFilters["status"],
    session: pickSearchParam(searchParams.session) as SessionLabel | undefined,
    source: pickSearchParam(searchParams.source) as TradeFilters["source"],
    netPnlMin: pickNumberParam(searchParams.netPnlMin),
    netPnlMax: pickNumberParam(searchParams.netPnlMax),
    strategyId: pickSearchParam(searchParams.strategyId),
    tagId: pickSearchParam(searchParams.tagId),
    dateFrom,
    dateTo,
  };
}

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Reads table paging/sorting out of the URL. Everything is validated
 * against an allowlist rather than trusted: the sort key is interpolated
 * into an ORDER BY, and page/pageSize are used as an offset, so a crafted
 * URL must never be able to steer either.
 */
export function parseTradePageParams(
  searchParams: Record<string, string | string[] | undefined>,
): TradePageParams {
  const rawSort = pickSearchParam(searchParams.sort);
  const sortKey = (TRADE_SORT_KEYS as readonly string[]).includes(rawSort ?? "")
    ? (rawSort as TradeSortKey)
    : "opened_at";

  const rawPage = pickNumberParam(searchParams.page);
  const page = rawPage !== undefined && Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0;

  return {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    sortKey,
    sortDir: pickSearchParam(searchParams.dir) === "asc" ? "asc" : "desc",
    search: pickSearchParam(searchParams.q),
  };
}

/**
 * The window immediately before [dateFrom, dateTo], of the same length --
 * for "this period vs the previous one" comparisons. Returns null unless
 * both ends are set, since an open-ended range has no well-defined
 * predecessor.
 */
export function previousPeriodFilters(filters: TradeFilters): TradeFilters | null {
  if (!filters.dateFrom || !filters.dateTo) return null;

  const from = DateTime.fromISO(filters.dateFrom);
  const to = DateTime.fromISO(filters.dateTo);
  if (!from.isValid || !to.isValid) return null;

  const lengthMs = to.toMillis() - from.toMillis();
  if (lengthMs <= 0) return null;

  return {
    ...filters,
    dateFrom: from.minus({ milliseconds: lengthMs }).toISO() ?? undefined,
    dateTo: from.toISO() ?? undefined,
  };
}
