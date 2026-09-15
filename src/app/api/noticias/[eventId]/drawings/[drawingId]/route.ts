import { NextResponse } from "next/server";

import { borrarDibujo, moverDibujo } from "@/lib/chart-drawings/store";

/** Mover y borrar un trazo del gráfico de una publicación macro. */

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; drawingId: string }> },
) {
  const { eventId, drawingId } = await params;
  const { error, estado } = await borrarDibujo({ tipo: "evento", id: eventId }, drawingId);
  return NextResponse.json({ error }, { status: estado });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string; drawingId: string }> },
) {
  const { eventId, drawingId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { error, estado } = await moverDibujo({ tipo: "evento", id: eventId }, drawingId, body ?? {});
  return NextResponse.json({ error }, { status: estado });
}
