import { describe, expect, it } from "vitest";

import type { Vela } from "@/lib/charts/indicators";

import { VELAS_DE_RECUPERACION, ultimaVelaCerrada, velasPendientes } from "./recuperacion";

/** Velas de un minuto seguidas, empezando en `desde` (segundos). */
function velasDe(cuantas: number, desde = 1_000_000, paso = 60): Vela[] {
  return Array.from({ length: cuantas }, (_, i) => ({
    time: desde + i * paso,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }));
}

describe("qué velas quedan por evaluar", () => {
  it("sin nada evaluado sólo mira la última, no el histórico entero", () => {
    // Un bot recién encendido no operó ayer. Recorrer las trescientas velas
    // que trae el mercado le inventaría un histórico anterior a su encendido.
    const velas = velasDe(300);
    expect(velasPendientes(velas, null)).toEqual([299]);
  });

  it("recupera todas las velas cerradas desde la última evaluada", () => {
    // El caso que motivó esto: el ciclo corre cada cinco minutos y un bot de
    // un minuto tiene cinco velas nuevas cada vez. Antes veía una de cada
    // cinco.
    const velas = velasDe(10, 1_000_000);
    const ultima = velas[4].time;
    expect(velasPendientes(velas, ultima)).toEqual([5, 6, 7, 8, 9]);
  });

  it("no repite la vela que ya se evaluó", () => {
    const velas = velasDe(5);
    expect(velasPendientes(velas, velas[4].time)).toEqual([]);
  });

  it("ignora las velas anteriores a la última evaluada aunque lleguen después", () => {
    const velas = velasDe(5);
    expect(velasPendientes(velas, velas[2].time)).toEqual([3, 4]);
  });

  it("con un parón largo se queda con las más recientes y da las demás por perdidas", () => {
    // Doscientas velas atrasadas no son «se me pasaron unas»: es un bot que
    // estuvo parado. Fingir que operó durante el apagón inventa operaciones.
    const velas = velasDe(300);
    const pendientes = velasPendientes(velas, velas[0].time);
    expect(pendientes).toHaveLength(VELAS_DE_RECUPERACION);
    expect(pendientes[pendientes.length - 1]).toBe(299);
    expect(pendientes[0]).toBe(300 - VELAS_DE_RECUPERACION);
  });

  it("respeta un tope propio", () => {
    const velas = velasDe(10);
    expect(velasPendientes(velas, velas[0].time, 3)).toEqual([7, 8, 9]);
  });

  it("sin velas no hay nada que evaluar", () => {
    expect(velasPendientes([], null)).toEqual([]);
    expect(velasPendientes([], 123)).toEqual([]);
  });
});

describe("cuál es la última vela cerrada", () => {
  it("la de un minuto es la anterior a la que corre", () => {
    // 17:00:30 -> la vela de las 17:00 está viva; la última cerrada es 16:59.
    const ahora = Date.UTC(2026, 8, 3, 17, 0, 30);
    expect(ultimaVelaCerrada(ahora, 60)).toBe(Date.UTC(2026, 8, 3, 16, 59) / 1000);
  });

  it("la diaria no cambia hasta la medianoche", () => {
    // A media tarde, la última vela diaria cerrada sigue siendo la de ayer.
    // Es lo que hace que el gráfico de un bot diario parezca congelado sin
    // estarlo.
    const ahora = Date.UTC(2026, 8, 3, 17, 0, 0);
    expect(ultimaVelaCerrada(ahora, 86_400)).toBe(Date.UTC(2026, 8, 2) / 1000);
  });

  it("justo en el cierre, la vela recién cerrada ya cuenta", () => {
    const ahora = Date.UTC(2026, 8, 3, 17, 0, 0);
    expect(ultimaVelaCerrada(ahora, 300)).toBe(Date.UTC(2026, 8, 3, 16, 55) / 1000);
  });
});
