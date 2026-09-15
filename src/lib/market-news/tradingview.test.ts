import { describe, expect, it } from "vitest";

import { mapRawNews, type RawNews } from "./tradingview";

/**
 * El endpoint no está documentado y nadie nos ha prometido mantenerlo, así que
 * lo que se prueba es que **leerlo mal no rompa la pantalla**: un titular al
 * que le falte lo esencial se descarta y los demás pasan.
 *
 * El caso completo es la respuesta real del 2026-09-15, tal cual.
 */

const REAL: RawNews = {
  id: "cointelegraph:8007abe6b09cd:0",
  title: "El Senado de EE. UU. no logra avanzar la Ley CLARITY",
  published: 1789498011,
  provider: { name: "Cointelegraph" },
  link: "https://cointelegraph.es/news/us-senate-fails-to-advance-clarity-act",
  relatedSymbols: [{ symbol: "BITSTAMP:BTCUSD" }],
};

describe("mapRawNews", () => {
  it("lee el titular real de la fuente", () => {
    const item = mapRawNews(REAL);
    expect(item).not.toBeNull();
    expect(item?.sourceNewsId).toBe("cointelegraph:8007abe6b09cd:0");
    expect(item?.title).toBe("El Senado de EE. UU. no logra avanzar la Ley CLARITY");
    expect(item?.provider).toBe("Cointelegraph");
    expect(item?.symbols).toEqual(["BITSTAMP:BTCUSD"]);
  });

  it("la fecha viene en segundos, no en milisegundos", () => {
    // 1789498011 s es septiembre de 2026; leído como ms sería enero de 1970.
    expect(mapRawNews(REAL)?.publishedAt.toISOString()).toBe("2026-09-15T18:46:51.000Z");
  });

  it("sin identificador no se puede deduplicar, así que se descarta", () => {
    expect(mapRawNews({ ...REAL, id: undefined })).toBeNull();
    expect(mapRawNews({ ...REAL, id: "   " })).toBeNull();
  });

  it("sin fecha no se puede medir qué hizo el precio, que es la mitad del valor", () => {
    expect(mapRawNews({ ...REAL, published: undefined })).toBeNull();
    expect(mapRawNews({ ...REAL, published: Number.NaN })).toBeNull();
  });

  it("sin título no hay nada que enseñar", () => {
    expect(mapRawNews({ ...REAL, title: "" })).toBeNull();
  });

  it("lo que falta y no es esencial se queda en null, no descarta el titular", () => {
    const item = mapRawNews({ ...REAL, provider: null, link: undefined, relatedSymbols: undefined });
    expect(item).not.toBeNull();
    expect(item?.provider).toBeNull();
    expect(item?.url).toBeNull();
    expect(item?.symbols).toEqual([]);
  });

  it("un símbolo con forma rara se descarta sin llevarse el titular por delante", () => {
    const item = mapRawNews({ ...REAL, relatedSymbols: [{ symbol: 42 }, { symbol: "BITSTAMP:BTCUSD" }, null] });
    expect(item?.symbols).toEqual(["BITSTAMP:BTCUSD"]);
  });
});
