import { describe, expect, it } from "vitest";

import { fillsDeLasEjecuciones, tramosDeSieteDias } from "./adapter";
import { esUnaEjecucionDeVerdad, laCerroElExchange, type BybitExecution } from "./types";

/**
 * Lo que tiene que cumplir traducir la cuenta demo de Bybit.
 *
 * El adaptador entero es traducción, y una traducción se equivoca en silencio:
 * un campo en la columna de al lado no revienta, sale como un número. Así que
 * lo que se prueba aquí no es que las llamadas funcionen --eso hace falta red--
 * sino las tres decisiones que tomaron forma de función pura, que son las tres
 * que pueden corromper una posición sin que nada se queje.
 *
 * Pesa más de lo normal por una razón concreta: la cuenta demo de Bybit **borra
 * a los siete días**. Un fill que se pierda hoy no se puede volver a pedir la
 * semana que viene, así que aquí no hay red de seguridad detrás.
 */

function ejecucion(extra: Partial<BybitExecution> = {}): BybitExecution {
  return {
    execId: "e-1",
    orderId: "o-1",
    symbol: "BTCUSDT",
    side: "Buy",
    execPrice: "76000.5",
    execQty: "0.01",
    execFee: "0.456",
    execType: "Trade",
    execTime: String(Date.UTC(2026, 8, 23, 10, 30, 0)),
    isMaker: false,
    ...extra,
  };
}

describe("qué cuenta como ejecución y qué no", () => {
  /**
   * El fallo que esto evita: un cobro de funding tiene `execQty` y `execFee`
   * como cualquier fila, así que pasado por fill el motor de reconstrucción lo
   * agruparía como una compra o una venta y la posición quedaría descuadrada
   * contra lo que Bybit dice que tienes.
   */
  it("el funding no es una ejecución", () => {
    expect(esUnaEjecucionDeVerdad("Funding")).toBe(false);
    expect(fillsDeLasEjecuciones([ejecucion({ execType: "Funding" })])).toEqual([]);
  });

  it("ni la liquidación de un futuro que expira ni el asentamiento", () => {
    expect(esUnaEjecucionDeVerdad("Delivery")).toBe(false);
    expect(esUnaEjecucionDeVerdad("Settle")).toBe(false);
  });

  it("lo que cierra Bybit por su cuenta sí cuenta", () => {
    // No las decidiste tú, pero el tamaño cambió de verdad: dejarlas fuera
    // dejaría en el diario una posición abierta que en Bybit ya no existe.
    expect(esUnaEjecucionDeVerdad("AdlTrade")).toBe(true);
    expect(esUnaEjecucionDeVerdad("BustTrade")).toBe(true);
    expect(laCerroElExchange("BustTrade")).toBe(true);
    expect(laCerroElExchange("Trade")).toBe(false);
  });

  /**
   * Lo que Bybit añada mañana se queda fuera, y es la decisión correcta: una
   * fila desconocida colada como ejecución corrompe la posición en silencio, y
   * una que se queda fuera deja un descuadre que la conciliación canta.
   */
  it("un tipo que no conocemos se queda fuera", () => {
    expect(esUnaEjecucionDeVerdad("UNKNOWN")).toBe(false);
    expect(fillsDeLasEjecuciones([ejecucion({ execType: "UNKNOWN" })])).toEqual([]);
  });
});

describe("el mapeo de una ejecución", () => {
  const [fill] = fillsDeLasEjecuciones([ejecucion()]);

  it("pone el identificador de Bybit donde va la clave de idempotencia", () => {
    // De esto depende que sincronizar dos veces no duplique nada.
    expect(fill.entry_id).toBe("e-1");
    expect(fill.order_id).toBe("o-1");
  });

  it("convierte los milisegundos de Bybit a una hora que se puede ordenar", () => {
    expect(fill.trade_time).toBe("2026-09-23T10:30:00.000Z");
    // La marca de agua de la sincronización sale de aquí, y se compara como
    // texto: si esto dejara de ser ISO en UTC, la comparación mentiría.
    expect(fill.sequence_timestamp).toBe(fill.trade_time);
  });

  it("no toca los números", () => {
    // Como cadenas y no como `number`: es dinero, y esta capa existe para
    // reflejar lo que dijo la fuente.
    expect(fill.price).toBe("76000.5");
    expect(fill.size).toBe("0.01");
    expect(fill.commission).toBe("0.456");
  });

  it("traduce el lado", () => {
    expect(fill.side).toBe("BUY");
    expect(fillsDeLasEjecuciones([ejecucion({ side: "Sell" })])[0].side).toBe("SELL");
  });

  it("dice si fuiste maker, y admite no saberlo", () => {
    expect(fill.liquidity_indicator).toBe("TAKER");
    expect(fillsDeLasEjecuciones([ejecucion({ isMaker: true })])[0].liquidity_indicator).toBe("MAKER");
    expect(
      fillsDeLasEjecuciones([ejecucion({ isMaker: undefined })])[0].liquidity_indicator,
    ).toBe("UNKNOWN_LIQUIDITY_INDICATOR");
  });
});

