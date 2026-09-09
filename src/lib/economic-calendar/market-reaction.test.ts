import { describe, expect, it } from "vitest";

import { formatSignedPct, measureReaction, type ReactionCandle } from "./market-reaction";

/** 2026-08-13T12:30:00Z, la publicación real del PPI de julio. */
const EVENTO = new Date("2026-08-13T12:30:00.000Z");
const T0 = Math.floor(EVENTO.getTime() / 1000);

function vela(offsetMin: number, precios: Partial<ReactionCandle> = {}): ReactionCandle {
  const base = 100;
  return {
    time: T0 + offsetMin * 60,
    open: base,
    high: base,
    low: base,
    close: base,
    ...precios,
  };
}

describe("measureReaction", () => {
  it("mide contra la última vela cerrada antes de la publicación", () => {
    const candles = [
      vela(-2, { close: 100 }),
      // Ésta es la referencia: la última anterior al evento.
      vela(-1, { close: 200 }),
      vela(0, { high: 210, low: 190, close: 204 }),
    ];

    const r = measureReaction(candles, EVENTO)!;

    expect(r.reference).toBe(200);
    expect(r.high).toBe(210);
    expect(r.low).toBe(190);
    expect(r.rangePct).toBeCloseTo(10, 6);
  });

  it("el precio a los 15 y a los 60 minutos, en porcentaje", () => {
    const candles = [
      vela(-1, { close: 100 }),
      vela(0, { close: 101 }),
      vela(15, { close: 102 }),
      vela(60, { close: 98 }),
    ];

    const r = measureReaction(candles, EVENTO)!;

    expect(r.after15).toBe(102);
    expect(r.changePct15).toBeCloseTo(2, 6);
    expect(r.after60).toBe(98);
    expect(r.changePct60).toBeCloseTo(-2, 6);
  });

  it("el mayor alejamiento cuenta aunque el precio vuelva", () => {
    // El caso que importa a quien opera apalancado: el precio se desploma un
    // 3 % y vuelve. Mirar sólo dónde acabó diría que no pasó nada.
    const candles = [
      vela(-1, { close: 100 }),
      vela(0, { high: 100, low: 97, close: 97.5 }),
      vela(30, { high: 100, low: 99, close: 100 }),
      vela(60, { close: 100 }),
    ];

    const r = measureReaction(candles, EVENTO)!;

    expect(r.changePct60).toBeCloseTo(0, 6);
    expect(r.maxMovePct).toBeCloseTo(3, 6);
  });

  it("sin vela anterior no hay punto cero, y no se inventa uno", () => {
    // Usar la primera vela posterior como referencia escondería justo el
    // movimiento del minuto de la publicación, que es el que se busca.
    const candles = [vela(0, { close: 100 }), vela(1, { close: 105 })];
    expect(measureReaction(candles, EVENTO)).toBeNull();
  });

  it("sin velas posteriores tampoco hay reacción que medir", () => {
    expect(measureReaction([vela(-2), vela(-1)], EVENTO)).toBeNull();
  });

  it("sin velas, null", () => {
    expect(measureReaction([], EVENTO)).toBeNull();
  });

  it("una referencia de cero no produce infinitos", () => {
    const candles = [vela(-1, { close: 0 }), vela(0, { close: 5 })];
    expect(measureReaction(candles, EVENTO)).toBeNull();
  });

  it("no cuenta las velas de fuera de la ventana", () => {
    const candles = [
      vela(-1, { close: 100 }),
      vela(0, { high: 101, low: 100, close: 101 }),
      // Muy posterior: no debe entrar en el máximo de la ventana de una hora.
      vela(180, { high: 500, low: 100, close: 500 }),
    ];

    const r = measureReaction(candles, EVENTO)!;
    expect(r.high).toBe(101);
  });

  it("acepta las velas desordenadas", () => {
    const candles = [vela(15, { close: 102 }), vela(-1, { close: 100 }), vela(0, { close: 101 })];
    const r = measureReaction(candles, EVENTO)!;
    expect(r.reference).toBe(100);
    expect(r.after15).toBe(102);
  });
});

describe("formatSignedPct", () => {
  it("lleva el signo delante para poder comparar de un vistazo", () => {
    expect(formatSignedPct(1.234)).toBe("+1,23%");
    expect(formatSignedPct(-0.5)).toBe("-0,5%");
    expect(formatSignedPct(0)).toBe("0%");
    expect(formatSignedPct(null)).toBe("—");
  });
});
