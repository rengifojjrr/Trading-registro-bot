import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { parseDrawingPoints } from "@/lib/chart-drawings";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Traerse los dibujos de la operación anterior del mismo producto.
 *
 * Un soporte que trazaste el martes sigue siendo el mismo soporte el
 * miércoles. Hasta ahora había que volver a dibujarlo, y a mano nunca cae en
 * el mismo precio -- así que la línea de la operación nueva y la de la vieja
 * decían cosas distintas sobre el mismo nivel.
 *
 * De la operación **anterior** y no de una que elijas: un selector obliga a
 * saber cuál era, y el 95% de las veces la respuesta es «la de antes». Si
 * hiciera falta traerse de otra, esto es lo que hay que ampliar.
 *
 * Copia, no comparte: los dibujos nuevos son suyos, y moverlos aquí no toca
 * los de la operación de origen.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const user = await requireUser();
  const { tradeId } = await params;

  if (!z.string().uuid().safeParse(tradeId).success) {
    return NextResponse.json({ error: "Datos inválidos.", copiados: 0 }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: actual } = await supabase
    .from("trades")
    .select("id, product_id, opened_at")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actual) {
    return NextResponse.json({ error: "Operación no encontrada.", copiados: 0 }, { status: 404 });
  }

  // La anterior del mismo producto: otro instrumento tiene otros precios, y
  // un soporte de Bitcoin sobre un gráfico de Ethereum no significa nada.
  const { data: anterior } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", actual.product_id)
    .lt("opened_at", actual.opened_at)
    .is("orphaned_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anterior) {
    return NextResponse.json({
      error: "No hay ninguna operación anterior de este producto.",
      copiados: 0,
    });
  }

  const { data: origen } = await supabase
    .from("chart_drawings")
    .select("tool, points, style, color")
    .eq("trade_id", anterior.id)
    .eq("user_id", user.id);

  if (!origen || origen.length === 0) {
    return NextResponse.json({ error: "La operación anterior no tiene dibujos.", copiados: 0 });
  }

  // Se validan al copiar y no se confía en que lo guardado siga siendo válido:
  // una herramienta puede haberse retirado del catálogo desde que se dibujó, y
  // copiar algo que ya no se sabe pintar sería mover el problema de sitio.
  const filas = origen.flatMap((d) => {
    const puntos = parseDrawingPoints(d.tool, d.points);
    if (!puntos) return [];
    return [
      {
        user_id: user.id,
        trade_id: tradeId,
        tool: d.tool,
        points: puntos as unknown as Json,
        style: (d.style ?? {}) as Json,
        color: d.color,
      },
    ];
  });

  if (filas.length === 0) {
    return NextResponse.json({
      error: "Los dibujos de la operación anterior usan herramientas que ya no existen.",
      copiados: 0,
    });
  }

  const { error } = await supabase.from("chart_drawings").insert(filas);
  if (error) {
    return NextResponse.json(
      { error: "No se pudieron copiar los dibujos.", copiados: 0 },
      { status: 500 },
    );
  }

  return NextResponse.json({ error: null, copiados: filas.length });
}
