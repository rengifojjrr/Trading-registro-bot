import { describe, expect, it } from "vitest";

import { evaluateMissingPosition, evaluateUnrealizedDrift } from "./drift";

describe("evaluateUnrealizedDrift", () => {
  it("accepts a small difference between two API calls", () => {
    // Prices move between the moment we compute and the moment Coinbase
    // answers. Alarming on that would make the warning worthless.
    const result = evaluateUnrealizedDrift({ ours: "100.40", theirs: "100.00" });
    expect(result.severity).toBe("OK");
  });

  it("does not shout about pennies on a tiny position", () => {
    // 0.40 out of 1.00 is 40%, but it's still forty cents. Percentages get
    // loud near zero, which is exactly when they matter least.
    const result = evaluateUnrealizedDrift({ ours: "1.40", theirs: "1.00" });
    expect(result.severity).toBe("OK");
  });

  it("flags a structural difference", () => {
    const result = evaluateUnrealizedDrift({ ours: "160", theirs: "100" });
    expect(result.severity).toBe("ALARM");
    expect(result.differencePct).toBeCloseTo(60, 5);
  });

  it("names a wrong contract multiplier when the ratio gives it away", () => {
    // This is the failure the whole project started from: the figure being
    // a clean multiple of Coinbase's is almost always the multiplier.
    const result = evaluateUnrealizedDrift({ ours: "1000", theirs: "100" });
    expect(result.severity).toBe("ALARM");
    expect(result.message).toContain("tamaño de contrato");
    expect(result.message).toContain("10.00×");
  });

  it("also catches the multiplier being too small", () => {
    const result = evaluateUnrealizedDrift({ ours: "10", theirs: "1000" });
    expect(result.message).toContain("tamaño de contrato");
  });

  it("reports the direction of the difference", () => {
    // Sign matters: reporting more profit than reality is the dangerous
    // direction, and the caller needs to be able to tell them apart.
    expect(evaluateUnrealizedDrift({ ours: "160", theirs: "100" }).difference).toBe("60");
    expect(evaluateUnrealizedDrift({ ours: "40", theirs: "100" }).difference).toBe("-60");
  });

  it("separates watch from alarm by size", () => {
    expect(evaluateUnrealizedDrift({ ours: "105", theirs: "100" }).severity).toBe("WATCH");
    expect(evaluateUnrealizedDrift({ ours: "150", theirs: "100" }).severity).toBe("ALARM");
  });

  it("handles Coinbase reporting exactly zero without dividing by it", () => {
    const result = evaluateUnrealizedDrift({ ours: "25", theirs: "0" });
    expect(result.differencePct).toBeNull();
    expect(result.severity).toBe("WATCH");
    expect(Number.isNaN(Number(result.difference))).toBe(false);
  });
});

describe("evaluateMissingPosition", () => {
  it("no dice nada si esta aplicación tampoco cree que haya posición", () => {
    expect(evaluateMissingPosition({ ourSize: "0" })).toBeNull();
  });

  it("avisa cuando la aplicación muestra una posición y Coinbase no", () => {
    // El caso real: un corto fantasma de 1 contrato que quedó como resto
    // después de cerrar, con Coinbase reportando cuenta plana.
    const result = evaluateMissingPosition({ ourSize: "1" });
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("NO_POSITION");
    expect(result?.message).toContain("no reporta ninguna posición");
  });

  it("también avisa con una posición corta expresada en negativo", () => {
    const result = evaluateMissingPosition({ ourSize: "-3" });
    expect(result?.severity).toBe("NO_POSITION");
  });

  it("trata una cantidad no numérica como ausencia de posición", () => {
    expect(() => evaluateMissingPosition({ ourSize: "0.0" })).not.toThrow();
    expect(evaluateMissingPosition({ ourSize: "0.0" })).toBeNull();
  });
});

describe("la tolerancia va sobre el precio, no sobre el P&L", () => {
  // El caso real del 19 de agosto de 2026: 150 contratos nano cortos a
  // 67.950, nocional 101.925 dólares. Esta aplicación calcula con el último
  // precio negociado (68.695) y Coinbase publica contra el de liquidación
  // (68.775). Ochenta dólares de diferencia de precio -- un 0,12 % -- son
  // 120 dólares de P&L, casi un 10 % de los 1.237 que reporta Coinbase.
  const NOCIONAL = "103042.5"; // 150 × 0,01 × 68.695

  it("no da la alarma por la separación entre el último precio y el de liquidación", () => {
    const result = evaluateUnrealizedDrift({
      ours: "-1117.50",
      theirs: "-1237.50",
      notional: NOCIONAL,
    });
    expect(result.severity).toBe("OK");
    expect(result.message).toContain("liquidación");
  });

  it("sin el nocional habría dado la alarma, que es lo que hacía antes", () => {
    // Documenta por qué hizo falta el cambio: la misma comparación, juzgada
    // como porcentaje del P&L, alarma sobre algo que es normal. Una alarma
    // que salta siempre enseña a ignorarla.
    const result = evaluateUnrealizedDrift({ ours: "-1117.50", theirs: "-1237.50" });
    expect(result.severity).not.toBe("OK");
  });

  it("sigue cazando un multiplicador equivocado", () => {
    // Diez veces el P&L implica una separación de precio enorme: la
    // tolerancia nueva no le hace ni cosquillas.
    const result = evaluateUnrealizedDrift({ ours: "12375", theirs: "1237.50", notional: NOCIONAL });
    expect(result.severity).toBe("ALARM");
    expect(result.message).toContain("tamaño de contrato");
  });

  it("sigue cazando un fill que falta", () => {
    // Es el caso de esta semana: 151 contratos a 66.893 en vez de 150 a
    // 67.950 daban -2.720 contra los -1.237 de Coinbase.
    const result = evaluateUnrealizedDrift({
      ours: "-2720.61",
      theirs: "-1237.50",
      notional: NOCIONAL,
    });
    expect(result.severity).toBe("ALARM");
    expect(result.message).toContain("fill");
  });

  it("un nocional inservible no cuela como cero", () => {
    // Dividir entre cero daría un porcentaje infinito, y entre basura, NaN:
    // en los dos casos se vuelve a la comparación de antes en vez de dar
    // cualquier cosa por buena.
    for (const notional of ["0", "", "no-sé", null]) {
      expect(
        evaluateUnrealizedDrift({ ours: "-1117.50", theirs: "-1237.50", notional }).severity,
        String(notional),
      ).not.toBe("OK");
    }
  });

  it("céntimos siguen sin decir nada, con nocional o sin él", () => {
    expect(evaluateUnrealizedDrift({ ours: "1.40", theirs: "1.00", notional: NOCIONAL }).severity).toBe("OK");
  });
});
