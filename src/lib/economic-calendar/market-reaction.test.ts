import { describe, expect, it } from "vitest";

import {
  formatAbsPct,
  formatHorizonLabel,
  formatSignedPct,
  horizonOf,
  measureReaction,
  type ReactionCandle,
} from "./market-reaction";

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

/** Una vela por minuto de -1 a `hasta`, todas planas salvo las que se indiquen. */
function serie(hasta: number, especiales: Record<number, Partial<ReactionCandle>> = {}) {
  const out: ReactionCandle[] = [vela(-1, { close: 100 })];
  for (let m = 0; m <= hasta; m++) out.push(vela(m, especiales[m] ?? { close: 100 }));
  return out;
}

describe("measureReaction", () => {
  it("mide contra la última vela cerrada antes de la publicación", () => {
    const candles = [vela(-2, { close: 100 }), vela(-1, { close: 200 }), ...serie(20).slice(1)];
    const r = measureReaction(candles, EVENTO)!;
    expect(r.reference).toBe(200);
  });

  it("da una medida por plazo, y sólo de los plazos que las velas alcanzan", () => {
    // Velas hasta los 70 minutos: llegan a 15 y a 60, no a 120 ni a 240.
    const r = measureReaction(serie(70), EVENTO)!;

    expect(r.horizons.map((h) => h.minutes)).toEqual([15, 60, 120, 240]);
    expect(horizonOf(r, 15)!.changePct).not.toBeNull();
    expect(horizonOf(r, 60)!.changePct).not.toBeNull();
    // Aquí está lo importante: sin velas hasta las dos horas, la respuesta es
    // «no se sabe», no el último precio disponible disfrazado de dato.
    expect(horizonOf(r, 120)!.changePct).toBeNull();
    expect(horizonOf(r, 240)!.changePct).toBeNull();
  });

  it("cada plazo mide su propia ventana, no la de después", () => {
    const r = measureReaction(
      serie(240, {
        // Un pico a los 90 minutos: no debe contar en el plazo de una hora.
        90: { high: 110, low: 100, close: 110 },
      }),
      EVENTO,
    )!;

    expect(horizonOf(r, 60)!.maxMovePct).toBeCloseTo(0, 6);
    expect(horizonOf(r, 120)!.maxMovePct).toBeCloseTo(10, 6);
    expect(horizonOf(r, 240)!.maxMovePct).toBeCloseTo(10, 6);
  });

  it("el mayor alejamiento cuenta aunque el precio vuelva", () => {
    // El caso que importa a quien opera apalancado: el precio se desploma un
    // 3 % y vuelve. Mirar sólo dónde acabó diría que no pasó nada.
    const r = measureReaction(serie(70, { 0: { high: 100, low: 97, close: 100 } }), EVENTO)!;
    const h = horizonOf(r, 60)!;

    expect(h.changePct).toBeCloseTo(0, 6);
    expect(h.maxMovePct).toBeCloseTo(3, 6);
  });

  it("tolera minutos sueltos sin operaciones al final del plazo", () => {
    // Falta la vela del minuto 60 exacto, pero hay una del 57: eso es un hueco
    // normal de mercado, no un histórico que no llega.
    const candles = serie(70).filter((c) => c.time !== T0 + 60 * 60);
    expect(horizonOf(measureReaction(candles, EVENTO)!, 60)!.changePct).not.toBeNull();
  });

  it("sin vela anterior no hay punto cero, y no se inventa uno", () => {
    expect(measureReaction([vela(0, { close: 100 }), vela(1, { close: 105 })], EVENTO)).toBeNull();
  });

  it("sin velas posteriores tampoco hay reacción que medir", () => {
    expect(measureReaction([vela(-2), vela(-1)], EVENTO)).toBeNull();
  });

  it("una referencia de cero no produce infinitos", () => {
    expect(measureReaction([vela(-1, { close: 0 }), vela(0, { close: 5 })], EVENTO)).toBeNull();
  });

  it("acepta las velas desordenadas", () => {
    const candles = [...serie(20)].reverse();
    expect(measureReaction(candles, EVENTO)!.reference).toBe(100);
  });
});

describe("formato", () => {
  it("el signo delante permite comparar de un vistazo", () => {
    expect(formatSignedPct(1.234)).toBe("+1,23%");
    expect(formatSignedPct(-0.5)).toBe("-0,5%");
    expect(formatSignedPct(0)).toBe("0%");
    expect(formatSignedPct(null)).toBe("—");
  });

  it("«llegó a moverse» no tiene sentido negativo", () => {
    expect(formatAbsPct(-1.5)).toBe("1,5%");
    expect(formatAbsPct(null)).toBe("—");
  });

  it("los plazos se nombran en minutos u horas, no en minutos siempre", () => {
    expect(formatHorizonLabel(15)).toBe("15 min");
    expect(formatHorizonLabel(60)).toBe("1 h");
    expect(formatHorizonLabel(240)).toBe("4 h");
  });
});
