import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Full JSON export of everything the user owns: trades, the raw Coinbase
 * fills/orders they were reconstructed from, journal entries, comments,
 * tags, strategies and chart drawings.
 *
 * The trades CSV export on the Operaciones page only covers the computed
 * trade rows, which is the one part that can be rebuilt from raw data --
 * everything the user actually typed (journal, comments, drawings) had no
 * export path at all until now.
 *
 * Every query is RLS-scoped to the caller, with an explicit user_id filter
 * as defense in depth. Read-only: this never mutates anything.
 */
export async function GET() {
  const user = await requireUser();
  const supabase = await createClient();

  const [
    trades,
    tradeFills,
    rawFills,
    rawOrders,
    journalEntries,
    comments,
    strategies,
    tags,
    tradeTags,
    drawings,
    screenshots,
    settings,
    accounts,
  ] = await Promise.all([
    supabase.from("trades").select("*").eq("user_id", user.id),
    supabase.from("trade_fills").select("*").eq("user_id", user.id),
    supabase.from("raw_fills").select("*").eq("user_id", user.id),
    supabase.from("raw_orders").select("*").eq("user_id", user.id),
    supabase.from("journal_entries").select("*").eq("user_id", user.id),
    supabase.from("trade_comments").select("*").eq("user_id", user.id),
    supabase.from("strategies").select("*").eq("user_id", user.id),
    supabase.from("tags").select("*").eq("user_id", user.id),
    supabase.from("trade_tags").select("*").eq("user_id", user.id),
    supabase.from("chart_drawings").select("*").eq("user_id", user.id),
    // Storage paths only -- the image bytes live in a private bucket and
    // aren't inlined into a JSON file.
    supabase.from("trade_screenshots").select("*").eq("user_id", user.id),
    supabase.from("app_settings").select("*").eq("user_id", user.id),
    supabase.from("accounts").select("*").eq("user_id", user.id),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    schemaNote:
      "Respaldo completo de tus datos. Las capturas de pantalla se listan por ruta de almacenamiento, no incluyen la imagen en sí.",
    accounts: accounts.data ?? [],
    settings: settings.data ?? [],
    strategies: strategies.data ?? [],
    tags: tags.data ?? [],
    trades: trades.data ?? [],
    tradeFills: tradeFills.data ?? [],
    tradeTags: tradeTags.data ?? [],
    journalEntries: journalEntries.data ?? [],
    comments: comments.data ?? [],
    chartDrawings: drawings.data ?? [],
    screenshots: screenshots.data ?? [],
    rawFills: rawFills.data ?? [],
    rawOrders: rawOrders.data ?? [],
  };

  const filename = `respaldo-trading-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A backup is a point-in-time snapshot; caching it would hand back
      // stale data on the next download.
      "Cache-Control": "no-store",
    },
  });
}