describe("la misma ejecución dos veces", () => {
  /**
   * Pasa de dos formas: los tramos de siete días se piden con los bordes
   * pegados, y cada sincronización solapa a propósito con la anterior para no
   * perder nada en el borde.
   */
  it("se queda en una", () => {
    const fills = fillsDeLasEjecuciones([ejecucion(), ejecucion(), ejecucion()]);
    expect(fills).toHaveLength(1);
  });

  it("y dos distintas no se pisan", () => {
    const fills = fillsDeLasEjecuciones([ejecucion(), ejecucion({ execId: "e-2" })]);
    expect(fills.map((f) => f.entry_id)).toEqual(["e-1", "e-2"]);
  });
});

describe("el orden", () => {
  it("por hora, de la más antigua a la más reciente", () => {
    const fills = fillsDeLasEjecuciones([
      ejecucion({ execId: "tarde", execTime: String(Date.UTC(2026, 8, 23, 12)) }),
      ejecucion({ execId: "temprano", execTime: String(Date.UTC(2026, 8, 23, 9)) }),
    ]);
    expect(fills.map((f) => f.entry_id)).toEqual(["temprano", "tarde"]);
  });

  /**
   * El caso que Bybit documenta y que puede costar una operación: con dos
   * ejecuciones en el mismo milisegundo su orden no es estable, y la marca de
   * agua se saca de la última. Sin un desempate propio, la que quedara segunda
   * podría no volver a pedirse -- y con el borrado a siete días, eso es perderla.
   */
  it("con la hora empatada, por identificador, para que no dependa del azar", () => {
    const mismoInstante = String(Date.UTC(2026, 8, 23, 11));
    const unaForma = fillsDeLasEjecuciones([
      ejecucion({ execId: "bbb", execTime: mismoInstante }),
      ejecucion({ execId: "aaa", execTime: mismoInstante }),
    ]);
    const laOtra = fillsDeLasEjecuciones([
      ejecucion({ execId: "aaa", execTime: mismoInstante }),
      ejecucion({ execId: "bbb", execTime: mismoInstante }),
    ]);

    expect(unaForma.map((f) => f.entry_id)).toEqual(["aaa", "bbb"]);
    expect(laOtra.map((f) => f.entry_id)).toEqual(unaForma.map((f) => f.entry_id));
  });
});

describe("trocear el rango en ventanas de siete días", () => {
  const DIA = 24 * 60 * 60 * 1000;
  const inicio = Date.UTC(2026, 8, 1);

  it("un rango corto es un solo tramo", () => {
    const tramos = tramosDeSieteDias(inicio, inicio + 2 * DIA);
    expect(tramos).toEqual([{ desde: inicio, hasta: inicio + 2 * DIA }]);
  });

  /**
   * Pedir más de siete días no devuelve menos datos: devuelve error. Así que
   * esto no es una optimización, es lo que hace que funcione el primer arranque
   * y la recuperación de una sincronización que estuvo caída.
   */
  it("treinta días se parten en cinco, y ninguno pasa del tope", () => {
    const tramos = tramosDeSieteDias(inicio, inicio + 30 * DIA);
    expect(tramos.length).toBe(5);
    for (const t of tramos) {
      expect(t.hasta - t.desde).toBeLessThanOrEqual(7 * DIA);
    }
  });

  it("cubren el rango entero sin dejar huecos", () => {
    const fin = inicio + 30 * DIA;
    const tramos = tramosDeSieteDias(inicio, fin);

    expect(tramos[0].desde).toBe(inicio);
    expect(tramos[tramos.length - 1].hasta).toBe(fin);
    for (let i = 1; i < tramos.length; i += 1) {
      // Pegados al milímetro: un hueco de un milisegundo entre dos tramos es
      // una ejecución que no se pide, y con el borrado a siete días eso no se
      // puede arreglar después.
      expect(tramos[i].desde).toBe(tramos[i - 1].hasta + 1);
    }
  });

  it("un rango al revés o vacío no devuelve nada, en vez de pedir al pasado", () => {
    expect(tramosDeSieteDias(inicio, inicio)).toEqual([]);
    expect(tramosDeSieteDias(inicio, inicio - DIA)).toEqual([]);
    expect(tramosDeSieteDias(Number.NaN, inicio)).toEqual([]);
  });
});
