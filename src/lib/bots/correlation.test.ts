import { describe, expect, it } from "vitest";

import { alignDaily, correlationMatrix, lookupPair, pearson } from "./correlation";

function serie(valores: number[], desde = "2026-08-01"): Map<string, number> {
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  return new Map(
    valores.map((v, i) => [new Date(inicio + i * 86_400_000).toISOString().slice(0, 10), v]),
  );
}

describe("pearson", () => {
  it("dos series iguales dan 1 y dos opuestas dan -1", () => {
    const x = [1, -2, 3, -4, 5];
    expect(pearson(x, x)).toBeCloseTo(1, 10);
    expect(pearson(x, x.map((v) => -v))).toBeCloseTo(-1, 10);
  });

  it("sin variación no hay correlación", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("con menos de dos puntos tampoco", () => {
    expect(pearson([1], [2])).toBeNull();
  });
});

describe("alignDaily", () => {
  it("se queda con los días que están en las dos", () => {
    const a = serie([1, 2, 3], "2026-08-01");
    const b = serie([10, 20, 30], "2026-08-02");
    expect(alignDaily(a, b)).toEqual({ x: [2, 3], y: [10, 20], days: 2 });
  });
});

describe("correlationMatrix", () => {
  const ruido = Array.from({ length: 25 }, (_, i) => Math.sin(i) * 10);

  it("marca como medio gemelos a los que se mueven juntos", () => {
    const m = correlationMatrix([
      { id: "a", daily: serie(ruido) },
      { id: "b", daily: serie(ruido.map((v) => v * 3 + 1)) },
      { id: "c", daily: serie(ruido.map((v) => -v)) },
    ]);

    const ab = lookupPair(m, "b", "a")!;
    expect(ab.rho).toBeCloseTo(1, 10);
    expect(ab.redundant).toBe(true);
    expect(m.redundant).toHaveLength(1);

    const ac = lookupPair(m, "a", "c")!;
    expect(ac.rho).toBeCloseTo(-1, 10);
    expect(ac.redundant).toBe(false);

    expect(m.mean).toBeCloseTo((1 - 1 - 1) / 3, 10);
  });

  it("con menos de veinte días en común no se pronuncia", () => {
    const m = correlationMatrix([
      { id: "a", daily: serie(ruido.slice(0, 10)) },
      { id: "b", daily: serie(ruido.slice(0, 10)) },
    ]);
    expect(m.pairs[0].rho).toBeNull();
    expect(m.pairs[0].days).toBe(10);
    expect(m.mean).toBeNull();
  });

  it("con un solo bot no hay pares", () => {
    const m = correlationMatrix([{ id: "a", daily: serie(ruido) }]);
    expect(m.pairs).toEqual([]);
    expect(lookupPair(m, "a", "b")).toBeNull();
  });
});
