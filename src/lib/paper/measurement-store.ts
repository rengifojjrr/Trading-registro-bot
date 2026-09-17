import "server-only";

import { esGranularidadPublica, velasHistoricas } from "@/lib/coinbase/public-candles";
import { createAdminClient } from "@/lib/supabase/admin";
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
 *
 * **Lo medido no es de nadie.** La estrategia es de la biblioteca, las velas
 * son las públicas de Coinbase y el motor es determinista, así que dos
 * personas midiendo lo mismo el mismo día obtienen el mismo número. La tabla
 * es dato de referencia compartido --sin `user_id`, como `products`-- y por
 * eso se lee sin sesión y se escribe con el cliente de servicio. Ver
 * `20260917210000_lo_medido_no_es_de_nadie.sql`.
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

/**
 * Cuándo una medición se considera vieja.
 *
 * Una semana, y no un día: lo que se mide son diez años de velas diarias o
 * doce días de velas de cinco minutos, y ninguna de las dos cifras se mueve de
 * un día para otro lo bastante como para justificar ciento treinta peticiones
 * a un servicio ajeno.
 */
const DIAS_HASTA_QUE_CADUCA = 7;

/** Lo medido de una estrategia, ya listo para la ficha. */
export interface MedicionGuardada extends Medicion {
  slug: string;
  ventana: string;
  medidaEl: string;
}

type FilaMedicion = {
  slug: string;
  pnl_pct: string | number;
  dd_pct: string | number;
  trades: number;
  profit_factor: string | number | null;
  market: string;
  timeframe: string;
  velas: number;
  desde: string;
  hasta: string;
  comision_pct: string | number;
  measured_at: string;
};

function aMedicionGuardada(fila: FilaMedicion): MedicionGuardada {
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

  return {
    ...medicion,
    slug: fila.slug,
    ventana: ventanaEnPalabras(medicion, fila.market, fila.timeframe),
    medidaEl: fila.measured_at,
  };
}

/** Todo lo que hay medido, por slug. */
export async function medicionesGuardadas(): Promise<Map<string, MedicionGuardada>> {
  const supabase = await createClient();
  const { data } = await supabase.from("strategy_measurements").select("*");

  return new Map((data ?? []).map((fila) => [fila.slug, aMedicionGuardada(fila)]));
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

  const medidaEl = new Date().toISOString();

  // Con el cliente de servicio: la tabla no tiene política de escritura, a
  // propósito. Una cifra de rentabilidad es lo que alguien mira para decidir
  // si pone dinero, y no puede poder escribirse desde el navegador.
  await createAdminClient()
    .from("strategy_measurements")
    .upsert(
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
        measured_at: medidaEl,
      },
      { onConflict: "slug" },
    );

  return {
    ...base,
    fallo: null,
    medicion: {
      ...medicion,
      slug: estrategia.slug,
      ventana: ventanaEnPalabras(medicion, estrategia.mercado, estrategia.temporalidad),
      medidaEl,
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

/**
 * Mide lo que falte, de a poco, sin que nadie lo pida.
 *
 * Esto es lo que hace que la pantalla llegue con los números puestos. Antes la
 * única forma de llenar la tabla era que alguien abriera la biblioteca y
 * pulsara un botón, así que lo que se veía hasta que alguien se acordara eran
 * once «Sin medir» de veintidós.
 *
 * Lo llama el mismo reloj que corre el simulador, después del ciclo. De ahí el
 * tope: la ruta tiene sesenta segundos y lo primero que tiene que hacer es
 * operar. Dos estrategias por ciclo son veinticuatro peticiones más, y a cinco
 * minutos por ciclo la biblioteca entera queda medida en media hora sin que
 * ningún ciclo se alargue de forma apreciable.
 *
 * Primero las que no tienen nada y después las caducadas, porque un hueco se
 * nota --la ficha dice «Sin medir»-- y una cifra de hace ocho días no.
 */
export async function medirLoQueFalte(tope = 2): Promise<ResultadoDeMedir[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("strategy_measurements").select("slug, measured_at");

  const medidoEn = new Map((data ?? []).map((f) => [f.slug, Date.parse(f.measured_at)]));
  const caduca = Date.now() - DIAS_HASTA_QUE_CADUCA * 24 * 60 * 60 * 1000;

  const medibles = BIBLIOTECA.filter((e) => esGranularidadPublica(e.temporalidad));
  const sinNada = medibles.filter((e) => e.medido === null && !medidoEn.has(e.slug));
  const caducadas = medibles.filter((e) => {
    const cuando = medidoEn.get(e.slug);
    return cuando !== undefined && cuando < caduca;
  });

  const porMedir = [...sinNada, ...caducadas].slice(0, tope);
  if (porMedir.length === 0) return [];

  const resultados: ResultadoDeMedir[] = [];
  for (const estrategia of porMedir) {
    const resultado = await medirYGuardar(estrategia);
    resultados.push(resultado);

    // Si una falla se para aquí. `SIN_HISTORICO` con un producto que Coinbase
    // lista desde hace años no significa «esta estrategia no se puede medir»,
    // significa que Coinbase no está contestando -- `velasHistoricas` devuelve
    // vacío cuando falla, no lanza --, y entonces la siguiente va a fallar
    // igual. Insistir es pedirle más a un servicio que ya no puede. El ciclo
    // siguiente vuelve a intentarlo cinco minutos después.
    if (resultado.fallo !== null) break;
  }
  return resultados;
}
