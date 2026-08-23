import { describe, expect, it } from "vitest";

import { formatPercentOfCapital, formatRMultiple, readRisk, riskFromStop } from "./risk-amount";

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

describe("riesgo deducido del stop", () => {
  it("saca de dónde pusiste el stop lo que no hacía falta teclear", () => {
    // 43 contratos nano comprados a 63.604 con el stop en 63.100: la
    // distancia por el tamaño por el multiplicador. Nada que estimar.
    expect(
      riskFromStop({
        direction: "LONG",
        entryWap: 63604,
        stopLossPrice: 63100,
        size: 43,
        contractSize: 0.01,
      }),
    ).toBeCloseTo(216.72, 2);
  });

  it("en un corto el stop está por encima", () => {
    expect(
      riskFromStop({
        direction: "SHORT",
        entryWap: 67950,
        stopLossPrice: 68500,
        size: 150,
        contractSize: 0.01,
      }),
    ).toBeCloseTo(825, 2);
  });

  it("un stop del lado equivocado no es riesgo", () => {
    // Un stop por encima del precio en una compra es un objetivo mal
    // apuntado; tratarlo como riesgo daría la cifra con el signo cambiado.
    expect(
      riskFromStop({ direction: "LONG", entryWap: 63604, stopLossPrice: 64000, size: 43, contractSize: 0.01 }),
    ).toBeNull();
  });

  it("un stop justo en la entrada tampoco", () => {
    expect(
      riskFromStop({ direction: "LONG", entryWap: 63604, stopLossPrice: 63604, size: 43, contractSize: 0.01 }),
    ).toBeNull();
  });

  it("sin stop apuntado no se inventa nada", () => {
    expect(
      riskFromStop({ direction: "LONG", entryWap: 63604, stopLossPrice: null, size: 43, contractSize: 0.01 }),
    ).toBeNull();
  });

  it("sin tamaño de contrato no se calcula a ojo", () => {
    expect(
      riskFromStop({ direction: "LONG", entryWap: 63604, stopLossPrice: 63100, size: 43, contractSize: null }),
    ).toBeNull();
  });
});
