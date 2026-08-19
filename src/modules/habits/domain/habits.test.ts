import { describe, expect, it } from "vitest";

import { completionFor, currentStreak, longestStreak, rateOver } from "./habits";

describe("currentStreak", () => {
  it("cuenta los días seguidos hasta hoy", () => {
    expect(currentStreak(["2026-08-17", "2026-08-18", "2026-08-19"], "2026-08-19")).toBe(3);
  });

  it("hoy sin marcar no rompe la racha", () => {
    // Son las 10 de la mañana y todavía no has hecho lo de hoy: enseñar 0
    // aquí castigaría por la hora que es.
    expect(currentStreak(["2026-08-17", "2026-08-18"], "2026-08-19")).toBe(2);
  });

  it("un hueco de ayer sí la rompe", () => {
    expect(currentStreak(["2026-08-15", "2026-08-16"], "2026-08-19")).toBe(0);
  });

  it("sólo hoy es una racha de uno", () => {
    expect(currentStreak(["2026-08-19"], "2026-08-19")).toBe(1);
  });

  it("sin días marcados no hay racha", () => {
    expect(currentStreak([], "2026-08-19")).toBe(0);
  });

  it("no cuenta dos veces un día repetido", () => {
    expect(currentStreak(["2026-08-19", "2026-08-19", "2026-08-18"], "2026-08-19")).toBe(2);
  });
});

describe("longestStreak", () => {
  it("encuentra la racha más larga aunque no sea la actual", () => {
    const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-10"];
    expect(longestStreak(dates)).toBe(4);
  });

  it("cuenta bien cruzando el cambio de mes", () => {
    expect(longestStreak(["2026-07-31", "2026-08-01", "2026-08-02"])).toBe(3);
  });

  it("sin datos es cero", () => {
    expect(longestStreak([])).toBe(0);
  });
});

describe("completionFor", () => {
  it("cuenta los hábitos activos hechos ese día", () => {
    const result = completionFor(
      ["a", "b", "c", "d"],
      [
        { habitId: "a", date: "2026-08-19" },
        { habitId: "c", date: "2026-08-19" },
      ],
    );
    expect(result).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it("ignora las marcas de hábitos archivados", () => {
    // Marcaste "x" cuando estaba activo; hoy ya no lo está y no debe contar.
    const result = completionFor(["a"], [
      { habitId: "a", date: "2026-08-19" },
      { habitId: "x", date: "2026-08-19" },
    ]);
    expect(result).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("sin hábitos activos no hay porcentaje, que no es lo mismo que 0 %", () => {
    expect(completionFor([], []).percent).toBeNull();
  });
});

describe("rateOver", () => {
  it("el denominador son los días transcurridos, no los días con marca", () => {
    // 2 marcados de 5 días: no marcar es no haberlo hecho.
    const rate = rateOver(["2026-08-15", "2026-08-17"], "2026-08-15", "2026-08-19");
    expect(rate).toBe(40);
  });

  it("descarta las marcas fuera de la ventana", () => {
    const rate = rateOver(["2026-07-01", "2026-08-19"], "2026-08-19", "2026-08-19");
    expect(rate).toBe(100);
  });
});
