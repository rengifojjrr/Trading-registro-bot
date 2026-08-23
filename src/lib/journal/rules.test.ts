import { describe, expect, it } from "vitest";

import {
  computePlaybookAdherence,
  MIN_TRADES_PER_SIDE,
  type CheckedTrade,
  type PlaybookItem,
} from "./rules";

const PUNTO: PlaybookItem = { id: "p1", label: "Espero el retroceso" };
const OTRO: PlaybookItem = { id: "p2", label: "Nunca opero la primera vela" };

let n = 0;
const op = (netPnl: string, checks: { itemId: string; checked: boolean }[]): CheckedTrade => ({
  tradeId: `t${++n}`,
  netPnl,
  checks,
});

const repetir = (veces: number, netPnl: string, checked: boolean, itemId = PUNTO.id) =>
  Array.from({ length: veces }, () => op(netPnl, [{ itemId, checked }]));

describe("adherencia al guion", () => {
  it("no dice nada cuando no se ha marcado ninguna operación", () => {
    const resultado = computePlaybookAdherence([], [PUNTO]);
    expect(resultado.overallPct).toBeNull();
    expect(resultado.reviewedTrades).toBe(0);
    expect(resultado.verdict).toContain("Todavía no");
  });

  it("cuenta cuántas veces se cumplió cada punto", () => {
    const resultado = computePlaybookAdherence(
      [...repetir(2, "10", true), ...repetir(1, "-5", false)],
      [PUNTO],
    );
    expect(resultado.items[0].reviewed).toBe(3);
    expect(resultado.items[0].met).toBe(2);
    expect(resultado.items[0].adherencePct).toBeCloseTo(66.67, 1);
    expect(resultado.overallPct).toBeCloseTo(66.67, 1);
  });

  it("no compara resultados hasta tener operaciones a los dos lados", () => {
    // Con cuatro incumplidas siempre sale una diferencia y no significa nada.
    const resultado = computePlaybookAdherence(
      [...repetir(20, "100", true), ...repetir(MIN_TRADES_PER_SIDE - 1, "-100", false)],
      [PUNTO],
    );
    expect(resultado.items[0].medianWhenMet).toBeNull();
    expect(resultado.items[0].difference).toBeNull();
    expect(resultado.items[0].adherencePct).toBeGreaterThan(0);
    expect(resultado.verdict).toContain(String(MIN_TRADES_PER_SIDE));
  });

  it("compara medianas cuando hay muestra", () => {
    const resultado = computePlaybookAdherence(
      [
        ...repetir(MIN_TRADES_PER_SIDE, "120", true),
        ...repetir(MIN_TRADES_PER_SIDE, "-30", false),
      ],
      [PUNTO],
    );
    expect(resultado.items[0].medianWhenMet).toBe("120.00");
    expect(resultado.items[0].medianWhenMissed).toBe("-30.00");
    expect(resultado.items[0].difference).toBe("150.00");
    expect(resultado.verdict).toContain("Espero el retroceso");
    expect(resultado.verdict).toContain("coincidencia observada");
  });

  it("usa la mediana, así que una operación enorme no decide el punto", () => {
    const rotas = repetir(MIN_TRADES_PER_SIDE - 1, "10", false);
    rotas.push(op("5000", [{ itemId: PUNTO.id, checked: false }]));

    const resultado = computePlaybookAdherence(
      [...repetir(MIN_TRADES_PER_SIDE, "10", true), ...rotas],
      [PUNTO],
    );
    expect(resultado.items[0].medianWhenMissed).toBe("10.00");
    expect(resultado.items[0].difference).toBe("0.00");
  });

  it("señala el punto que coincide con operaciones peores cuando se cumple", () => {
    // Un punto que va al revés no es un detalle: es un punto que sobra, y el
    // guion entero pierde crédito mientras siga ahí.
    const resultado = computePlaybookAdherence(
      [
        ...repetir(MIN_TRADES_PER_SIDE, "200", true, PUNTO.id),
        ...repetir(MIN_TRADES_PER_SIDE, "0", false, PUNTO.id),
        ...repetir(MIN_TRADES_PER_SIDE, "-50", true, OTRO.id),
        ...repetir(MIN_TRADES_PER_SIDE, "50", false, OTRO.id),
      ],
      [PUNTO, OTRO],
    );
    expect(resultado.verdict).toContain(OTRO.label);
    expect(resultado.items[1].difference).toBe("-100.00");
  });

  it("lo dice cuando ningún punto coincide con operaciones mejores", () => {
    const resultado = computePlaybookAdherence(
      [
        ...repetir(MIN_TRADES_PER_SIDE, "-50", true),
        ...repetir(MIN_TRADES_PER_SIDE, "50", false),
      ],
      [PUNTO],
    );
    expect(resultado.verdict).toContain("Ningún punto");
  });

  it("un punto que nadie miró no inventa nada", () => {
    const resultado = computePlaybookAdherence(repetir(3, "10", true), [PUNTO, OTRO]);
    expect(resultado.items[1].reviewed).toBe(0);
    expect(resultado.items[1].adherencePct).toBeNull();
    expect(resultado.items[1].difference).toBeNull();
  });
});
