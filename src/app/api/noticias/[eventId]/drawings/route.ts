import { NextResponse } from "next/server";
import { z } from "zod";

import { crearDibujo } from "@/lib/chart-drawings/store";

/**
 * Lo que dibujas encima del gráfico de una publicación macro.
 *
 * La misma ruta que la de una operación, con el otro dueño. Marcar el rango
 * del primer impulso o la línea que el precio acabó respetando es justo lo que
 * uno hace mirando cómo reaccionó el mercado la última vez, y hasta ahora ese
 * gráfico era el único de la aplicación donde no se podía.
 */
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  const { error, id, estado } = await crearDibujo({ tipo: "evento", id: eventId }, body ?? {});
  return NextResponse.json({ error, id }, { status: estado });
}
