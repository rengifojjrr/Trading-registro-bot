import "server-only";

import { esGranularidadPublica, velasHistoricas } from "@/lib/coinbase/public-candles";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { medirSobreVelas, ventanaEnPalabras, type Medicion } from "./medir-estrategia";
import { BIBLIOTECA, type EstrategiaDeLaBiblioteca } from "./strategy-library";

/**
 * Leer y escribir las mediciones de la biblioteca.
 *
 * Separado de `medir-estrategia.ts` por lo de siempre en este proyecto: allí
 * está la regla --qué significa medir-- y se prueba con velas escritas a mano;
 * aquí está de dónde salen los datos y dónde acaban, que no se puede probar
 * sin una base y sin red.
 */

/**
 * Cuántas velas se piden para medir.
 *
 * Doce páginas de trescientas, que es el tope de `velasHistoricas`. Para una
 * estrategia diaria son diez años y para una de cinco minutos doce días. Que
 * la ventana sea tan distinta según la temporalidad no es un defecto que
 * arreglar sino un hecho del mercado -- y por eso la ventana se guarda con la
 * medición y se enseña junto a la cifra.
 */
const VELAS_PARA_MEDIR = 3600;

/** Lo medido de una estrategia, ya listo para la ficha. */
export interface MedicionGuardada extends Medicion {
  slug: string;
  ventana: string;
  medidaEl: string;
}

/** Todo lo que este usuario tiene medido, por slug. */
export async function medicionesGuardadas(): Promise<Map<string, MedicionGuardada>> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("strategy_measurements")
    .select("*")
    .eq("user_id", user.id);

  const porSlug = new Map<string, MedicionGuardada>();
  for (const fila of data ?? []) {
    const medicion: Medicion = {
      pnlPct: Number(fila.pnl_pct),
      ddPct: Number(fila.dd_pct),
      trades: fila.trades,
      profitFactor: fila.profit_factor === null ? null : Number(fila.profit_factor),
      velas: fila.velas,
      desde: fila.desde,
      hasta: fila.hasta,
      comisionPct: Number(fila.comision_pct),
    };

    porSlug.set(fila.slug, {
      ...medicion,
      slug: fila.slug,
      ventana: ventanaEnPalabras(medicion, fila.market, fila.timeframe),
      medidaEl: fila.measured_at,
    });
  }

  return porSlug;
}

/** Por qué una estrategia no se pudo medir, dicho para la pantalla. */
export type FalloAlMedir = "TEMPORALIDAD_NO_DISPONIBLE" | "SIN_HISTORICO";

export interface ResultadoDeMedir {
  slug: string;
  nombre: string;
  medicion: MedicionGuardada | null;
  fallo: FalloAlMedir | null;
}

/**
 * Mide una estrategia y guarda el resultado.
 *
 * Guarda **sólo si midió**. Una estrategia que se queda sin histórico sigue
 * saliendo como «sin medir», que es cierto, en vez de guardar unas cifras
 * sacadas de cuatro velas.
 */
export async function medirYGuardar(
  estrategia: EstrategiaDeLaBiblioteca,
): Promise<ResultadoDeMedir> {
  const base = { slug: estrategia.slug, nombre: estrategia.nombre };

  if (!esGranularidadPublica(estrategia.temporalidad)) {
    return { ...base, medicion: null, fallo: "TEMPORALIDAD_NO_DISPONIBLE" };
  }

  const velas = await velasHistoricas(
    estrategia.mercado,
    estrategia.temporalidad,
    VELAS_PARA_MEDIR,
  );

  const medicion = medirSobreVelas(estrategia, velas);
  if (!medicion) return { ...base, medicion: null, fallo: "SIN_HISTORICO" };

  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("strategy_measurements").upsert(
    {
      user_id: user.id,
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
    { onConflict: "user_id,slug" },
  );

  return {
    ...base,
    fallo: null,
    medicion: {
      ...medicion,
      slug: estrategia.slug,
      ventana: ventanaEnPalabras(medicion, estrategia.mercado, estrategia.temporalidad),
      medidaEl: new Date().toISOString(),
    },
  };
}

/**
 * Mide varias, una detrás de otra.
 *
 * En serie y no en paralelo a propósito: cada una encadena hasta doce
 * peticiones a la API pública de Coinbase, y once estrategias a la vez son
 * ciento treinta y dos llamadas simultáneas contra un servicio que no es
 * nuestro. En serie tarda más y no le hace eso a nadie.
 */
export async function medirVarias(slugs: string[]): Promise<ResultadoDeMedir[]> {
  const resultados: ResultadoDeMedir[] = [];

  for (const slug of slugs) {
    const estrategia = BIBLIOTECA.find((e) => e.slug === slug);
    if (!estrategia) continue;
    resultados.push(await medirYGuardar(estrategia));
  }

  return resultados;
}

/** Las que no tienen cifras: ni del estudio de agosto ni medidas aquí. */
export function slugsSinMedir(guardadas: Map<string, MedicionGuardada>): string[] {
  return BIBLIOTECA.filter((e) => e.medido === null && !guardadas.has(e.slug)).map((e) => e.slug);
}
