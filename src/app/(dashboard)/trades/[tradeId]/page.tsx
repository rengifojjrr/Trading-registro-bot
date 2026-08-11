import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { FillHistoryTable, type FillHistoryRow } from "@/components/trades/fill-history-table";
import { TradeSummary } from "@/components/trades/trade-summary";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { JournalForm } from "./journal-form";

const TRADE_COLUMNS =
  "id, account_id, product_id, direction, status, opened_at, closed_at, duration_seconds, max_size, total_entry_qty, total_exit_qty, entry_wap, exit_wap, notional_value, entry_commissions, exit_commissions, total_commissions, gross_pnl, net_pnl, return_pct, entries_count, exits_count, is_manually_adjusted, session_effective, source";

export default async function TradeDetailPage(props: PageProps<"/trades/[tradeId]">) {
  const { tradeId } = await props.params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: trade }, { data: settings }] = await Promise.all([
    supabase.from("trades").select(TRADE_COLUMNS).eq("user_id", user.id).eq("id", tradeId).maybeSingle(),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!trade) {
    notFound();
  }

  const timezone = settings?.timezone || "UTC";

  const [{ data: account }, { data: tradeFills }, { data: journalEntry }, { data: strategies }, { data: tradeTags }] =
    await Promise.all([
      supabase.from("accounts").select("name").eq("id", trade.account_id).maybeSingle(),
      supabase
        .from("trade_fills")
        .select("id, raw_fill_id, role, allocated_size, allocated_commission, sequence_no")
        .eq("trade_id", trade.id)
        .order("sequence_no", { ascending: true }),
      supabase.from("journal_entries").select("*").eq("trade_id", trade.id).maybeSingle(),
      supabase.from("strategies").select("id, name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("trade_tags").select("tag_id").eq("trade_id", trade.id),
    ]);

  const tagIds = (tradeTags ?? []).map((t) => t.tag_id);
  const { data: tags } =
    tagIds.length > 0 ? await supabase.from("tags").select("id, name").in("id", tagIds) : { data: [] };

  const SETUP_TAG_PREFIX = "Setup: ";
  const currentSetupGrade =
    (tags ?? []).map((t) => t.name).find((name) => name.startsWith(SETUP_TAG_PREFIX))?.slice(SETUP_TAG_PREFIX.length) ??
    null;

  const rawFillIds = (tradeFills ?? []).map((f) => f.raw_fill_id);
  const { data: rawFills } =
    rawFillIds.length > 0
      ? await supabase
          .from("raw_fills")
          .select("entry_id, trade_time, side, price, size, trade_type, liquidity_indicator")
          .in("entry_id", rawFillIds)
      : { data: [] };

  const rawFillsById = new Map((rawFills ?? []).map((f) => [f.entry_id, f]));
  const fillRows: FillHistoryRow[] = (tradeFills ?? []).map((tf) => ({
    id: tf.id,
    raw_fill_id: tf.raw_fill_id,
    role: tf.role,
    allocated_size: tf.allocated_size,
    allocated_commission: tf.allocated_commission,
    rawFill: rawFillsById.get(tf.raw_fill_id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title={`${trade.product_id} · ${trade.direction === "LONG" ? "Long" : "Short"}`}
        description={`${account?.name ?? "Cuenta"} · Abierta ${formatDate(trade.opened_at, timezone)}`}
      />

      <TradeSummary trade={trade} accountName={account?.name ?? "--"} timezone={timezone} />

      <FillHistoryTable fills={fillRows} timezone={timezone} />

      <JournalForm
        tradeId={trade.id}
        journalEntry={journalEntry ?? null}
        strategies={strategies ?? []}
        currentSetupGrade={currentSetupGrade}
      />
    </>
  );
}
