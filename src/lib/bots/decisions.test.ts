import { describe, expect, it } from "vitest";

import { gated, pendingDecisions, type BotForDecisions, type PortfolioForDecisions } from "./decisions";
import type { BotPhase, Semaforo } from "./types";

function bot(
  parcial: Omit<Partial<BotForDecisions>, "health"> & { phase: BotPhase; health?: Semaforo },
): BotForDecisions {
  const { health, ...resto } = parcial;
  return {
    id: "b1",
    name: "Atún",
    block: "CONVEXO",
    health: { state: health ?? "VERDE", reasons: ["motivo"] },
    gate: { verdict: "RETENIDO", summary: "Retenido" },
    contractBreached: false,
    tradesLast30Days: 5,
    expectedTradesPerMonth: null,
    ...resto,
  };
}

function portfolio(parcial: Partial<PortfolioForDecisions>): PortfolioForDecisions {
  return {
    bots: [],
    killSwitch: { level: 0, label: "Sin activación", instruction: "", drawdownPct: 2 },
    allocation: { deviates: false, rows: [], basis: "SIZING" },
    redundantPairs: [],
    impulsesToEvaluate: 0,
    ...parcial,
  };
}

describe("pendingDecisions", () => {
  it("con todo en orden no pide nada", () => {
    expect(pendingDecisions(portfolio({}))).toEqual([]);
  });

  it("la escalera va la primera y es crítica desde el segundo escalón", () => {
    const r = pendingDecisions(
      portfolio({
        killSwitch: { level: 2, label: "Reducción", instruction: "Reducir.", drawdownPct: 13 },
        bots: [bot({ phase: "F7", health: "NARANJA" })],
      }),
    );
    expect(r[0].id).toBe("bots-killswitch");
    expect(r[0].severity).toBe("CRITICO");
    expect(r[0].detail).toContain("13.0%");
    expect(r[1].id).toBe("bot-b1-naranja");
  });

  it("el primer escalón es sólo un aviso", () => {
    const r = pendingDecisions(
      portfolio({ killSwitch: { level: 1, label: "Alerta", instruction: "Vigilar.", drawdownPct: 9 } }),
    );
    expect(r[0].severity).toBe("AVISO");
  });

  it("los semáforos sólo cuentan en producción", () => {
    const enCantera = pendingDecisions(portfolio({ bots: [bot({ phase: "F4", health: "NARANJA" })] }));
    expect(enCantera).toEqual([]);

    const amarillo = pendingDecisions(portfolio({ bots: [bot({ phase: "F6", health: "AMARILLO" })] }));
    expect(amarillo[0].actionLabel).toBe("Reducir al 50%");
    expect(amarillo[0].severity).toBe("AVISO");
  });

  it("el contrato incumplido es crítico", () => {
    const r = pendingDecisions(portfolio({ bots: [bot({ phase: "F7", contractBreached: true })] }));
    expect(r[0].id).toBe("bot-b1-contract");
    expect(r[0].severity).toBe("CRITICO");
  });

  it("una puerta abierta desde F4 pide el ascenso", () => {
    const r = pendingDecisions(
      portfolio({ bots: [bot({ phase: "F5", gate: { verdict: "GO", summary: "5/5" } })] }),
    );
    expect(r[0].title).toContain("Staging");
    expect(r[0].actionLabel).toBe("Ascender");
  });

  it("antes de F4 la puerta no decide, y en F7 no hay a dónde subir", () => {
    const f2 = pendingDecisions(portfolio({ bots: [bot({ phase: "F2", gate: { verdict: "GO", summary: "" } })] }));
    const f7 = pendingDecisions(portfolio({ bots: [bot({ phase: "F7", gate: { verdict: "GO", summary: "" } })] }));
    expect(f2).toEqual([]);
    expect(f7).toEqual([]);
  });

  it("los retirados no molestan", () => {
    const r = pendingDecisions(
      portfolio({ bots: [bot({ phase: "RETIRADO", health: "NARANJA", contractBreached: true })] }),
    );
    expect(r).toEqual([]);
  });

  it("el watchdog avisa cuando un bot en producción deja de latir", () => {
    const parado = pendingDecisions(
      portfolio({ bots: [bot({ phase: "F7", tradesLast30Days: 0, expectedTradesPerMonth: 8 })] }),
    );
    expect(parado[0].id).toBe("bot-b1-watchdog");
    expect(parado[0].severity).toBe("AVISO");
    expect(parado[0].detail).toContain("0 operaciones en treinta días");

    // Con un cuarto de lo esperado ya late; en la cantera no se vigila; sin
    // expectativa no hay ritmo que comparar.
    expect(pendingDecisions(portfolio({ bots: [bot({ phase: "F7", tradesLast30Days: 2, expectedTradesPerMonth: 8 })] }))).toEqual([]);
    expect(pendingDecisions(portfolio({ bots: [bot({ phase: "F4", tradesLast30Days: 0, expectedTradesPerMonth: 8 })] }))).toEqual([]);
    expect(pendingDecisions(portfolio({ bots: [bot({ phase: "F7", tradesLast30Days: 0, expectedTradesPerMonth: null })] }))).toEqual([]);
    expect(pendingDecisions(portfolio({ bots: [bot({ phase: "F7", tradesLast30Days: 0, expectedTradesPerMonth: 1 })] }))).toEqual([]);
  });

  it("los bloques, las correlaciones y los impulsos, por orden de peso", () => {
    const r = pendingDecisions(
      portfolio({
        allocation: {
          deviates: true,
          basis: "SIZING",
          rows: [
            { block: "CONVEXO", target: 40, actual: 60, delta: 20, bots: 2 },
            { block: "CONCAVO", target: 40, actual: 40, delta: 0, bots: 1 },
            { block: "HIBRIDO", target: 20, actual: 0, delta: -20, bots: 0 },
          ],
        },
        redundantPairs: [{ a: "Atún", b: "Sardina", rho: 0.72 }],
        impulsesToEvaluate: 2,
      }),
    );
    expect(r.map((i) => i.id)).toEqual(["bots-bloques", "bots-correlacion", "bots-impulsos"]);
    expect(r[0].detail).toContain("Convexo al 60%");
    expect(r[0].detail).not.toContain("Cóncavo");
    expect(r[1].title).toBe("Atún y Sardina son medio gemelos");
    expect(r[2].title).toBe("2 impulsos ya se pueden evaluar");
  });
});

describe("gated", () => {
  it("de F4 a F6 decide la puerta", () => {
    expect(gated("F3")).toBe(false);
    expect(gated("F4")).toBe(true);
    expect(gated("F6")).toBe(true);
    expect(gated("F7")).toBe(false);
    expect(gated("RETIRADO")).toBe(false);
  });
});
