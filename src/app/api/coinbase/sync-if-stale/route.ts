import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { syncOnVisitIfStale } from "@/lib/sync/on-visit";

export const maxDuration = 60;

/**
 * Refresca los datos si lo que hay en pantalla ya está rancio.
 *
 * Lo llama la propia aplicación al abrirse, no una persona. La decisión de si
 * toca o no vive en el servidor a propósito: si la tomara el navegador, dos
 * pestañas abiertas dispararían dos sincronizaciones, y con el reloj del
 * cliente de por medio ni siquiera coincidirían en qué es «rancio».
 *
 * Con `{ force: true }` en el cuerpo se salta el intervalo configurado (no el
 * margen mínimo): es lo que manda la ficha de una operación cuando ve que los
 * contratos de Coinbase no son los de aquí.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  const env = serverEnv();

  if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY) {
    return NextResponse.json({ ran: false, reason: "sin-credenciales" });
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown } | null;
    force = body?.force === true;
  } catch {
    // Sin cuerpo, o sin JSON: la petición de siempre.
  }

  return NextResponse.json(await syncOnVisitIfStale(user.id, { force }));
}
