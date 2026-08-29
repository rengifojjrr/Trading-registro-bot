import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import {
  isDrawingTool,
  parseDrawingPoints,
  parseDrawingStyle,
  serialiseDrawingStyle,
} from "@/lib/chart-drawings";
import type { Json } from "@/types/database";
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
  const { tool, points, style } = (body ?? {}) as {
    tool?: unknown;
    points?: unknown;
    style?: unknown;
  };
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

  // El estilo se sanea antes de guardarse y se guarda ya reducido a lo que se
  // aparta de fábrica: así lo que entra en la tabla es exactamente lo que el
  // lector espera encontrar, sin pasar por un formato intermedio.
  const parsedStyle = parseDrawingStyle(tool, style);
  const styleToStore = parsedStyle ? serialiseDrawingStyle(tool, parsedStyle) : {};

  const { data, error } = await supabase
    .from("chart_drawings")
    .insert({
      user_id: user.id,
      trade_id: tradeId,
      tool,
      // `DrawingPoint[]` es estructuralmente un `Json[]`, pero TypeScript no lo
      // acepta sin firma de índice. El casteo está aquí, en una línea y con el
      // motivo escrito, en vez de aflojar el tipo de `Json`.
      points: parsedPoints as unknown as Json,
      style: styleToStore as Json,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "No se pudo guardar el dibujo.", id: null }, { status: 500 });
  }

  return NextResponse.json({ error: null, id: data.id });
}
