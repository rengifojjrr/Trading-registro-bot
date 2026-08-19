import { describe, expect, it } from "vitest";

import { formatPercentOfCapital, formatRMultiple, readRisk } from "./risk-amount";

describe("readRisk", () => {
  it("pone el riesgo en escala del capital", () => {
    const reading = readRisk({
      riskAmount: 100,
      accountSize: 10000,
      maxRiskPct: null,
      netPnl: null,
    });
    expect(reading.percentOfCapital).toBe(1);
  });

  it("el mismo importe es otro riesgo con otro capital", () => {
    // Cien dólares es prudente con diez mil y temerario con quinientos: es
    // justo lo que un número suelto en dólares no dice.
    expect(
      readRisk({ riskAmount: 100, accountSize: 500, maxRiskPct: null, netPnl: null })
        .percentOfCapital,
    ).toBe(20);
  });

  it("avisa cuando pasa del tope que te pusiste", () => {
    const reading = readRisk({ riskAmount: 300, accountSize: 10000, maxRiskPct: 2, netPnl: null });
    expect(reading.percentOfCapital).toBe(3);
    expect(reading.overLimit).toBe(true);
  });

  it("justo en el tope no es pasarse", () => {
    expect(
      readRisk({ riskAmount: 200, accountSize: 10000, maxRiskPct: 2, netPnl: null }).overLimit,
    ).toBe(false);
  });

  it("sin tope configurado no avisa de nada", () => {
    expect(
      readRisk({ riskAmount: 900, accountSize: 1000, maxRiskPct: null, netPnl: null }).overLimit,
    ).toBe(false);
  });

  it("calcula las erres del resultado", () => {
    // Ganar 300 arriesgando 100 y ganar 30 arriesgando 10 es la misma
    // operación; en dólares parecen una diez veces mejor que la otra.
    expect(readRisk({ riskAmount: 100, accountSize: null, maxRiskPct: null, netPnl: 300 }).rMultiple).toBe(3);
    expect(readRisk({ riskAmount: 10, accountSize: null, maxRiskPct: null, netPnl: 30 }).rMultiple).toBe(3);
  });

  it("una pérdida da erres negativas", () => {
    expect(
      readRisk({ riskAmount: 100, accountSize: null, maxRiskPct: null, netPnl: -150 }).rMultiple,
    ).toBe(-1.5);
  });

  it("sin riesgo apuntado no hay erres ni porcentaje", () => {
    const reading = readRisk({ riskAmount: null, accountSize: 10000, maxRiskPct: 2, netPnl: 300 });
    expect(reading.percentOfCapital).toBeNull();
    expect(reading.rMultiple).toBeNull();
    expect(reading.overLimit).toBe(false);
  });

  it("un riesgo de cero no da infinitas erres", () => {
    // Dividir entre cero daría Infinity, y «infinitas erres» no significa nada.
    expect(readRisk({ riskAmount: 0, accountSize: null, maxRiskPct: null, netPnl: 300 }).rMultiple).toBeNull();
  });

  it("un riesgo negativo se descarta en lugar de invertir el signo", () => {
    expect(readRisk({ riskAmount: -100, accountSize: 10000, maxRiskPct: null, netPnl: 300 }).rMultiple).toBeNull();
  });

  it("sin capital configurado no inventa un porcentaje", () => {
    expect(
      readRisk({ riskAmount: 100, accountSize: null, maxRiskPct: 2, netPnl: null }).percentOfCapital,
    ).toBeNull();
  });

  it("una operación todavía abierta no tiene erres", () => {
    expect(readRisk({ riskAmount: 100, accountSize: null, maxRiskPct: null, netPnl: null }).rMultiple).toBeNull();
  });

  it("aguanta valores no numéricos sin romperse", () => {
    const reading = readRisk({
      riskAmount: Number.NaN,
      accountSize: Number.POSITIVE_INFINITY,
      maxRiskPct: Number.NaN,
      netPnl: Number.NaN,
    });
    expect(reading).toEqual({ percentOfCapital: null, overLimit: false, rMultiple: null });
  });
});

describe("formato", () => {
  it("escribe el porcentaje con coma decimal", () => {
    expect(formatPercentOfCapital(0.8)).toBe("0,8 % del capital");
    expect(formatPercentOfCapital(null)).toBeNull();
  });

  it("pone el signo delante de las erres", () => {
    expect(formatRMultiple(2.4)).toBe("+2,4R");
    expect(formatRMultiple(-1)).toBe("−1R");
    expect(formatRMultiple(0)).toBe("0R");
    expect(formatRMultiple(null)).toBeNull();
  });
});
