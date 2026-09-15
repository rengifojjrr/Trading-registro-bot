import "server-only";

import { fetchReactionCandles } from "@/lib/economic-calendar/candles";
import { horizonOf, measureReaction } from "@/lib/economic-calendar/market-reaction";
import { createAdminClient } from "@/lib/supabase/admin";

import { temasDe } from "./temas";
import { TradingViewNewsAdapter } from "./tradingview";
import type { MarketNewsPort } from "./types";

/**
 * Traer titulares y medir qué hizo el precio después de cada uno.
 *
 * Lo segundo es lo que hace que esto sirva de algo. Clasificar un titular como
 * «importante» por sus palabras es adivinar, y adivinar mal en los dos
 * sentidos: hay noticias con titular de catástrofe que el mercado ignora y
 * frases anodinas detrás de una caída del 3 %. La aplicación tiene velas de un
 * minuto y la hora exacta de publicación, así que puede **decir lo que pasó**
 * en vez de opinar sobre lo que debería haber pasado.
 *
 * El tema sí sale de reglas sobre el titular, y eso está bien porque es una
 * pregunta distinta: de qué va una noticia se lee en su título, cuánto importa
 * no.
 */

/** Cuántas páginas de titulares se piden como mucho. Cada una son 25. */
const PAGINAS = 4;

/**
 * Cuánto hay que esperar para poder medir la reacción a una hora.
 *
 * Con margen: pedir las velas de la hora siguiente a un titular de hace
 * sesenta y un minutos devuelve una vela y media, y de ahí sale una medición
 * que parece una cifra y no lo es.
 */
const MINUTOS_PARA_MEDIR = 75;

/** Cuántos titulares sin medir se miden por ejecución. Cada uno es una petición de velas. */
const MEDICIONES_POR_VUELTA = 12;

export interface ResultadoTitulares {
  traidos: number;
  nuevos: number;
  medidos: number;
  error: string | null;
}

export async function syncMarketNews(
  port: MarketNewsPort = new TradingViewNewsAdapter(),
): Promise<ResultadoTitulares> {
  const supabase = createAdminClient();

  let traidos = 0;
  let nuevos = 0;
  let cursor: string | null = null;

  try {
    for (let pagina = 0; pagina < PAGINAS; pagina += 1) {
      const respuesta = await port.fetchLatest({ cursor });
      if (respuesta.items.length === 0) break;
      traidos += respuesta.items.length;

      // El resumen es una petición por titular, así que sólo se pide para los
      // que aún no están guardados. Volver a pedirlo en cada sincronización
      // serían cien peticiones cada cuarto de hora para no cambiar nada.
      const ids = respuesta.items.map((i) => i.sourceNewsId);
      const { data: existentes } = await supabase
        .from("market_news")
        .select("source_news_id")
        .eq("source", "TRADINGVIEW")
        .in("source_news_id", ids);
      const yaEstan = new Set((existentes ?? []).map((e) => e.source_news_id));

      const filas = [];
      for (const item of respuesta.items) {
        const esNuevo = !yaEstan.has(item.sourceNewsId);
        if (esNuevo) nuevos += 1;

        const summary =
          esNuevo && item.storyId
            ? await port.fetchSummary(item.storyId).catch(() => null)
            : null;

        filas.push({
          source: "TRADINGVIEW",
          source_news_id: item.sourceNewsId,
          published_at: item.publishedAt.toISOString(),
          title: item.title,
          provider: item.provider,
          url: item.url,
          symbols: item.symbols,
          topics: temasDe(item.title),
          // Sólo se manda el resumen cuando se ha traído: en un `upsert`, una
          // columna ausente no se toca, y así refrescar la lista no borra el
          // resumen que ya estaba guardado.
          ...(summary ? { summary } : {}),
        });
      }

      const { error } = await supabase
        .from("market_news")
        .upsert(filas, { onConflict: "source,source_news_id" });
      if (error) return { traidos, nuevos, medidos: 0, error: "No se pudieron guardar los titulares." };

      cursor = respuesta.cursor;
      if (!cursor) break;
    }
  } catch (error) {
    console.error("[titulares] no se pudieron traer", error);
    return { traidos, nuevos, medidos: 0, error: "No se pudieron traer los titulares." };
  }

  const medidos = await medirPendientes(supabase);
  return { traidos, nuevos, medidos, error: null };
}

/**
 * Mide qué hizo el precio después de los titulares que aún no se han medido.
 *
 * De más reciente a más antiguo: lo de hoy es lo que se va a mirar. Y sólo los
 * que ya tienen una hora cumplida, porque la cifra de una hora medida sobre
 * cuarenta minutos de velas no es una cifra, es una trampa.
 */
async function medirPendientes(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const listoDesde = new Date(Date.now() - MINUTOS_PARA_MEDIR * 60_000).toISOString();

  const { data: pendientes } = await supabase
    .from("market_news")
    .select("id, published_at")
    .is("measured_at", null)
    .lte("published_at", listoDesde)
    .order("published_at", { ascending: false })
    .limit(MEDICIONES_POR_VUELTA);

  if (!pendientes || pendientes.length === 0) return 0;

  let medidos = 0;
  for (const fila of pendientes) {
    const at = new Date(fila.published_at);
    const velas = await fetchReactionCandles(at).catch(() => null);
    const reaccion = velas ? measureReaction(velas.candles, at) : null;
    const unaHora = reaccion ? horizonOf(reaccion, 60) : null;

    // Se marca como medido aunque no haya salido cifra. Sin esta marca, un
    // titular de una madrugada sin velas se volvería a intentar en cada
    // sincronización para siempre.
    const { error } = await supabase
      .from("market_news")
      .update({
        move_pct_1h: unaHora?.changePct ?? null,
        max_move_pct_1h: unaHora?.maxMovePct ?? null,
        measured_at: new Date().toISOString(),
      })
      .eq("id", fila.id);

    if (!error) medidos += 1;
  }

  return medidos;
}
