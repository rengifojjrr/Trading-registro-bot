import { describe, expect, it } from "vitest";

import { currentDrawdownPct, evaluateKillSwitch, ladder } from "./killswitch";
import { DEFAULT_PORTFOLIO_SETTINGS } from "./types";

const escalera = DEFAULT_PORTFOLIO_SETTINGS.killSwitch;

describe("evaluateKillSwitch", () => {
  it("la escalera de fábrica es 8/12/15/20", () => {
    expect(ladder(escalera).map((s) => s.threshold)).toEqual([8, 12, 15, 20]);
  });

  it("dentro del perfil no hay nivel", () => {
    const r = evaluateKillSwitch(5, escalera);
    expect(r.level).toBe(0);
    expect(r.next?.level).toBe(1);
  });

  it("tocar el umbral no lo activa; pasarlo sí", () => {
    expect(evaluateKillSwitch(8, escalera).level).toBe(0);
    expect(evaluateKillSwitch(8.1, escalera).level).toBe(1);
  });

  it("cada escalón trae su instrucción y el siguiente", () => {
    const reducir = evaluateKillSwitch(13, escalera);
    expect(reducir.level).toBe(2);
    expect(reducir.instruction).toContain("50%");
    expect(reducir.next?.level).toBe(3);

    const apagon = evaluateKillSwitch(25, escalera);
    expect(apagon.level).toBe(4);
    expect(apagon.next).toBeNull();
  });

  it("sin medida no hay nivel, y lo dice", () => {
    const r = evaluateKillSwitch(null, escalera);
    expect(r.level).toBe(0);
    expect(r.instruction).toContain("tamaño de la cuenta");
  });
});

describe("currentDrawdownPct", () => {
  it("mide desde el pico con el capital más el pico como base", () => {
    const r = currentDrawdownPct([100, -50, -30], 1000);
    expect(r.peak).toBe(100);
    expect(r.drawdownMoney).toBe(80);
    expect(r.drawdownPct).toBeCloseTo((80 / 1100) * 100, 6);
    expect(r.durationTrades).toBe(2);
  });

  it("en máximos no hay drawdown", () => {
    const r = currentDrawdownPct([10, 20], 1000);
    expect(r.drawdownMoney).toBe(0);
    expect(r.drawdownPct).toBe(0);
    expect(r.durationTrades).toBe(0);
  });

  it("sin capital no hay porcentaje", () => {
    expect(currentDrawdownPct([10, -5], null).drawdownPct).toBeNull();
  });
});
