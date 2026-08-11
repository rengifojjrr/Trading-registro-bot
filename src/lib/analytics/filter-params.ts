import { DateTime } from "luxon";

import type { TradeFilters } from "./queries";
import type { SessionLabel } from "@/types/database";

export function pickSearchParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    dateFrom,
    dateTo,
  };
}
