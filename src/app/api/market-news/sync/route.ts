import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { syncMarketNews } from "@/lib/market-news/sync";

/**
 * Trae los titulares nuevos y mide qué hizo el precio con los que ya tocaba
 * medir.
 *
 * Lo llama la pantalla al abrirse, igual que el calendario y por el mismo
 * motivo: en el plan Hobby de Vercel las tareas programadas corren una vez al
 * día, y unos titulares que se enteran mañana de lo que pasó esta tarde no
 * sirven para lo que existen.
 *
 * Tarda más que el calendario porque cada titular nuevo pide su resumen y cada
 * medición pide velas, así que va con el minuto entero de margen.
 */
export const maxDuration = 60;

export async function POST() {
  // Los titulares son datos de referencia y no de nadie, pero refrescarlos
  // sale a internet: sin sesión no se dispara.
  await requireUser();

  return NextResponse.json(await syncMarketNews());
}
