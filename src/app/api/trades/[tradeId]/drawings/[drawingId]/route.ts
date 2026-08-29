import { NextResponse } from "next/server";

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
 * See app/api/trades/[tradeId]/drawings/route.ts's file comment for why
 * this is a plain API route rather than a Server Action.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ tradeId: string; drawingId: string }> }) {
  const user = await requireUser();
  const { tradeId, drawingId } = await params;

  const supabase = await createClient();

  const { error } = await supabase
    .from("chart_drawings")
    .delete()
    .eq("id", drawingId)
    .eq("trade_id", tradeId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "No se pudo eliminar el dibujo." }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}

/**
 * Repositions an existing drawing. Only `points` moves -- the tool and
 * colour are fixed once created, so dragging a shape can never silently
 * turn it into a different kind of shape. `tool` still has to be sent so
 * the points payload can be validated against the right shape schema.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string; drawingId: string }> },
) {
  const user = await requireUser();
  const { tradeId, drawingId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { tool, points, style } = (body ?? {}) as {
    tool?: unknown;
    points?: unknown;
    style?: unknown;
  };
  if (typeof tool !== "string" || !isDrawingTool(tool)) {
    return NextResponse.json({ error: "Herramienta desconocida." }, { status: 400 });
  }
  const parsedPoints = parseDrawingPoints(tool, points);
  if (!parsedPoints) {
    return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
  }

  // El estilo es opcional al mover: arrastrar un dibujo cambia sus puntos y
  // no sus ajustes, y mandarlos en cada arrastre sería reescribirlos por nada.
  const parsedStyle = style === undefined ? null : parseDrawingStyle(tool, style);

  const supabase = await createClient();
  const { error } = await supabase
    .from("chart_drawings")
    .update({
      points: parsedPoints as unknown as Json,
      ...(parsedStyle
        ? { style: serialiseDrawingStyle(tool, parsedStyle) as Json }
        : {}),
    })
    .eq("id", drawingId)
    .eq("trade_id", tradeId)
    .eq("user_id", user.id)
    .eq("tool", tool);

  if (error) {
    return NextResponse.json({ error: "No se pudo mover el dibujo." }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}
