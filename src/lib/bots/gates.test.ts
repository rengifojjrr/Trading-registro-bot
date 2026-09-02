import { describe, expect, it } from "vitest";

import { evaluateGate } from "./gates";
import { EMPTY_METRICS, type BotMetrics } from "./metrics";
import { DEFAULT_PORTFOLIO_SETTINGS } from "./types";

const gates = DEFAULT_PORTFOLIO_SETTINGS.gates;

function metricas(parcial: Partial<BotMetrics>): BotMetrics {
  return {
    ...EMPTY_METRICS,
    trades: 40,
    profitFactor: 2,
    expectancyR: 0.3,
    sharpe: 1.4,
    maxDrawdownPct: 9,
    ...parcial,
  };
}

describe("evaluateGate", () => {
  it("abre la puerta cuando pasan los cinco criterios", () => {
    const r = evaluateGate(metricas({}), gates);
    expect(r.verdict).toBe("GO");
    expect(r.passed).toBe(5);
    expect(r.summary).toContain("Puede ascender");
  });

  it("sin muestra retiene aunque las cifras deslumbren", () => {
    const r = evaluateGate(metricas({ trades: 9, profitFactor: 32 }), gates);
    expect(r.verdict).toBe("RETENIDO");
    expect(r.summary).toContain("suerte");
    expect(r.criteria.find((c) => c.id === "PROFIT_FACTOR")?.pass).toBe(true);
  });

  it("un criterio de calidad fallado retiene", () => {
    const r = evaluateGate(metricas({ maxDrawdownPct: 25 }), gates);
    expect(r.verdict).toBe("RETENIDO");
    expect(r.passed).toBe(4);
    expect(r.criteria.find((c) => c.id === "DRAWDOWN")?.pass).toBe(false);
  });

  it("no se pronuncia si falta algún dato", () => {
    const sinSharpe = evaluateGate(metricas({ sharpe: null }), gates);
    expect(sinSharpe.verdict).toBe("SIN_DATOS");
    expect(sinSharpe.criteria.find((c) => c.id === "SHARPE")?.pass).toBeNull();

    const sinCuenta = evaluateGate(metricas({ maxDrawdownPct: null }), gates);
    expect(sinCuenta.verdict).toBe("SIN_DATOS");
    expect(sinCuenta.criteria.find((c) => c.id === "DRAWDOWN")?.observed).toContain("tamaño de la cuenta");
  });

  it("sin operaciones no tiene nada que mirar", () => {
    const r = evaluateGate(EMPTY_METRICS, gates);
    expect(r.verdict).toBe("SIN_DATOS");
    expect(r.summary).toContain("Sin operaciones");
  });

  it("los umbrales son estrictos: igualar no es superar", () => {
    const r = evaluateGate(metricas({ profitFactor: 1.5 }), gates);
    expect(r.criteria.find((c) => c.id === "PROFIT_FACTOR")?.pass).toBe(false);
  });
});
