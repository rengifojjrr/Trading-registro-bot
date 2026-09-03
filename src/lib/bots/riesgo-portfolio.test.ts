import { describe, expect, it } from "vitest";

import { blockAllocation } from "./blocks";
import {
  MINIMO_DIAS_PARA_VAR,
  repartoPorBloques,
  riesgoDelPortfolio,
  riesgoDiario,
} from "./riesgo-portfolio";
import { DEFAULT_PORTFOLIO_SETTINGS, type BotBlock, type BotPhase } from "./types";

const targets = DEFAULT_PORTFOLIO_SETTINGS.targets;

/** Cien días de P&L, de -50 a +49: el peor día pierde 50 y la mitad son rojos. */
const CIEN_DIAS = Array.from({ length: 100 }, (_, i) => i - 50);

function bot(block: BotBlock, phase: BotPhase, sizingPct: number) {
  return { block, phase, sizingPct };
}

describe("riesgoDiario", () => {
  it("sin días no hay nada que medir", () => {
    expect(riesgoDiario([], 10_000)).toBeNull();
  });

  it("el VaR al 95% es el percentil de la muestra, no una campana ajustada", () => {
    const r = riesgoDiario(CIEN_DIAS, null)!;

    // Ordenados de peor a mejor, el corte del 5% cae en el quinto día: -46.
    expect(r.var95).toBe(46);
    expect(r.peorDia).toBe(50);
    expect(r.diasEnPerdida).toBe(50);
    expect(r.dias).toBe(100);
  });

  it("el CVaR al 99% mira la cola, y con cien días la cola es el peor día", () => {
    const r = riesgoDiario(CIEN_DIAS, null)!;
    expect(r.cvar99).toBe(50);
    expect(r.cvar99).toBeGreaterThanOrEqual(r.var95);
  });

  it("promedia la cola cuando hay cola que promediar", () => {
    // Doscientos días: el peor 1% son dos, de -200 y -199.
    const dos = Array.from({ length: 200 }, (_, i) => i - 200);
    const r = riesgoDiario(dos, null)!;
    expect(r.cvar99).toBeCloseTo(199.5, 10);
    expect(r.cvarSobreUnSoloDia).toBe(false);
  });

  it("el porcentaje sale del capital, y sin capital no sale", () => {
    expect(riesgoDiario(CIEN_DIAS, 10_000)!.var95Pct).toBeCloseTo(0.46, 10);
    expect(riesgoDiario(CIEN_DIAS, null)!.var95Pct).toBeNull();
  });

  it("una muestra de días buenos no inventa una pérdida", () => {
    const r = riesgoDiario([10, 20, 30, 40], null)!;
    expect(r.var95).toBe(0);
    expect(r.cvar99).toBe(0);
    expect(r.diasEnPerdida).toBe(0);
  });

  it("con menos de treinta días avisa de que la cifra es decorativa", () => {
    const r = riesgoDiario([-5, -3, 1, 2, 4], null)!;
    expect(r.muestraCorta).toBe(true);
    expect(r.nota).toContain(String(MINIMO_DIAS_PARA_VAR));
    expect(riesgoDiario(CIEN_DIAS, null)!.muestraCorta).toBe(false);
  });
});

describe("repartoPorBloques", () => {
  it("el 40/40/20 clavado no se desvía", () => {
    const r = repartoPorBloques(
      blockAllocation([bot("CONVEXO", "F7", 40), bot("CONCAVO", "F7", 40), bot("HIBRIDO", "F7", 20)], targets),
    );

    expect(r.desvia).toBe(false);
    expect(r.filas.map((f) => f.desvio)).toEqual([0, 0, 0]);
    expect(r.peor?.desvio).toBe(0);
    expect(r.base).toBe("SIZING");
  });

  it("marca los bloques fuera de la banda de diez puntos y señala el peor", () => {
    const r = repartoPorBloques(blockAllocation([bot("CONVEXO", "F7", 60), bot("CONCAVO", "F7", 40)], targets));

    expect(r.desvia).toBe(true);
    expect(r.filas.find((f) => f.bloque === "CONVEXO")).toMatchObject({ real: 60, desvio: 20, fuera: true });
    expect(r.filas.find((f) => f.bloque === "CONCAVO")?.fuera).toBe(false);
    expect(r.filas.find((f) => f.bloque === "HIBRIDO")).toMatchObject({ desvio: -20, fuera: true, bots: 0 });
    expect(r.peor?.bloque).toBe("CONVEXO");
  });

  it("sin bots con dinero no hay reparto ni peor bloque", () => {
    const r = repartoPorBloques(blockAllocation([bot("CONVEXO", "F1", 0)], targets));
    expect(r.base).toBe("NONE");
    expect(r.desvia).toBe(false);
    expect(r.peor).toBeNull();
  });
});

describe("riesgoDelPortfolio", () => {
  const equilibrado = blockAllocation(
    [bot("CONVEXO", "F7", 40), bot("CONCAVO", "F7", 40), bot("HIBRIDO", "F7", 20)],
    targets,
  );

  it("un portfolio con muestra, capital y bloques cuadrados no tiene nada que avisar", () => {
    const r = riesgoDelPortfolio({ pnlDiario: CIEN_DIAS, accountSize: 10_000, allocation: equilibrado });
    expect(r.avisos).toEqual([]);
    expect(r.diario?.var95).toBe(46);
  });

  it("avisa de la muestra corta, de la falta de capital y de los bloques desviados", () => {
    const r = riesgoDelPortfolio({
      pnlDiario: [-5, 2, 3],
      accountSize: null,
      allocation: blockAllocation([bot("CONVEXO", "F7", 100)], targets),
    });

    expect(r.avisos.some((a) => a.includes("30"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("tamaño de la cuenta"))).toBe(true);
    expect(r.avisos.some((a) => a.startsWith("Convexo al 100%"))).toBe(true);
  });

  it("sin ningún día cerrado lo dice en vez de enseñar un cero", () => {
    const r = riesgoDelPortfolio({ pnlDiario: [], accountSize: 10_000, allocation: equilibrado });
    expect(r.diario).toBeNull();
    expect(r.avisos[0]).toContain("no hay VaR que calcular");
  });
});
