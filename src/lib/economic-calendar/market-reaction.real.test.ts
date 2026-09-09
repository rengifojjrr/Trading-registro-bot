import { describe, expect, it } from "vitest";

import { PPI_2026_08_13 } from "./fixtures/ppi-2026-08-13";
import { measureReaction, type ReactionCandle } from "./market-reaction";

/**
 * La medición contra velas reales, no contra números redondos inventados.
 *
 * Es la publicación del PPI de julio (13 de agosto de 2026, 12:30 UTC) medida
 * sobre el contrato que se opera. Los tests de `market-reaction.test.ts`
 * comprueban la lógica caso a caso; éste comprueba que con datos de verdad
 * -- con sus huecos de un minuto sin operaciones y sus mechas -- sale un
 * número creíble y no un NaN.
 */

const EVENTO = new Date("2026-08-13T12:30:00.000Z");
const T0 = Math.floor(EVENTO.getTime() / 1000);

const CANDLES: ReactionCandle[] = PPI_2026_08_13.map(([min, open, high, low, close]) => ({
  time: T0 + min * 60,
  open,
  high,
  low,
  close,
}));

describe("measureReaction con velas reales (PPI, 13-ago-2026)", () => {
  const r = measureReaction(CANDLES, EVENTO)!;

  it("toma como cero el cierre del minuto anterior al dato", () => {
    expect(r).not.toBeNull();
    expect(r.reference).toBe(63520);
  });

  it("mide el máximo y el mínimo de la hora siguiente", () => {
    expect(r.high).toBe(63745);
    expect(r.low).toBe(63385);
    expect(r.rangePct).toBeCloseTo(0.567, 2);
  });

  it("el precio volvió a donde estaba, pero el viaje existió", () => {
    // Éste es el caso que justifica medir el alejamiento máximo: mirando sólo
    // dónde acabó -- un 0,016 % arriba -- parecería que el dato no hizo nada,
    // y llegó a moverse más de un tercio de punto. Con apalancamiento, ese
    // viaje de ida es lo que liquida una posición.
    expect(r.changePct60).toBeCloseTo(0.016, 2);
    expect(r.maxMovePct).toBeCloseTo(0.354, 2);
    expect(r.maxMovePct).toBeGreaterThan(Math.abs(r.changePct60!));
  });

  it("ningún resultado es NaN ni infinito", () => {
    for (const valor of [r.reference, r.high, r.low, r.rangePct, r.maxMovePct]) {
      expect(Number.isFinite(valor)).toBe(true);
    }
    expect(Number.isFinite(r.changePct15!)).toBe(true);
    expect(Number.isFinite(r.changePct60!)).toBe(true);
  });
});
