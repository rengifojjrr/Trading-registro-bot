import { NextResponse } from "next/server";

import { guardarFotoDelPlan } from "@/lib/journal/plan-store";

/**
 * La foto del gráfico que acompaña al plan.
 *
 * Va por su propia ruta y no con el resto de respuestas porque viaja distinto:
 * las demás son JSON de unos pocos bytes y ésta son megas de imagen en un
 * `multipart`. Mezclarlas obligaría a que cada «he tocado un 4» pasara por el
 * mismo camino que una subida de cinco megas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido.", ruta: null, url: null }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Elige una imagen.", ruta: null, url: null }, { status: 400 });
  }

  const { error, ruta, url, estado } = await guardarFotoDelPlan(planId, file);
  return NextResponse.json({ error, ruta, url }, { status: estado });
}
