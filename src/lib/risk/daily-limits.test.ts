import { describe, expect, it } from "vitest";

import { evaluateDailyLimits } from "./daily-limits";

describe("límites diarios", () => {
  it("un día en verde no dispara nada", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: ["152.25", "80"],
      maxDailyLoss: "500",
      maxTradesPerDay: 5,
    });
    expect(estado.breaches).toEqual([]);
    expect(estado.message).toBeNull();
    expect(estado.lossToday).toBe("0");
  });

  it("avisa al alcanzar el tope, no al pasarse", () => {
    // Pasarse ya es tarde. El aviso sirve en el último momento en el que
    // parar todavía cambia algo.
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-500"],
      maxDailyLoss: "500",
      maxTradesPerDay: null,
    });
    expect(estado.breaches).toContain("PERDIDA_DIARIA");
  });

  it("cuenta la pérdida neta del día, no la peor operación", () => {
    // -605,81 y +152,25 son 453,56 de pérdida: por debajo del tope, aunque
    // una sola operación lo pasara.
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-605.81", "152.25"],
      maxDailyLoss: "500",
      maxTradesPerDay: null,
    });
    expect(estado.lossToday).toBe("453.56");
    expect(estado.breaches).toEqual([]);
  });

  it("avisa también por número de operaciones", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: ["10", "10", "10"],
      maxDailyLoss: null,
      maxTradesPerDay: 3,
    });
    expect(estado.breaches).toEqual(["OPERACIONES_DIARIAS"]);
    expect(estado.message).toContain("3 operaciones");
  });

  it("puede saltar por las dos a la vez", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-300", "-300"],
      maxDailyLoss: "500",
      maxTradesPerDay: 2,
    });
    expect(estado.breaches).toHaveLength(2);
  });

  it("sin topes configurados no dice nada", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-9000"],
      maxDailyLoss: null,
      maxTradesPerDay: null,
    });
    expect(estado.breaches).toEqual([]);
  });

  it("un tope de cero no cuenta como tope", () => {
    // Cero es «no configurado» en un campo numérico vacío, no «no puedo
    // perder nada»; tratarlo como tope avisaría el primer día siempre.
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-10"],
      maxDailyLoss: "0",
      maxTradesPerDay: 0,
    });
    expect(estado.breaches).toEqual([]);
  });

  it("un tope apuntado en negativo se entiende igual", () => {
    // «Máxima pérdida diaria: -500» es lo que mucha gente escribe.
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-600"],
      maxDailyLoss: "-500",
      maxTradesPerDay: null,
    });
    expect(estado.breaches).toContain("PERDIDA_DIARIA");
  });

  it("las operaciones sin resultado no cuentan como cerradas", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: [null, "-10", null],
      maxDailyLoss: null,
      maxTradesPerDay: 2,
    });
    expect(estado.tradesClosedToday).toBe(1);
    expect(estado.breaches).toEqual([]);
  });

  it("no sermonea", () => {
    const estado = evaluateDailyLimits({
      netPnlsToday: ["-600"],
      maxDailyLoss: "500",
      maxTradesPerDay: null,
    });
    expect(estado.message).toContain("Lo decidiste tú en frío");
  });
});
