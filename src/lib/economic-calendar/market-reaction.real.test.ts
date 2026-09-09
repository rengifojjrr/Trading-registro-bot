import { describe, expect, it } from "vitest";

import { PPI_2026_08_13 } from "./fixtures/ppi-2026-08-13";
import { horizonOf, measureReaction, type ReactionCandle } from "./market-reaction";

/**
 * La medición contra velas reales, no contra números redondos inventados.
 *
 * Es la publicación del PPI de julio (13 de agosto de 2026, 12:30 UTC) medida
 * sobre el contrato que se opera. Los tests de `market-reaction.test.ts`
 * comprueban la lógica caso a caso; éste comprueba que con datos de verdad
 * -- con sus huecos de un minuto sin operaciones y sus mechas -- salen números
 * creíbles y no NaN.
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

  it("la reacción no se acaba en la primera hora: a una hora no hizo nada, a dos sí", () => {
    // Éste es el caso que justifica medir varios plazos. Con la cifra de una
    // hora sola, este dato «no movió el mercado»: acabó un 0,016 % arriba. A
    // las dos horas estaba un 0,33 % arriba, y a las cuatro se había dado la
    // vuelta hasta un 0,24 % abajo. El movimiento llegó después.
    expect(horizonOf(r, 15)!.changePct).toBeCloseTo(0, 2);
    expect(horizonOf(r, 60)!.changePct).toBeCloseTo(0.016, 2);
    expect(horizonOf(r, 120)!.changePct).toBeCloseTo(0.331, 2);
    expect(horizonOf(r, 240)!.changePct).toBeCloseTo(-0.244, 2);
  });

  it("el alejamiento y el recorrido crecen con el plazo, nunca al revés", () => {
    // Una ventana mayor contiene a la menor, así que su máximo no puede ser
    // más pequeño. Si esto fallara, cada plazo no estaría midiendo lo suyo.
    const movimientos = [15, 60, 120, 240].map((m) => horizonOf(r, m)!.maxMovePct!);
    const recorridos = [15, 60, 120, 240].map((m) => horizonOf(r, m)!.rangePct!);

    for (let i = 1; i < movimientos.length; i++) {
      expect(movimientos[i]).toBeGreaterThanOrEqual(movimientos[i - 1]);
      expect(recorridos[i]).toBeGreaterThanOrEqual(recorridos[i - 1]);
    }
    expect(movimientos[0]).toBeCloseTo(0.213, 2);
    expect(movimientos[3]).toBeCloseTo(0.653, 2);
  });

  it("el precio volvió a donde estaba, pero el viaje existió", () => {
    // Mirando sólo dónde acabó la hora --un 0,016 % arriba-- parecería que el
    // dato no hizo nada, y llegó a moverse más de un tercio de punto. Con
    // apalancamiento, ese viaje de ida es lo que liquida una posición.
    const unaHora = horizonOf(r, 60)!;
    expect(unaHora.maxMovePct).toBeCloseTo(0.354, 2);
    expect(unaHora.maxMovePct!).toBeGreaterThan(Math.abs(unaHora.changePct!));
  });

  it("ningún resultado es NaN ni infinito", () => {
    expect(Number.isFinite(r.reference)).toBe(true);
    for (const h of r.horizons) {
      for (const valor of [h.changePct, h.maxMovePct, h.rangePct, h.high, h.low]) {
        expect(valor).not.toBeNull();
        expect(Number.isFinite(valor!)).toBe(true);
      }
    }
  });
});

describe("un histórico que no llega al plazo dice «no se sabe»", () => {
  it("con sólo hora y media de velas, dos y cuatro horas quedan sin medir", () => {
    // El fallo más fácil de cometer aquí es colar el último precio disponible
    // como si fuera el de las cuatro horas.
    const cortas = CANDLES.filter((c) => c.time <= T0 + 90 * 60);
    const r = measureReaction(cortas, EVENTO)!;

    expect(horizonOf(r, 60)!.changePct).not.toBeNull();
    expect(horizonOf(r, 120)!.changePct).toBeNull();
    expect(horizonOf(r, 240)!.changePct).toBeNull();
  });
});
