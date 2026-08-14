"use server";

import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { fetchTradesForTable, type TradeTableRow } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Every row matching the current filters, for the CSV export.
 *
 * The table itself is paginated server-side now, so the client only ever
 * holds one page -- but an export of "just the 25 rows you happen to be
 * looking at" would be a silent trap. This fetches the full filtered set
 * on demand instead, so the export still means what it always meant.
 */
export async function fetchTradesForExport(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<TradeTableRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  const filters = parseTradeFilters(searchParams, settings?.timezone || "UTC");
  return fetchTradesForTable(filters);
}
