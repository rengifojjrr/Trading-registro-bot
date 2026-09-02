import { describe, expect, it } from "vitest";

import {
  BLOCKS,
  DEFAULT_PORTFOLIO_SETTINGS,
  PIPELINE_PHASES,
  STYLES,
  STYLE_BLOCK,
  isBotPhase,
  isImpulseAction,
  isProduction,
  isRetirementReason,
  nextPhase,
  previousPhase,
} from "./types";

describe("las fases de la cantera", () => {
  it("suben de una en una y se acaban en producción", () => {
    expect(nextPhase("F1")).toBe("F2");
    expect(nextPhase("F6")).toBe("F7");
    expect(nextPhase("F7")).toBeNull();
    expect(nextPhase("RETIRADO")).toBeNull();
  });

  it("bajan de una en una y no pasan de F1", () => {
    expect(previousPhase("F4")).toBe("F3");
    expect(previousPhase("F1")).toBeNull();
    expect(previousPhase("RETIRADO")).toBeNull();
  });

  it("sólo staging y producción operan de verdad", () => {
    expect(PIPELINE_PHASES.filter(isProduction)).toEqual(["F6", "F7"]);
    expect(isProduction("RETIRADO")).toBe(false);
  });
});

describe("los valores de fábrica", () => {
  it("los bloques suman el cien por cien", () => {
    const suma = BLOCKS.reduce((acc, b) => acc + DEFAULT_PORTFOLIO_SETTINGS.targets[b], 0);
    expect(suma).toBe(100);
  });

  it("la escalera sube", () => {
    const { alert, reduce, close, off } = DEFAULT_PORTFOLIO_SETTINGS.killSwitch;
    expect(alert).toBeLessThan(reduce);
    expect(reduce).toBeLessThan(close);
    expect(close).toBeLessThan(off);
  });

  it("cada familia tiene un bloque por defecto", () => {
    for (const style of STYLES) expect(BLOCKS).toContain(STYLE_BLOCK[style]);
  });
});

describe("las guardas", () => {
  it("reconocen lo suyo y rechazan lo demás", () => {
    expect(isBotPhase("F3")).toBe(true);
    expect(isBotPhase("RETIRADO")).toBe(true);
    expect(isBotPhase("F8")).toBe(false);
    expect(isRetirementReason("ALPHA_DECAY")).toBe(true);
    expect(isRetirementReason("CANSANCIO")).toBe(false);
    expect(isImpulseAction("APAGAR")).toBe(true);
    expect(isImpulseAction(null)).toBe(false);
  });
});
