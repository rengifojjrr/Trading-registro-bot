import { NextResponse } from "next/server";

import { guardarPasoDelPlan } from "@/lib/journal/plan-store";

/**
 * Una respuesta del plan de antes de entrar.
 *
 * Ruta de API y no Server Action, por lo mismo que la encuesta del cierre: una
 * acción refresca la ruta actual al terminar, el panel vuelve a buscar el plan
 * pendiente, y el cuadro se desmontaría a media encuesta. Está escrito largo en
 * `lib/journal/survey-store.ts`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { error, estado } = await guardarPasoDelPlan(planId, body);
  return NextResponse.json({ error }, { status: estado });
}
