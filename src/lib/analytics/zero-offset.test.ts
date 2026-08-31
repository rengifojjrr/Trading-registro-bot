import { describe, expect, it } from "vitest";

import { zeroOffset } from "./zero-offset";

describe("dónde cae el cero", () => {
  it("una curva que nunca bajó de cero es toda verde", () => {
    // Offset 1 deja la parada del rojo pegada al borde de abajo, así que no
    // llega a pintarse nada.
    expect(zeroOffset([10, 50, 30])).toBe(1);
  });

  it("una curva que nunca subió de cero es toda roja", () => {
    expect(zeroOffset([-10, -50, -30])).toBe(0);
  });

  it("simétrica, el corte cae justo en la mitad", () => {
    expect(zeroOffset([100, -100])).toBeCloseTo(0.5, 9);
  });

  it("con más recorrido abajo, el corte sube", () => {
    // Sube 1.000 y baja 3.000: el cero está a un cuarto de la altura.
    expect(zeroOffset([1000, -3000])).toBeCloseTo(0.25, 9);
  });

  it("con más recorrido arriba, el corte baja", () => {
    expect(zeroOffset([3000, -1000])).toBeCloseTo(0.75, 9);
  });

  it("es la curva de la captura: mucho más rojo que verde", () => {
    // Los valores del gráfico que se ve en pantalla: llega a +2.500 y baja a
    // -7.500. El corte tiene que quedar arriba del todo, no en el medio.
    const offset = zeroOffset([0, 1000, -2000, 2500, -7500, -6800]);
    expect(offset).toBeCloseTo(0.25, 2);
  });

  it("tocar el cero exacto cuenta como el lado positivo", () => {
    // Estar en tablas no es haber perdido.
    expect(zeroOffset([0, 5])).toBe(1);
    expect(zeroOffset([0, -5])).toBe(0);
  });

  it("siempre está entre cero y uno", () => {
    // Fuera de ese rango el degradado se sale del trazo y el corte no se ve.
    const casos = [[5, -5], [1, -1000], [1000, -1], [0], [-3, 7, -9, 2]];
    for (const valores of casos) {
      const offset = zeroOffset(valores);
      expect(offset, String(valores)).toBeGreaterThanOrEqual(0);
      expect(offset, String(valores)).toBeLessThanOrEqual(1);
    }
  });

  it("sin datos no divide por cero", () => {
    expect(Number.isFinite(zeroOffset([]))).toBe(true);
  });

  it("una curva plana en cero no divide por cero", () => {
    // max y min iguales harían `0 / 0`.
    expect(Number.isFinite(zeroOffset([0, 0, 0]))).toBe(true);
  });
});
