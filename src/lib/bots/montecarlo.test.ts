import { describe, expect, it } from "vitest";

import { maxDrawdown, monteCarloDrawdown, mulberry32, percentile, shuffle } from "./montecarlo";

describe("maxDrawdown", () => {
  it("es la mayor caída desde un máximo", () => {
    expect(maxDrawdown([10, -5, -5, 20, -30, 5])).toBe(30);
  });

  it("es cero si la curva nunca baja", () => {
    expect(maxDrawdown([1, 2, 3])).toBe(0);
    expect(maxDrawdown([])).toBe(0);
  });
});

describe("percentile", () => {
  it("usa el rango más cercano", () => {
    const lista = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(lista, 50)).toBe(5);
    expect(percentile(lista, 95)).toBe(10);
    expect(percentile(lista, 1)).toBe(1);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("shuffle", () => {
  it("es una permutación reproducible", () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(original, mulberry32(7));
    const b = shuffle(original, mulberry32(7));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("monteCarloDrawdown", () => {
  const historial = [50, -30, 40, -20, -25, 60, -10, 30, -40, 20, 35, -15, 25, -30, 45];

  it("con pocas operaciones no da distribución", () => {
    expect(monteCarloDrawdown([1, -1, 1], 1000)).toBeNull();
  });

  it("los percentiles suben y el observado cabe en la distribución", () => {
    const r = monteCarloDrawdown(historial, 1000)!;
    expect(r.runs).toBe(300);
    expect(r.trades).toBe(15);
    expect(r.p50).toBeLessThanOrEqual(r.p75);
    expect(r.p75).toBeLessThanOrEqual(r.p95);
    expect(r.p95).toBeLessThanOrEqual(r.worst);
    expect(r.observed).toBe(maxDrawdown(historial));
    expect(r.worseThanObservedPct).toBeGreaterThanOrEqual(0);
    expect(r.worseThanObservedPct).toBeLessThanOrEqual(100);
  });

  it("es determinista con la misma semilla", () => {
    expect(monteCarloDrawdown(historial, 1000)).toEqual(monteCarloDrawdown(historial, 1000));
    expect(monteCarloDrawdown(historial, 1000, { seed: 1 })!.p95).toBeDefined();
  });

  it("da el contrato en porcentaje del capital cuando lo hay", () => {
    const conCuenta = monteCarloDrawdown(historial, 1000)!;
    expect(conCuenta.p95Pct).toBeCloseTo(conCuenta.p95 / 10, 10);

    const sinCuenta = monteCarloDrawdown(historial, null)!;
    expect(sinCuenta.p95Pct).toBeNull();
    expect(sinCuenta.p95).toBe(conCuenta.p95);
  });
});
