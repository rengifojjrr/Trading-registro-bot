import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
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
