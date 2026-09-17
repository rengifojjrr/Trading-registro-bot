/**
 * Mide las estrategias de la biblioteca y guarda el resultado.
 *
 *     npx tsx scripts/medir-biblioteca.ts
 *     npx tsx scripts/medir-biblioteca.ts --todas   # también las ya medidas
 *
 * Lo mismo que hace el reloj cada cinco minutos (`medirLoQueFalte`) pero de
 * una vez y sin esperar a que el despliegue tenga esa versión. Sirve para dos
 * cosas: llenar la tabla la primera vez, y volver a medirlo todo a mano
 * después de tocar el motor de backtest o los costes.
 *
 * Es re-ejecutable: una estrategia ya medida se pisa con la medición nueva.
 *
 * Por qué no importa `measurement-store.ts`: aquel es `server-only` --se apoya
 * en el cliente de servidor de Next-- y esto corre en un `tsx` suelto. Lo que
 * decide qué significa medir, que es lo que importa que no se duplique, vive
 * en `medir-estrategia.ts` y es lo que se usa aquí.
 */
import { createClient } from "@supabase/supabase-js";

import { velasHistoricas, esGranularidadPublica } from "../src/lib/coinbase/public-candles";
import { medirSobreVelas } from "../src/lib/paper/medir-estrategia";
import { BIBLIOTECA } from "../src/lib/paper/strategy-library";

/** El mismo que usa `measurement-store.ts`; ver el comentario de allí. */
const VELAS_PARA_MEDIR = 3600;

function entorno(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en el entorno.`);
  return valor;
}

async function main() {
  const todas = process.argv.includes("--todas");

  const supabase = createClient(
    entorno("NEXT_PUBLIC_SUPABASE_URL"),
    entorno("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const { data: yaMedidas, error } = await supabase
    .from("strategy_measurements")
    .select("slug");
  if (error) throw new Error(`No se pudo leer lo ya medido: ${error.message}`);

  const guardadas = new Set((yaMedidas ?? []).map((f) => f.slug as string));

  // `esGranularidadPublica` es un guard, y filtrando el array entero TypeScript
  // no puede estrecharle el tipo a `temporalidad` dentro del bucle. Se estrecha
  // aquí, en el mapa, y así `velasHistoricas` recibe lo que pide.
  const pendientes = BIBLIOTECA.flatMap((e) => {
    if (!esGranularidadPublica(e.temporalidad)) return [];
    // `medido` no null son las del estudio de agosto: ya tienen cifras en la
    // ficha y no hace falta volver a sacarlas.
    if (!todas && (e.medido !== null || guardadas.has(e.slug))) return [];
    return [{ ...e, temporalidad: e.temporalidad }];
  });

  if (pendientes.length === 0) {
    console.log("No queda ninguna por medir.");
    return;
  }

  console.log(`Midiendo ${pendientes.length} estrategias sobre histórico real…\n`);

  let medidas = 0;
  const fallidas: string[] = [];

  // En serie: cada una encadena hasta doce peticiones a la API pública de
  // Coinbase, y todas a la vez son ciento treinta contra un servicio ajeno.
  for (const estrategia of pendientes) {
    const velas = await velasHistoricas(
      estrategia.mercado,
      estrategia.temporalidad,
      VELAS_PARA_MEDIR,
    );

    const medicion = medirSobreVelas(estrategia, velas);
    if (!medicion) {
      fallidas.push(estrategia.slug);
      console.log(`  ✗ ${estrategia.slug}: sin histórico suficiente (${velas.length} velas)`);
      continue;
    }

    const { error: errorEscritura } = await supabase.from("strategy_measurements").upsert(
      {
        slug: estrategia.slug,
        pnl_pct: medicion.pnlPct,
        dd_pct: medicion.ddPct,
        trades: medicion.trades,
        profit_factor: medicion.profitFactor,
        market: estrategia.mercado,
        timeframe: estrategia.temporalidad,
        velas: medicion.velas,
        desde: medicion.desde,
        hasta: medicion.hasta,
        comision_pct: medicion.comisionPct,
        measured_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );

    if (errorEscritura) {
      fallidas.push(estrategia.slug);
      console.log(`  ✗ ${estrategia.slug}: ${errorEscritura.message}`);
      continue;
    }

    medidas += 1;
    const pf = medicion.profitFactor === null ? "--" : medicion.profitFactor.toFixed(2);
    console.log(
      `  ✓ ${estrategia.slug.padEnd(30)} ` +
        `${medicion.pnlPct >= 0 ? "+" : ""}${medicion.pnlPct.toFixed(1)}%  ` +
        `dd ${medicion.ddPct.toFixed(1)}%  ` +
        `${String(medicion.trades).padStart(4)} ops  pf ${pf}  ` +
        `(${medicion.velas} velas)`,
    );
  }

  console.log(`\nMedidas ${medidas} de ${pendientes.length}.`);
  if (fallidas.length > 0) console.log(`Sin medir: ${fallidas.join(", ")}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
