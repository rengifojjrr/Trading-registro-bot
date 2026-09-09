import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { syncEconomicCalendar } from "@/lib/economic-calendar/sync";

/**
 * Refresca el calendario económico si lo guardado ya está viejo.
 *
 * Lo llama la propia pantalla al abrirse, igual que la sincronización de
 * Coinbase: en el plan Hobby de Vercel las tareas programadas sólo corren una
 * vez al día, y un calendario que se entera de que salió el IPC a la mañana
 * siguiente no sirve para lo que existe.
 *
 * La decisión de si toca vive en el servidor a propósito -- dos pestañas
 * abiertas no deben disparar dos sincronizaciones.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  // Los eventos son datos de referencia y no de nadie, pero refrescarlos sale
  // a internet: sin sesión no se dispara.
  await requireUser();

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown } | null;
    force = body?.force === true;
  } catch {
    // Sin cuerpo, la petición de siempre.
  }

  return NextResponse.json(await syncEconomicCalendar({ force }));
}
