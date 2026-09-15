import { NextResponse } from "next/server";

import { borrarDibujo, moverDibujo } from "@/lib/chart-drawings/store";

/**
 * Mover y borrar un trazo del gráfico de una operación.
 *
 * El motivo de que sea una ruta de API y no una Server Action está en el
 * comentario de `../route.ts`. El trabajo lo hace `lib/chart-drawings/store.ts`,
 * compartido con el gráfico de una noticia.
 */

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string; drawingId: string }> },
) {
  const { tradeId, drawingId } = await params;
  const { error, estado } = await borrarDibujo({ tipo: "operacion", id: tradeId }, drawingId);
  return NextResponse.json({ error }, { status: estado });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string; drawingId: string }> },
) {
  const { tradeId, drawingId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { error, estado } = await moverDibujo(
    { tipo: "operacion", id: tradeId },
    drawingId,
    body ?? {},
  );
  return NextResponse.json({ error }, { status: estado });
}
