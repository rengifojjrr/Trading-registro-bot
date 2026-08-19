import { describe, expect, it } from "vitest";

import { daysBetween, monthGrid, monthLabel, monthOf, shiftMonth } from "./calendar";

describe("monthGrid", () => {
  it("empieza las semanas en lunes", () => {
    // El 1 de marzo de 2026 es domingo, así que la primera fila empieza el
    // lunes 23 de febrero y no el propio día 1.
    const weeks = monthGrid("2026-03");
    expect(weeks[0][0].date).toBe("2026-02-23");
    expect(weeks[0][6].date).toBe("2026-03-01");
  });

  it("marca los días de relleno como fuera del mes", () => {
    const weeks = monthGrid("2026-03");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][6].inMonth).toBe(true);
  });

  it("cubre el mes entero", () => {
    const days = monthGrid("2026-03").flat().filter((d) => d.inMonth);
    expect(days).toHaveLength(31);
    expect(days[0].date).toBe("2026-03-01");
    expect(days[30].date).toBe("2026-03-31");
  });

  it("cuadra en un mes que empieza en lunes", () => {
    // Junio de 2026 empieza en lunes: sin días de relleno delante.
    const weeks = monthGrid("2026-06");
    expect(weeks[0][0].date).toBe("2026-06-01");
    expect(weeks[0][0].inMonth).toBe(true);
  });

  it("cuadra en febrero de un año bisiesto", () => {
    const days = monthGrid("2024-02").flat().filter((d) => d.inMonth);
    expect(days).toHaveLength(29);
  });

  it("devuelve semanas completas siempre", () => {
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-11", "2026-12"]) {
      for (const week of monthGrid(month)) expect(week).toHaveLength(7);
    }
  });

  it("devuelve vacío con un mes que no existe", () => {
    expect(monthGrid("2026-13")).toEqual([]);
    expect(monthGrid("nada")).toEqual([]);
  });
});

describe("shiftMonth", () => {
  it("avanza y retrocede", () => {
    expect(shiftMonth("2026-03", 1)).toBe("2026-04");
    expect(shiftMonth("2026-03", -1)).toBe("2026-02");
  });

  it("cruza el cambio de año", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthOf y monthLabel", () => {
  it("recorta la fecha al mes", () => {
    expect(monthOf("2026-03-14")).toBe("2026-03");
  });

  it("escribe el mes en castellano", () => {
    expect(monthLabel("2026-03")).toBe("marzo de 2026");
    expect(monthLabel("2026-12")).toBe("diciembre de 2026");
  });
});

describe("daysBetween", () => {
  it("devuelve el día suelto cuando no hay fin", () => {
    expect(daysBetween("2026-03-10", null)).toEqual(["2026-03-10"]);
  });

  it("cubre el rango entero, extremos incluidos", () => {
    expect(daysBetween("2026-03-10", "2026-03-12")).toEqual([
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ]);
  });

  it("ignora un fin anterior al principio", () => {
    expect(daysBetween("2026-03-10", "2026-03-01")).toEqual(["2026-03-10"]);
  });

  it("corta un rango absurdo en lugar de llenar el calendario", () => {
    // Un dedazo en el año -- 2126 en vez de 2026 -- no debe devolver treinta
    // y seis mil días y dejar la página inservible.
    expect(daysBetween("2026-03-10", "2126-03-10")).toHaveLength(367);
  });
});
