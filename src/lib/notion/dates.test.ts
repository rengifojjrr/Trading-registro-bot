import { describe, expect, it } from "vitest";

import { dateEnd, dateStart, dateStartTime } from "./properties";

/**
 * Los rangos y las horas de las fechas de Notion.
 *
 * Se prueban aparte porque son el campo que más silenciosamente se puede
 * perder: una tarea que dura tres días y se archiva como un día suelto no da
 * ningún error, sólo dibuja un calendario que miente.
 */

function date(value: { start?: string; end?: string | null } | null) {
  return { date: value } as never;
}

describe("dateStart", () => {
  it("recorta al día", () => {
    expect(dateStart(date({ start: "2026-03-11" }))).toBe("2026-03-11");
    expect(dateStart(date({ start: "2026-03-11T21:00:00.000-05:00" }))).toBe("2026-03-11");
  });

  it("no convierte a Date, así que no desplaza el día", () => {
    // Las 21:00 en Bogotá son las 02:00 UTC del día siguiente. Convertir
    // archivaría la tarea un día tarde.
    expect(dateStart(date({ start: "2026-03-11T21:00:00.000-05:00" }))).toBe("2026-03-11");
  });

  it("devuelve null sin fecha", () => {
    expect(dateStart(date(null))).toBeNull();
    expect(dateStart(date({}))).toBeNull();
  });
});

describe("dateEnd", () => {
  it("lee el último día de un rango", () => {
    expect(dateEnd(date({ start: "2026-03-11", end: "2026-03-14" }))).toBe("2026-03-14");
  });

  it("devuelve null cuando la fecha es un día suelto", () => {
    expect(dateEnd(date({ start: "2026-03-11" }))).toBeNull();
    expect(dateEnd(date({ start: "2026-03-11", end: null }))).toBeNull();
  });

  it("recorta la hora del fin igual que la del principio", () => {
    expect(dateEnd(date({ start: "2026-03-11", end: "2026-03-14T18:00:00.000Z" }))).toBe(
      "2026-03-14",
    );
  });
});

describe("dateStartTime", () => {
  it("saca la hora cuando la fecha la trae", () => {
    expect(dateStartTime(date({ start: "2026-03-11T21:30:00.000-05:00" }))).toBe("21:30");
  });

  it("devuelve null cuando la fecha es sólo un día", () => {
    // Un día sin hora no es «las 00:00»: inventarla haría que todas las tareas
    // vencieran de madrugada.
    expect(dateStartTime(date({ start: "2026-03-11" }))).toBeNull();
  });

  it("devuelve null sin fecha", () => {
    expect(dateStartTime(date(null))).toBeNull();
  });
});
