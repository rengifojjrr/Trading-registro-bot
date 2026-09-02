import { describe, expect, it } from "vitest";

import { blockAllocation } from "./blocks";
import { DEFAULT_PORTFOLIO_SETTINGS, type BotBlock, type BotPhase } from "./types";

const targets = DEFAULT_PORTFOLIO_SETTINGS.targets;

function bot(block: BotBlock, phase: BotPhase, sizingPct: number) {
  return { block, phase, sizingPct };
}

describe("blockAllocation", () => {
  it("sólo cuenta los bots en producción", () => {
    const r = blockAllocation([bot("CONVEXO", "F7", 40), bot("CONCAVO", "F3", 40)], targets);
    expect(r.basis).toBe("SIZING");
    expect(r.rows.find((f) => f.block === "CONVEXO")?.actual).toBe(100);
    expect(r.rows.find((f) => f.block === "CONCAVO")?.bots).toBe(0);
  });

  it("reparte por tamaño asignado", () => {
    const r = blockAllocation(
      [bot("CONVEXO", "F7", 40), bot("CONCAVO", "F7", 40), bot("HIBRIDO", "F6", 20)],
      targets,
    );
    expect(r.rows.map((f) => f.actual)).toEqual([40, 40, 20]);
    expect(r.deviates).toBe(false);
    expect(r.totalSizingPct).toBe(100);
  });

  it("si nadie tiene tamaño, cuenta bots", () => {
    const r = blockAllocation([bot("CONVEXO", "F7", 0), bot("CONVEXO", "F7", 0)], targets);
    expect(r.basis).toBe("COUNT");
    expect(r.rows.find((f) => f.block === "CONVEXO")?.actual).toBe(100);
  });

  it("avisa cuando un bloque se sale más de diez puntos", () => {
    const r = blockAllocation([bot("CONVEXO", "F7", 60), bot("CONCAVO", "F7", 40)], targets);
    expect(r.deviates).toBe(true);
    expect(r.rows.find((f) => f.block === "HIBRIDO")?.delta).toBe(-20);
  });

  it("sin producción no hay reparto ni aviso", () => {
    const r = blockAllocation([bot("CONVEXO", "F1", 0)], targets);
    expect(r.basis).toBe("NONE");
    expect(r.deviates).toBe(false);
  });
});
