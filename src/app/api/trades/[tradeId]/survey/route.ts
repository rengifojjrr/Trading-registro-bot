import { NextResponse } from "next/server";

import { guardarPaso } from "@/lib/journal/survey-store";

/**
 * Una respuesta de la encuesta del cierre.
 *
 * **Ruta de API y no Server Action, y eso es el arreglo de un fallo concreto.**
 * Una Server Action refresca la ruta actual al terminar; la ruta actual es el
 * panel de trading, que vuelve a preguntar qué operación toca encuestar. Al
 * contestar «¿cómo estabas?» la operación pasa a contar como apuntada, deja de
 * ser candidata, y el cuadro se desmontaba a media encuesta: se cerraba sola
 * antes de acabarla. Un `fetch` normal no tiene ese efecto.
 *
 * Es la misma razón, escrita en el mismo sitio, por la que los dibujos del
 * gráfico son una ruta y no una acción.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { error, estado } = await guardarPaso(tradeId, body);
  return NextResponse.json({ error }, { status: estado });
}
