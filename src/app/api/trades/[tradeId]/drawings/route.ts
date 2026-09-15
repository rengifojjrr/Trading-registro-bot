import { NextResponse } from "next/server";
import { z } from "zod";

import { crearDibujo } from "@/lib/chart-drawings/store";

/**
 * Lo que dibujas encima del gráfico de una operación.
 *
 * Una ruta de API y no una Server Action: las Server Actions refrescan la ruta
 * actual después de cada llamada, lo que vuelve a renderizar
 * `trades/[tradeId]/page.tsx` y le pasa a `TradeChart` objetos `entry`/`exit`
 * nuevos -- misma información, otra referencia -- con cada trazo. Un `fetch`
 * normal no tiene ese efecto.
 *
 * Lo que hace el trabajo vive en `lib/chart-drawings/store.ts`, que es el
 * mismo que atiende a las noticias: el gráfico es el mismo y guardar un trazo
 * también debería serlo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  if (!z.uuid().safeParse(tradeId).success) {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos.", id: null }, { status: 400 });
  }

  const { error, id, estado } = await crearDibujo({ tipo: "operacion", id: tradeId }, body ?? {});
  return NextResponse.json({ error, id }, { status: estado });
}
