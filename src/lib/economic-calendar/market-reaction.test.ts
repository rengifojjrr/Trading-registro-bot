import { describe, expect, it } from "vitest";

import { PPI_2026_08_13 } from "./fixtures/ppi-2026-08-13";
import {
  aggregateCandles,
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
/** El mismo instante, para las pruebas que usan las velas reales guardadas. */
const PPI_T0 = T0;

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

describe("aggregateCandles", () => {
  /** Cinco velas de un minuto desde las 12:28, para que el dato de las 12:30 parta un tramo. */
  const T = Math.floor(Date.UTC(2026, 7, 13, 12, 28, 0) / 1000);
  const unMinuto: ReactionCandle[] = [
    { time: T, open: 100, high: 105, low: 99, close: 101, volume: 1 },
    { time: T + 60, open: 101, high: 102, low: 95, close: 96, volume: 2 },
    { time: T + 120, open: 96, high: 110, low: 96, close: 108, volume: 4 },
    { time: T + 180, open: 108, high: 109, low: 107, close: 107, volume: 8 },
    { time: T + 240, open: 107, high: 120, low: 106, close: 118, volume: 16 },
  ];

  it("con factor uno devuelve lo mismo, ordenado", () => {
    expect(aggregateCandles(unMinuto, 1)).toEqual(unMinuto);
  });

  it("alinea con el reloj y no con la primera vela recibida", () => {
    // 12:28 y 12:29 caen en el tramo de 12:25; el dato de 12:30 abre uno nuevo.
    const cinco = aggregateCandles(unMinuto, 5);
    expect(cinco.map((c) => new Date(c.time * 1000).toISOString().slice(11, 16))).toEqual([
      "12:25",
      "12:30",
    ]);
  });

  it("la apertura es la primera, el cierre la última, y los extremos los de todo el tramo", () => {
    const [primero, segundo] = aggregateCandles(unMinuto, 5);

    expect(primero.open).toBe(100);
    expect(primero.close).toBe(96);
    expect(primero.high).toBe(105);
    expect(primero.low).toBe(95);

    expect(segundo.open).toBe(96);
    expect(segundo.close).toBe(118);
    expect(segundo.high).toBe(120);
    expect(segundo.low).toBe(96);
  });

  it("suma el volumen del tramo", () => {
    const [primero, segundo] = aggregateCandles(unMinuto, 5);
    expect(primero.volume).toBe(3);
    expect(segundo.volume).toBe(28);
  });

  it("no toca las velas que recibe", () => {
    const copia = structuredClone(unMinuto);
    aggregateCandles(unMinuto, 5);
    expect(unMinuto).toEqual(copia);
  });

  it("una lista vacía da una lista vacía, no un tramo inventado", () => {
    expect(aggregateCandles([], 5)).toEqual([]);
  });

  it("sobre las velas reales del PPI, las de cinco minutos cubren lo mismo que las de uno", () => {
    const reales = PPI_2026_08_13.map(([minuto, o, h, l, c]) => ({
      time: PPI_T0 + minuto * 60,
      open: o,
      high: h,
      low: l,
      close: c,
    }));
    const cinco = aggregateCandles(reales, 5);

    // El máximo y el mínimo del conjunto no pueden cambiar al agrupar: si
    // cambiaran, el gráfico enseñaría un recorrido distinto del medido.
    expect(Math.max(...cinco.map((c) => c.high))).toBe(Math.max(...reales.map((c) => c.high)));
    expect(Math.min(...cinco.map((c) => c.low))).toBe(Math.min(...reales.map((c) => c.low)));
    expect(cinco.length).toBeLessThan(reales.length / 4);
  });
});
