import { describe, expect, it } from "vitest";

import { EMPTY_METRICS, type BotMetrics } from "./metrics";
import { evaluateHealth } from "./semaforo";
import { EMPTY_BASELINE, type Baseline } from "./types";

function ventana(parcial: Partial<BotMetrics>): BotMetrics {
  return { ...EMPTY_METRICS, trades: 20, profitFactor: 2, expectancyR: 0.4, winRate: 55, sharpe: 1.2, ...parcial };
}

const prometido: Baseline = {
  ...EMPTY_BASELINE,
  profitFactor: 2,
  expectancyR: 0.4,
  winRate: 55,
  sharpe: 1.2,
  source: "BACKTEST",
};

describe("evaluateHealth", () => {
  it("verde cuando la ventana iguala lo prometido", () => {
    const r = evaluateHealth({ rolling: ventana({}), declared: prometido, historical: null, contractDrawdownPct: null });
    expect(r.state).toBe("VERDE");
    expect(r.baselineSource).toBe("BACKTEST");
    expect(r.reasons).toEqual(["Todos los marcadores dentro de su línea base."]);
  });

  it("amarillo por debajo del 85% de la línea base", () => {
    const r = evaluateHealth({
      rolling: ventana({ profitFactor: 1.5 }),
      declared: prometido,
      historical: null,
      contractDrawdownPct: null,
    });
    expect(r.state).toBe("AMARILLO");
    expect(r.reasons[0]).toContain("Profit factor");
  });

  it("naranja por debajo del 60%", () => {
    const r = evaluateHealth({
      rolling: ventana({ expectancyR: 0.2 }),
      declared: prometido,
      historical: null,
      contractDrawdownPct: null,
    });
    expect(r.state).toBe("NARANJA");
  });

  it("incumplir el contrato de drawdown es naranja aunque el resto vaya bien", () => {
    const r = evaluateHealth({
      rolling: ventana({ maxDrawdownPct: 14 }),
      declared: prometido,
      historical: null,
      contractDrawdownPct: 12,
    });
    expect(r.state).toBe("NARANJA");
    expect(r.reasons[0]).toContain("contrato");
  });

  it("con pocas operaciones no se pronuncia", () => {
    const r = evaluateHealth({ rolling: ventana({ trades: 5 }), declared: prometido, historical: null, contractDrawdownPct: null });
    expect(r.state).toBe("SIN_DATOS");
    expect(r.reasons[0]).toContain("hacen falta 10");
  });

  it("sin línea base declarada usa el histórico del bot", () => {
    const historico = ventana({ trades: 50, profitFactor: 3 });
    const r = evaluateHealth({
      rolling: ventana({ profitFactor: 2 }),
      declared: EMPTY_BASELINE,
      historical: historico,
      contractDrawdownPct: null,
    });
    expect(r.baselineSource).toBe("HISTORICO");
    expect(r.state).toBe("AMARILLO");
  });

  it("sin ninguna línea base no se pronuncia", () => {
    const r = evaluateHealth({ rolling: ventana({}), declared: EMPTY_BASELINE, historical: null, contractDrawdownPct: null });
    expect(r.state).toBe("SIN_DATOS");
    expect(r.baselineSource).toBe("NINGUNA");
  });

  it("una línea base a cero no sirve de referencia", () => {
    const r = evaluateHealth({
      rolling: ventana({}),
      declared: { ...EMPTY_BASELINE, profitFactor: 0, source: "MANUAL" },
      historical: null,
      contractDrawdownPct: null,
    });
    expect(r.state).toBe("VERDE");
    expect(r.comparisons[0].ratio).toBeNull();
  });
});
