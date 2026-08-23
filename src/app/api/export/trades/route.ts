import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchTradesForTable } from "@/lib/analytics/queries";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { csvFilename, tradesToCsv } from "@/lib/csv/export-trades";

/**
 * Las operaciones filtradas, en CSV.
 *
 * Toma los mismos parámetros de la URL que la tabla, así que exporta
 * exactamente lo que estás mirando. Si acabas de filtrar agosto, lo que baja
 * es agosto -- que es lo que espera cualquiera, y lo contrario de exportar
 * todo el histórico y dejarte filtrarlo otra vez en la hoja de cálculo.
 *
 * La única salida que había era la copia de seguridad: un volcado JSON
 * pensado para restaurar, no para mirar.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const supabase = await createClient();

  // La misma zona horaria con la que se filtró en pantalla: sin ella, «agosto»
  // en la tabla y «agosto» en el CSV serían dos rangos distintos por unas
  // horas, y las operaciones de los bordes bailarían entre uno y otro.
  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const filters = parseTradeFilters(searchParams, settings?.timezone || "UTC");

  const trades = await fetchTradesForTable(filters);
  const csv = tradesToCsv(trades);

  return new Response(
    // El BOM no es decorativo: sin él, Excel en Windows abre un CSV UTF-8
    // como Latin-1 y cualquier acento sale roto. Los lectores que no lo
    // necesitan lo ignoran.
    `﻿${csv}`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename({ from: filters.dateFrom, to: filters.dateTo })}"`,
        // Un export es una foto de este momento; cachearlo devolvería la de
        // ayer sin que nada lo indique.
        "Cache-Control": "no-store",
      },
    },
  );
}
