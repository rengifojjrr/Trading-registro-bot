import { NextResponse } from "next/server";

import { computeMfeMae } from "@/lib/analytics/mfe-mae";
import { requireUser } from "@/lib/auth/require-user";
import { fetchTradeCandles } from "@/lib/coinbase/fetch-trade-candles";
import { createClient } from "@/lib/supabase/server";

/**
 * Computes and stores MFE/MAE for closed trades that don't have it yet.
 *
 * This is an explicit, user-triggered batch rather than something the
 * dashboard does implicitly, because each trade costs one Coinbase candles
 * request -- doing it silently on page render would hammer the rate limit
 * on any account with real history. The batch is deliberately small and
 * the response reports what's left, so the UI can invite another run
 * instead of hanging on a long one.
 *
 * A trade whose candles can't be obtained gets a row with
 * unavailable_reason set and null prices, never a fabricated zero, so it
 * isn't retried forever and can't quietly pollute the aggregate.
 */
const BATCH_SIZE = 15;

export async function POST() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("trade_price_extremes")
    .select("trade_id")
    .eq("user_id", user.id);
  const alreadyComputed = new Set((existing ?? []).map((r) => r.trade_id));

  const { data: closedTrades, error } = await supabase
    .from("trades")
    .select(
      "id, product_id, direction, opened_at, closed_at, entry_wap, max_size, contract_multiplier",
    )
    .eq("user_id", user.id)
    .eq("status", "CLOSED")
    .eq("source", "COINBASE_SYNC")
    .not("entry_wap", "is", null)
    .not("closed_at", "is", null)
    .order("opened_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "No se pudieron leer las operaciones." }, { status: 500 });
  }

  const pending = (closedTrades ?? []).filter((t) => !alreadyComputed.has(t.id));
  const batch = pending.slice(0, BATCH_SIZE);

  let computed = 0;
  let unavailable = 0;

  for (const trade of batch) {
    const openedAt = new Date(trade.opened_at);
    const closedAt = new Date(trade.closed_at!);
    const chartData = await fetchTradeCandles({ productId: trade.product_id, openedAt, closedAt });

    const result = chartData
      ? computeMfeMae(chartData.candles, {
          openedAtUnix: Math.floor(openedAt.getTime() / 1000),
          closedAtUnix: Math.floor(closedAt.getTime() / 1000),
          direction: trade.direction,
          entryWap: trade.entry_wap!,
          maxSize: trade.max_size,
          contractSize: trade.contract_multiplier,
        })
      : null;

    if (!result) {
      unavailable++;
      await supabase.from("trade_price_extremes").upsert(
        {
          user_id: user.id,
          trade_id: trade.id,
          unavailable_reason: chartData ? "Sin velas dentro de la ventana de la operación." : "Velas no disponibles desde Coinbase.",
          is_approximate: true,
        },
        { onConflict: "trade_id" },
      );
      continue;
    }

    computed++;
    await supabase.from("trade_price_extremes").upsert(
      {
        user_id: user.id,
        trade_id: trade.id,
        mfe_price: result.mfePrice,
        mae_price: result.maePrice,
        granularity_used: chartData!.granularityLabel,
        candle_source: "coinbase_candles",
        is_approximate: true,
        unavailable_reason: null,
      },
      { onConflict: "trade_id" },
    );
  }

  return NextResponse.json({
    error: null,
    computed,
    unavailable,
    remaining: Math.max(0, pending.length - batch.length),
  });
}
