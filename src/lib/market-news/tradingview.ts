import type { MarketNewsItem, MarketNewsPort } from "./types";

/**
 * Los titulares de TradingView.
 *
 * Dos endpoints públicos sin documentar, comprobados el 2026-09-15:
 *
 * - `news-mediator.tradingview.com/news-flow/v2/news` da la lista, 25 por
 *   página, con un `cursor` opaco para seguir hacia atrás. Dos páginas cubren
 *   unos ocho días.
 * - `news-headlines.tradingview.com/v3/story` da el cuerpo de uno. Es **otro
 *   host**: el mismo camino bajo `news-mediator` devuelve 404, y pedirle la
 *   historia al de la lista sin `filter` devuelve 400. Queda escrito porque
 *   costó encontrarlo.
 *
 * Los dos exigen `Origin` y `Referer` de tradingview.com. Sin ellos no
 * responden, igual que el del calendario.
 *
 * Se lee **a la defensiva**: es un endpoint que nadie nos ha prometido
 * mantener, así que un titular al que le falte algo se descarta y los demás
 * pasan. Caerse entera porque una de veinticinco noticias venga rara sería
 * cambiar una pantalla incompleta por ninguna pantalla.
 */

const LISTA = "https://news-mediator.tradingview.com/news-flow/v2/news";
const HISTORIA = "https://news-headlines.tradingview.com/v3/story";

const CABECERAS = {
  Origin: "https://es.tradingview.com",
  Referer: "https://es.tradingview.com/",
  "User-Agent": "Mozilla/5.0",
};

/** El símbolo con el que la fuente etiqueta a Bitcoin. */
export const SIMBOLO = "BITSTAMP:BTCUSD";

export interface RawNews {
  id?: unknown;
  title?: unknown;
  published?: unknown;
  provider?: { name?: unknown } | null;
  link?: unknown;
  relatedSymbols?: unknown;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * Un titular de la fuente al de la aplicación, o null si le falta lo esencial.
 *
 * Lo esencial es el identificador, el título y la fecha: sin identificador no
 * se puede deduplicar, sin fecha no se puede medir qué hizo el precio después
 * -- que es la mitad del valor de todo esto -- y sin título no hay nada que
 * enseñar.
 */
export function mapRawNews(raw: RawNews): MarketNewsItem | null {
  const id = texto(raw.id);
  const title = texto(raw.title);
  const published = typeof raw.published === "number" ? raw.published : null;
  if (!id || !title || published === null || !Number.isFinite(published)) return null;

  // La fuente da segundos. Un valor en milisegundos daría el año 58.000 y se
  // colaría como una noticia del futuro que nunca se mide.
  const publishedAt = new Date(published * 1000);
  if (Number.isNaN(publishedAt.getTime())) return null;

  const symbols = Array.isArray(raw.relatedSymbols)
    ? raw.relatedSymbols
        .map((s) => (typeof s === "object" && s !== null ? texto((s as { symbol?: unknown }).symbol) : null))
        .filter((s): s is string => s !== null)
    : [];

  return {
    sourceNewsId: id,
    publishedAt,
    title,
    provider: texto(raw.provider?.name),
    url: texto(raw.link),
    storyId: id,
    symbols,
  };
}

/**
 * El cuerpo viene como un árbol de nodos y no como texto.
 *
 * Se aplana quedándose con las hojas de texto. `shortDescription` ya trae un
 * resumen hecho, así que el árbol sólo hace falta cuando falta aquél.
 */
function aplanar(nodo: unknown, salida: string[], profundidad = 0): void {
  if (profundidad > 8 || salida.length > 40) return;
  if (typeof nodo === "string") {
    if (nodo.trim() !== "") salida.push(nodo.trim());
    return;
  }
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) aplanar(hijo, salida, profundidad + 1);
    return;
  }
  if (typeof nodo === "object" && nodo !== null) {
    aplanar((nodo as { children?: unknown }).children, salida, profundidad + 1);
  }
}

export class TradingViewNewsAdapter implements MarketNewsPort {
  constructor(private readonly symbol: string = SIMBOLO) {}

  async fetchLatest({ cursor }: { cursor?: string | null }) {
    const url = new URL(LISTA);
    url.searchParams.append("filter", "lang:es");
    url.searchParams.append("filter", `symbol:${this.symbol}`);
    url.searchParams.set("client", "overview");
    url.searchParams.set("streaming", "false");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: CABECERAS, cache: "no-store" });
    if (!res.ok) throw new Error(`Los titulares respondieron ${res.status}`);

    const body = (await res.json()) as { items?: unknown; pagination?: { cursor?: unknown } };
    if (!Array.isArray(body.items)) throw new Error("Los titulares devolvieron algo que no se reconoce");

    const items: MarketNewsItem[] = [];
    for (const raw of body.items) {
      const item = mapRawNews(raw as RawNews);
      if (item) items.push(item);
    }

    return { items, cursor: texto(body.pagination?.cursor) };
  }

  async fetchSummary(storyId: string): Promise<string | null> {
    const url = new URL(HISTORIA);
    url.searchParams.set("id", storyId);
    url.searchParams.set("lang", "es");

    // Una hora de caché: el cuerpo de una noticia publicada no cambia, y si
    // cambiara, lo que importa aquí -- de qué iba -- no.
    const res = await fetch(url, { headers: CABECERAS, next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const body = (await res.json()) as { shortDescription?: unknown; astDescription?: unknown };
    const corto = texto(body.shortDescription);
    if (corto) return corto;

    const trozos: string[] = [];
    aplanar(body.astDescription, trozos);
    const largo = trozos.join(" ").trim();
    return largo === "" ? null : largo.slice(0, 1000);
  }
}
