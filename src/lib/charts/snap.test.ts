import { describe, expect, it } from "vitest";

import { snapToCandle } from "./snap";

const velas = [
  { time: 100, open: 68000, high: 68200, low: 67900, close: 68100 },
  { time: 200, open: 68100, high: 68500, low: 68050, close: 68400 },
  { time: 300, open: 68400, high: 68450, low: 67800, close: 67850 },
];

describe("el imán", () => {
  it("pega al mínimo cuando el clic cae cerca del mínimo", () => {
    // Es el caso de verdad: trazar un soporte «sobre el mínimo» y que quede
    // exactamente en el mínimo, no tres píxeles por debajo.
    expect(snapToCandle({ time: 305, price: 67815 }, velas)).toEqual({
      time: 300,
      price: 67800,
    });
  });

  it("pega al máximo cuando el clic cae cerca del máximo", () => {
    expect(snapToCandle({ time: 198, price: 68490 }, velas)).toEqual({
      time: 200,
      price: 68500,
    });
  });

  it("pega al cierre si es el más cercano de los cuatro", () => {
    expect(snapToCandle({ time: 100, price: 68095 }, velas)).toEqual({
      time: 100,
      price: 68100,
    });
  });

  it("elige la vela más cercana, no la anterior siempre", () => {
    // 260 está más cerca de 300 que de 200: pegar siempre a la de la izquierda
    // haría que el dibujo saltara hacia atrás una vela.
    expect(snapToCandle({ time: 260, price: 68400 }, velas).time).toBe(300);
    expect(snapToCandle({ time: 240, price: 68400 }, velas).time).toBe(200);
  });

  it("no se sale de la lista por los extremos", () => {
    expect(snapToCandle({ time: 0, price: 68000 }, velas).time).toBe(100);
    expect(snapToCandle({ time: 9999, price: 68000 }, velas).time).toBe(300);
  });

  it("sin velas devuelve el punto tal cual", () => {
    // El imán es una ayuda, no un requisito: un gráfico todavía sin datos
    // tiene que dejar dibujar igual.
    const punto = { time: 123, price: 456 };
    expect(snapToCandle(punto, [])).toEqual(punto);
  });
});
