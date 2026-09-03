import { describe, expect, it } from "vitest";

import { calculatePnl } from "./calculate";

/**
 * `fifoRealizedPoints` sustituye a la fórmula de los WAP para el bruto
 * realizado de una operación abierta. Ver docs/PNL_METHODOLOGY.md,
 * «Operación abierta».
 */
describe("calculatePnl -- realizado por lotes FIFO en una operación abierta", () => {
  // Compras 50 a 100, te cierran 28 a 110, recompras 28 a 120, te cierran 28
  // a 130: quedan 22 abiertos. Con los WAP el realizado sale de una media que
  // mezcla lo cerrado con lo que sigue abierto.
  const base = {
    direction: "LONG" as const,
    entryWap: "107.17948717948717949", // (50×100 + 28×120) / 78
    exitWap: "120", // (28×110 + 28×130) / 56
    totalEntryQty: "78",
    totalExitQty: "56",
    entryCommissions: "10",
    exitCommissions: "5",
    contractSize: "0.01",
  };

  it("con lotes: 1.000 puntos × 0,01 = 10 brutos, 10 − 15 de comisiones netos", () => {
    const result = calculatePnl({ ...base, fifoRealizedPoints: "1000" });

    expect(result.grossPnl).toBe("10");
    expect(result.netPnl).toBe("-5");
  });

  it("sin lotes (o con null): la fórmula de los WAP de siempre", () => {
    const sinLotes = calculatePnl(base);
    const conNull = calculatePnl({ ...base, fifoRealizedPoints: null });

    // (120 − 107,179…) × 56 × 0,01 ≈ 7,18: la misma suma total que FIFO sólo
    // cuando la operación está cerrada; abierta, reparte distinto.
    expect(Number(sinLotes.grossPnl)).toBeCloseTo(7.179, 3);
    expect(conNull.grossPnl).toBe(sinLotes.grossPnl);
  });

  it("sin nada cerrado sigue sin haber realizado, lleve lotes o no", () => {
    const result = calculatePnl({
      ...base,
      exitWap: null,
      totalExitQty: "0",
      fifoRealizedPoints: "0",
    });

    expect(result.grossPnl).toBeNull();
    expect(result.netPnl).toBeNull();
  });

  it("el nocional no cambia: sigue siendo la media de todas las entradas por todo lo entrado", () => {
    const result = calculatePnl({ ...base, fifoRealizedPoints: "1000" });

    // 107,179… × 78 × 0,01 = 83,6
    expect(Number(result.notionalValue)).toBeCloseTo(83.6, 6);
  });
});
