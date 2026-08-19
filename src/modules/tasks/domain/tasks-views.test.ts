import { describe, expect, it } from "vitest";

import {
  daysLeft,
  daysLeftLabel,
  inRange,
  isTaskGrouping,
  isTaskRange,
  matchesSearch,
  weekBounds,
} from "./tasks";

describe("daysLeft", () => {
  it("cuenta hacia adelante", () => {
    expect(daysLeft("2026-03-14", "2026-03-10")).toBe(4);
  });

  it("cuenta hacia atrás en negativo", () => {
    expect(daysLeft("2026-03-06", "2026-03-10")).toBe(-4);
  });

  it("da cero el mismo día", () => {
    expect(daysLeft("2026-03-10", "2026-03-10")).toBe(0);
  });

  it("cruza el cambio de mes y de año", () => {
    expect(daysLeft("2026-04-01", "2026-03-30")).toBe(2);
    expect(daysLeft("2027-01-01", "2026-12-30")).toBe(2);
  });

  it("no se descuadra al cruzar un cambio de hora", () => {
    // Del 28 al 30 de marzo de 2026 hay un salto de horario de verano en
    // España. Contando en UTC siguen siendo dos días y no 1,96.
    expect(daysLeft("2026-03-30", "2026-03-28")).toBe(2);
  });

  it("devuelve null sin fecha", () => {
    expect(daysLeft(null, "2026-03-10")).toBeNull();
  });
});

describe("daysLeftLabel", () => {
  it("escribe cada caso en singular o plural", () => {
    expect(daysLeftLabel("2026-03-10", "2026-03-10")).toBe("Vence hoy");
    expect(daysLeftLabel("2026-03-11", "2026-03-10")).toBe("Falta 1 día");
    expect(daysLeftLabel("2026-03-13", "2026-03-10")).toBe("Faltan 3 días");
    expect(daysLeftLabel("2026-03-09", "2026-03-10")).toBe("Venció ayer");
    expect(daysLeftLabel("2026-03-08", "2026-03-10")).toBe("Venció hace 2 días");
  });

  it("calla sin fecha", () => {
    expect(daysLeftLabel(null, "2026-03-10")).toBeNull();
  });
});

describe("weekBounds", () => {
  it("va de lunes a domingo", () => {
    // El 11 de marzo de 2026 es miércoles.
    expect(weekBounds("2026-03-11")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
  });

  it("trata el domingo como el final de su semana, no el principio", () => {
    // El 15 de marzo de 2026 es domingo: cierra la semana del 9.
    expect(weekBounds("2026-03-15")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
  });

  it("deja el lunes como primer día de la suya", () => {
    expect(weekBounds("2026-03-09")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
  });
});

describe("inRange", () => {
  const today = "2026-03-11";

  it("deja pasar todo en TODO, incluso sin fecha", () => {
    expect(inRange(null, today, "TODO")).toBe(true);
    expect(inRange("2020-01-01", today, "TODO")).toBe(true);
  });

  it("deja fuera lo que no tiene fecha en el resto de ventanas", () => {
    for (const range of ["HOY", "SEMANA", "MES", "ANO", "PROXIMAS"] as const) {
      expect(inRange(null, today, range)).toBe(false);
    }
  });

  it("acota el día", () => {
    expect(inRange("2026-03-11", today, "HOY")).toBe(true);
    expect(inRange("2026-03-12", today, "HOY")).toBe(false);
  });

  it("acota la semana por sus dos extremos", () => {
    expect(inRange("2026-03-09", today, "SEMANA")).toBe(true);
    expect(inRange("2026-03-15", today, "SEMANA")).toBe(true);
    expect(inRange("2026-03-08", today, "SEMANA")).toBe(false);
    expect(inRange("2026-03-16", today, "SEMANA")).toBe(false);
  });

  it("acota el mes y el año", () => {
    expect(inRange("2026-03-31", today, "MES")).toBe(true);
    expect(inRange("2026-04-01", today, "MES")).toBe(false);
    expect(inRange("2026-12-31", today, "ANO")).toBe(true);
    expect(inRange("2027-01-01", today, "ANO")).toBe(false);
  });

  it("en PROXIMAS deja fuera hoy y lo vencido", () => {
    expect(inRange("2026-03-12", today, "PROXIMAS")).toBe(true);
    expect(inRange("2026-03-11", today, "PROXIMAS")).toBe(false);
    expect(inRange("2026-03-10", today, "PROXIMAS")).toBe(false);
  });
});

describe("matchesSearch", () => {
  const task = {
    title: "Crear Inventario",
    notes: null,
    description: "Hacer inventario de trendy sports",
    categories: ["Trabajo"],
  };

  it("encuentra por título sin distinguir mayúsculas", () => {
    expect(matchesSearch(task, "inventario")).toBe(true);
    expect(matchesSearch(task, "INVENTARIO")).toBe(true);
  });

  it("encuentra por el cuerpo de la página", () => {
    // Uno recuerda «lo de trendy sports» aunque no esté en el título.
    expect(matchesSearch(task, "trendy")).toBe(true);
  });

  it("encuentra por categoría", () => {
    expect(matchesSearch(task, "trabajo")).toBe(true);
  });

  it("no encuentra lo que no está", () => {
    expect(matchesSearch(task, "miami")).toBe(false);
  });

  it("con término vacío no filtra nada", () => {
    expect(matchesSearch(task, "")).toBe(true);
    expect(matchesSearch(task, "   ")).toBe(true);
  });
});

describe("guardas de las cadenas de la URL", () => {
  it("acepta sólo los valores conocidos", () => {
    expect(isTaskRange("SEMANA")).toBe(true);
    expect(isTaskRange("semana")).toBe(false);
    expect(isTaskRange(undefined)).toBe(false);
    expect(isTaskGrouping("PROYECTO")).toBe(true);
    expect(isTaskGrouping("LO_QUE_SEA")).toBe(false);
  });
});
