import { Decimal } from "decimal.js";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FillHistoryTable, type FillHistoryRow } from "@/components/trades/fill-history-table";
import { LiveUnrealizedPnl } from "@/components/trades/live-unrealized-pnl";
import { MfeMaeStats } from "@/components/trades/mfe-mae-stats";
import { TradeChart } from "@/components/trades/trade-chart";
import { TradeSummary } from "@/components/trades/trade-summary";
import { pickChartWindow } from "@/lib/analytics/chart-window";
import { computeMfeMae } from "@/lib/analytics/mfe-mae";
import { requireUser } from "@/lib/auth/require-user";
import { fetchTradeCandles } from "@/lib/coinbase/fetch-trade-candles";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { JournalForm } from "./journal-form";

const TRADE_COLUMNS =
  "id, account_id, product_id, direction, status, opened_at, closed_at, duration_seconds, max_size, total_entry_qty, total_exit_qty, entry_wap, exit_wap, contract_multiplier, notional_value, entry_commissions, exit_commissions, total_commissions, gross_pnl, net_pnl, return_pct, entries_count, exits_count, is_manually_adjusted, session_effective, source";

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

  // A Notion-imported/demo trade's product_id is synthetic (e.g.
  // "MBT-EXTERNAL", "BIT-DEMO-CDE") and was never a real Coinbase product,
  // so there's no real chart to fetch for it -- see fetch-trade-candles.ts.
  const wantsChart = trade.source === "COINBASE_SYNC" && trade.entry_wap !== null;
  const chartOpenedAt = new Date(trade.opened_at);
  const chartClosedAt = trade.closed_at ? new Date(trade.closed_at) : new Date();
  // Computed from the exact same Date instances passed to fetchTradeCandles
  // below, which picks this same window internally -- so the client's
  // manual granularity selector (see trade-chart.tsx) always re-fetches the
  // identical [start, end] range the server originally rendered.
  const chartWindow = wantsChart ? pickChartWindow(chartOpenedAt, chartClosedAt) : null;

  const [{ data: account }, { data: tradeFills }, { data: journalEntry }, { data: strategies }, { data: tradeTags }, chartData] =
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
      wantsChart
        ? fetchTradeCandles({ productId: trade.product_id, openedAt: chartOpenedAt, closedAt: chartClosedAt })
        : Promise.resolve(null),
    ]);

  const isLiveOpenPosition =
    trade.status === "OPEN" && trade.source === "COINBASE_SYNC" && trade.entry_wap !== null;
  const openQty = isLiveOpenPosition
    ? new Decimal(trade.total_entry_qty).minus(trade.total_exit_qty).toString()
    : null;

  const entryMarker =
    chartData && trade.entry_wap
      ? { time: Math.floor(new Date(trade.opened_at).getTime() / 1000), price: Number(trade.entry_wap) }
      : null;
  const exitMarker =
    chartData && trade.exit_wap && trade.closed_at
      ? { time: Math.floor(new Date(trade.closed_at).getTime() / 1000), price: Number(trade.exit_wap) }
      : null;

  // MFE/MAE only makes sense retrospectively, for a trade that actually
  // finished -- reuses the exact same candles already fetched for the
  // chart above rather than fetching anything twice.
  const mfeMae =
    chartData && trade.status === "CLOSED" && trade.closed_at
      ? computeMfeMae(chartData.candles, {
          openedAtUnix: Math.floor(new Date(trade.opened_at).getTime() / 1000),
          closedAtUnix: Math.floor(new Date(trade.closed_at).getTime() / 1000),
          direction: trade.direction,
          entryWap: trade.entry_wap!,
          maxSize: trade.max_size,
          contractSize: trade.contract_multiplier,
        })
      : null;

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

      {isLiveOpenPosition && openQty ? (
        <LiveUnrealizedPnl
          productId={trade.product_id}
          direction={trade.direction}
          entryWap={trade.entry_wap!}
          openQty={openQty}
          contractSize={trade.contract_multiplier}
          entryCommissions={trade.entry_commissions}
        />
      ) : null}

      <TradeSummary trade={trade} accountName={account?.name ?? "--"} timezone={timezone} />

      {chartData && entryMarker && chartWindow ? (
        <Card>
          <CardHeader>
            <CardTitle>Gráfico de la operación</CardTitle>
          </CardHeader>
          <CardContent>
            <TradeChart
              productId={trade.product_id}
              windowStart={Math.floor(chartWindow.start.getTime() / 1000)}
              windowEnd={Math.floor(chartWindow.end.getTime() / 1000)}
              initialCandles={chartData.candles}
              initialGranularity={chartWindow.granularity}
              entry={entryMarker}
              exit={exitMarker}
            />
            {mfeMae ? <MfeMaeStats mfeMae={mfeMae} /> : null}
          </CardContent>
        </Card>
      ) : null}

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
