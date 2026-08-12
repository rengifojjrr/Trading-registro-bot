import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { isDrawingTool, parseDrawingPoints } from "@/lib/chart-drawings";
import { createClient } from "@/lib/supabase/server";

/**
 * Backs the chart's click-to-draw interaction (components/trades/trade-chart.tsx).
 * A plain API route, not a Server Action -- Server Actions trigger Next.js's
 * automatic "refresh the current route" behavior after every call, which
 * re-renders trades/[tradeId]/page.tsx and hands TradeChart a brand new
 * `entry`/`exit` object (new reference, same values) on every drawing. A
 * regular fetch() has no such side effect.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const user = await requireUser();
  const { tradeId } = await params;

  if (!z.string().uuid().safeParse(tradeId).success) {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }
  const { tool, points } = (body ?? {}) as { tool?: unknown; points?: unknown };
  if (typeof tool !== "string" || !isDrawingTool(tool)) {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }
  const parsedPoints = parseDrawingPoints(tool, points);
  if (!parsedPoints) {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: "Operación no encontrada.", id: null }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("chart_drawings")
    .insert({ user_id: user.id, trade_id: tradeId, tool, points: parsedPoints })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "No se pudo guardar el dibujo.", id: null }, { status: 500 });
  }

  return NextResponse.json({ error: null, id: data.id });
}
