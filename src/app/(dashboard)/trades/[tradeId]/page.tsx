import { Decimal } from "decimal.js";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FillHistoryTable, type FillHistoryRow } from "@/components/trades/fill-history-table";
import { LiveUnrealizedPnl } from "@/components/trades/live-unrealized-pnl";
import { MfeMaeStats } from "@/components/trades/mfe-mae-stats";
import { TradeChart, type TradeChartDrawing } from "@/components/trades/trade-chart";
import { MistakeTagger } from "@/components/trades/mistake-tagger";
import { TradeComments } from "@/components/trades/trade-comments";
import { TradeScreenshots, type TradeScreenshotRow } from "@/components/trades/trade-screenshots";
import { TradeSummary } from "@/components/trades/trade-summary";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";
import { DeleteTrade } from "@/components/trades/delete-trade";
import { pickChartWindow } from "@/lib/analytics/chart-window";
import { MAX_FILLS_RENDERED } from "@/lib/fills";
import { readSyncStatus } from "@/lib/sync/read-status";
import { computeMfeMae } from "@/lib/analytics/mfe-mae";
import { requireUser } from "@/lib/auth/require-user";
import { fetchTradeCandles } from "@/lib/coinbase/fetch-trade-candles";
import { formatDate } from "@/lib/format";
import type { MistakeCode } from "@/lib/journal/mistakes";
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
    // El capital y el tope por operación son lo que convierte el importe de
    // riesgo en un porcentaje comparable entre operaciones.
    supabase
      .from("app_settings")
      .select("timezone, account_size, max_risk_per_trade_pct")
      .eq("user_id", user.id)
      .maybeSingle(),
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
  // Only the starting granularity is needed here: the client sends the
  // trade id when the timeframe changes and the route derives the window
  // from the trade itself, so there's no window to keep in sync.
  const chartWindow = wantsChart ? pickChartWindow(chartOpenedAt, chartClosedAt) : null;

  const [
    { data: account },
    { data: tradeFills, count: totalFills },
    { data: journalEntry },
    { data: strategies },
    { data: tradeTags },
    { data: tradeMistakes },
    { data: tradeComments },
    { data: tradeScreenshotRows },
    { data: chartDrawingRows },
    chartData,
  ] = await Promise.all([
    supabase.from("accounts").select("name").eq("id", trade.account_id).maybeSingle(),
    supabase
      .from("trade_fills")
      .select("id, raw_fill_id, role, allocated_size, allocated_commission, sequence_no", {
        count: "exact",
      })
      .eq("trade_id", trade.id)
      .order("sequence_no", { ascending: true })
      // A scalping session can allocate thousands of fills to one trade,
      // and this section is folded by default -- shipping all of them into
      // the payload would cost the whole page for something nobody opened.
      // The full set is always available through the CSV export.
      .range(0, MAX_FILLS_RENDERED - 1),
    supabase.from("journal_entries").select("*").eq("trade_id", trade.id).maybeSingle(),
    supabase.from("strategies").select("id, name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("trade_tags").select("tag_id").eq("trade_id", trade.id),
    supabase.from("trade_mistakes").select("mistake_code").eq("trade_id", trade.id),
    supabase
      .from("trade_comments")
      .select("id, body, created_at")
      .eq("trade_id", trade.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("trade_screenshots")
      .select("id, storage_path, caption, phase")
      .eq("trade_id", trade.id)
      .order("uploaded_at", { ascending: false }),
    wantsChart
      ? supabase
          .from("chart_drawings")
          .select("id, tool, points, color")
          .eq("trade_id", trade.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
    wantsChart
      ? fetchTradeCandles({ productId: trade.product_id, openedAt: chartOpenedAt, closedAt: chartClosedAt })
      : Promise.resolve(null),
  ]);

  // Signed URLs, not public ones -- the trade-screenshots bucket is private
  // (see supabase/migrations/20260811121100_storage.sql). One batched call
  // rather than N individual createSignedUrl calls.
  const screenshotRows = tradeScreenshotRows ?? [];
  const { data: signedScreenshotUrls } =
    screenshotRows.length > 0
      ? await supabase.storage
          .from("trade-screenshots")
          .createSignedUrls(
            screenshotRows.map((s) => s.storage_path),
            3600,
          )
      : { data: [] };
  const screenshotUrlByPath = new Map((signedScreenshotUrls ?? []).map((s) => [s.path, s.signedUrl]));
  const screenshots: TradeScreenshotRow[] = screenshotRows.flatMap((s) => {
    const url = s.storage_path ? screenshotUrlByPath.get(s.storage_path) : undefined;
    if (!url) return [];
    return [{ id: s.id, url, caption: s.caption, phase: s.phase, storagePath: s.storage_path }];
  });

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

  // Active grouping corrections for this product -- shown next to the
  // fill list so a correction and the thing it corrects are in one place.
  const { data: overrideRows } = await supabase
    .from("trade_grouping_overrides")
    .select("id, anchor_fill_id, note")
    .eq("user_id", user.id)
    .eq("product_id", trade.product_id)
    .eq("is_active", true);

  const activeOverrides = (overrideRows ?? []).map((o) => ({
    id: o.id,
    anchorFillId: o.anchor_fill_id,
    note: o.note,
  }));

  const rawFillsById = new Map((rawFills ?? []).map((f) => [f.entry_id, f]));
  const fillRows: FillHistoryRow[] = (tradeFills ?? []).map((tf) => ({
    id: tf.id,
    raw_fill_id: tf.raw_fill_id,
    role: tf.role,
    allocated_size: tf.allocated_size,
    allocated_commission: tf.allocated_commission,
    rawFill: rawFillsById.get(tf.raw_fill_id) ?? null,
  }));

  // Cada ejecución para el gráfico. Sólo las que tienen precio y momento: un
  // enlace sin su fill crudo no se puede dibujar en ninguna parte.
  const chartFills = fillRows
    .filter((f) => f.rawFill !== null)
    .map((f) => ({
      time: Math.floor(new Date(f.rawFill!.trade_time).getTime() / 1000),
      price: Number(f.rawFill!.price),
      size: Number(f.allocated_size),
      role: f.role,
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
          realizedNetPnl={trade.net_pnl}
          totalEntryQty={trade.total_entry_qty}
          totalExitQty={trade.total_exit_qty}
          contractSize={trade.contract_multiplier}
          entryCommissions={trade.entry_commissions}
        />
      ) : null}

      {/* Only for an open position: a closed trade's figures are final, so
          being a day behind changes nothing about them. An "open" position
          that was actually closed is a claim about right now. */}
      {trade.status === "OPEN" ? <SyncStatusBar status={await readSyncStatus(user.id)} /> : null}

      <TradeSummary trade={trade} accountName={account?.name ?? "--"} timezone={timezone} />

      {chartData && entryMarker && chartWindow ? (
        <Card>
          <CardHeader>
            <CardTitle>Gráfico de la operación</CardTitle>
          </CardHeader>
          <CardContent>
            <TradeChart
              tradeId={trade.id}
              productId={trade.product_id}
              direction={trade.direction}
              isOpen={isLiveOpenPosition}
              openedAtUnix={Math.floor(chartOpenedAt.getTime() / 1000)}
              closedAtUnix={Math.floor(chartClosedAt.getTime() / 1000)}
              initialCandles={chartData.candles}
              initialGranularity={chartWindow.granularity}
              initialDrawings={(chartDrawingRows ?? []).map((d) => ({
                id: d.id,
                tool: d.tool,
                points: d.points as TradeChartDrawing["points"],
                color: d.color,
              }))}
              entry={entryMarker}
              exit={exitMarker}
              fills={chartFills}
              stopLoss={journalEntry?.stop_loss_price ? Number(journalEntry.stop_loss_price) : null}
              takeProfit={journalEntry?.take_profit_price ? Number(journalEntry.take_profit_price) : null}
            />
            {mfeMae ? <MfeMaeStats mfeMae={mfeMae} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Structured, countable facts about what went wrong -- separate
          from the journal's prose on purpose, so lib/analytics/behaviour
          can rank them by cost. */}
      <Card>
        <CardContent className="pt-5">
          <MistakeTagger
            tradeId={trade.id}
            initialCodes={(tradeMistakes ?? []).map((m) => m.mistake_code as MistakeCode)}
          />
        </CardContent>
      </Card>

      <FillHistoryTable
        fills={fillRows}
        totalFills={totalFills ?? fillRows.length}
        timezone={timezone}
        tradeId={trade.id}
        overrides={activeOverrides}
      />

      <div className="flex justify-end">
        <DeleteTrade tradeId={trade.id} source={trade.source} hasJournal={Boolean(journalEntry)} />
      </div>

      <JournalForm
        tradeId={trade.id}
        journalEntry={journalEntry ?? null}
        strategies={strategies ?? []}
        currentSetupGrade={currentSetupGrade}
        entryPrice={trade.entry_wap}
        direction={trade.direction}
        size={trade.max_size === null ? null : Number(trade.max_size)}
        contractSize={trade.contract_multiplier === null ? null : Number(trade.contract_multiplier)}
        accountSize={settings?.account_size === null || settings?.account_size === undefined ? null : Number(settings.account_size)}
        maxRiskPct={
          settings?.max_risk_per_trade_pct === null || settings?.max_risk_per_trade_pct === undefined
            ? null
            : Number(settings.max_risk_per_trade_pct)
        }
        netPnl={trade.net_pnl === null ? null : Number(trade.net_pnl)}
      />

      <TradeScreenshots tradeId={trade.id} screenshots={screenshots} />

      <TradeComments tradeId={trade.id} comments={tradeComments ?? []} timezone={timezone} />
    </>
  );
}
