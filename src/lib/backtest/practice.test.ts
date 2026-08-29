import { describe, expect, it } from "vitest";

import type { Vela } from "@/lib/charts/indicators";

import {
  checkPracticeExit,
  practicePnl,
  summarisePractice,
  type PracticePosition,
  type PracticeTrade,
} from "./practice";

const vela = (over: Partial<Vela>): Vela => ({
  time: 0,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 1,
  ...over,
});

const larga: PracticePosition = {
  direction: "LONG",
  entryIndex: 0,
  entryPrice: 100,
  stop: 95,
  target: 110,
  size: 1,
};

describe("cerrar una operación de práctica", () => {
  it("no cierra si la vela no toca ningún nivel", () => {
    expect(checkPracticeExit(larga, vela({ high: 105, low: 98 }))).toBeNull();
  });

  it("el stop cierra al tocarse", () => {
    const salida = checkPracticeExit(larga, vela({ open: 99, high: 100, low: 94 }));
    expect(salida).toEqual({ price: 95, reason: "STOP" });
  });

  it("el objetivo cierra al tocarse", () => {
    const salida = checkPracticeExit(larga, vela({ open: 105, high: 112, low: 104 }));
    expect(salida).toEqual({ price: 110, reason: "OBJETIVO" });
  });

  it("si se tocan los dos, gana el stop", () => {
    // Practicar con reglas más generosas que las de verdad enseña a confiar en
    // resultados que no van a repetirse.
    const salida = checkPracticeExit(larga, vela({ open: 100, high: 200, low: 10 }));
    expect(salida!.reason).toBe("STOP");
  });

  it("si la vela abre pasada del stop, se sale a la apertura", () => {
    const salida = checkPracticeExit(larga, vela({ open: 80, high: 82, low: 78 }));
    expect(salida).toEqual({ price: 80, reason: "STOP" });
  });

  it("en corto los lados se invierten", () => {
    const corta: PracticePosition = { ...larga, direction: "SHORT", stop: 105, target: 90 };
    expect(checkPracticeExit(corta, vela({ open: 101, high: 106, low: 100 }))!.reason).toBe("STOP");
    expect(checkPracticeExit(corta, vela({ open: 99, high: 100, low: 88 }))!.reason).toBe(
      "OBJETIVO",
    );
  });

  it("sin niveles no cierra sola", () => {
    const suelta: PracticePosition = { ...larga, stop: null, target: null };
    expect(checkPracticeExit(suelta, vela({ high: 500, low: 1 }))).toBeNull();
  });
});

describe("el resultado", () => {
  it("una larga gana si el precio sube", () => {
    expect(practicePnl(larga, 110, 1)).toBe("10.00");
  });

  it("una corta gana si el precio baja", () => {
    const corta: PracticePosition = { ...larga, direction: "SHORT" };
    expect(practicePnl(corta, 90, 1)).toBe("10.00");
  });

  it("multiplica por el tamaño de contrato", () => {
    // Equivocar el multiplicador deja todas las cifras mal por el mismo
    // factor, que es la clase de error que no se nota.
    expect(practicePnl(larga, 110, 0.01)).toBe("0.10");
    expect(practicePnl({ ...larga, size: 3 }, 110, 0.01)).toBe("0.30");
  });
});

describe("el resumen", () => {
  const velas = [vela({ close: 100 }), vela({ close: 110 }), vela({ close: 120 })];
  const trade = (netPnl: string): PracticeTrade => ({
    direction: "LONG",
    entryIndex: 0,
    exitIndex: 1,
    entryPrice: 100,
    exitPrice: 105,
    size: 1,
    netPnl,
    reason: "MANUAL",
  });

  it("compara contra comprar y aguantar", () => {
    // Sin esa referencia, un resultado positivo parece bueno: si el precio
    // subió 20 y tú ganaste 3 operando, lo hiciste peor que no hacer nada.
    const resumen = summarisePractice([trade("3")], velas, 0, 1, 1);
    expect(resumen.neto).toBe("3.00");
    expect(resumen.comprarYAguantar).toBe("20.00");
  });

  it("cuenta aciertos", () => {
    const resumen = summarisePractice([trade("5"), trade("-2"), trade("1")], velas, 0, 1, 1);
    expect(resumen.operaciones).toBe(3);
    expect(resumen.ganadoras).toBe(2);
    expect(resumen.aciertos).toBeCloseTo(66.67, 1);
  });

  it("sin operaciones no divide por cero", () => {
    const resumen = summarisePractice([], velas, 0, 1, 1);
    expect(resumen.aciertos).toBe(0);
    expect(resumen.neto).toBe("0.00");
  });
});
