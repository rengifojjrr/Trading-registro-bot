import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Mover el stop y el objetivo desde el propio gráfico.
 *
 * Los dos niveles ya se pintaban, pero eran de sólo lectura: venían del diario
 * y para cambiarlos había que salir del gráfico, abrir el formulario, escribir
 * un número y volver. Arrastrar la raya es la forma natural de decir «el stop
 * va aquí», y ahora eso escribe donde siempre ha vivido -- `journal_entries`,
 * no una tabla nueva -- para que el diario, el análisis de riesgo y el gráfico
 * sigan hablando del mismo número.
 *
 * Ruta de API y no Server Action por lo mismo que los dibujos: una Server
 * Action refresca la ruta entera después de cada llamada, y eso en mitad de un
 * arrastre reconstruye el gráfico bajo el dedo.
 */
const bodySchema = z.object({
  // `null` significa quitar el nivel, que es distinto de no mandarlo.
  stopLoss: z.number().finite().positive().nullable().optional(),
  takeProfit: z.number().finite().positive().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const user = await requireUser();
  const { tradeId } = await params;

  if (!z.string().uuid().safeParse(tradeId).success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  if (parsed.data.stopLoss === undefined && parsed.data.takeProfit === undefined) {
    return NextResponse.json({ error: "No se pidió ningún cambio." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: "Operación no encontrada." }, { status: 404 });
  }

  const cambios: Record<string, number | null> = {};
  if (parsed.data.stopLoss !== undefined) cambios.stop_loss_price = parsed.data.stopLoss;
  if (parsed.data.takeProfit !== undefined) cambios.take_profit_price = parsed.data.takeProfit;

  // `upsert` y no `update`: la primera vez que se arrastra un nivel puede que
  // la operación todavía no tenga entrada de diario, y ahí un update no
  // afectaría a ninguna fila y se perdería el cambio en silencio.
  const { error } = await supabase
    .from("journal_entries")
    .upsert({ trade_id: tradeId, user_id: user.id, ...cambios }, { onConflict: "trade_id" });

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar el nivel." }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}
