import { describe, expect, it } from "vitest";

import { formatClock, parseClockLabel } from "./clock";

/** Cada caso de aquí abajo es una etiqueta que existe de verdad en Notion. */
describe("parseClockLabel", () => {
  it("entiende la forma corriente", () => {
    expect(parseClockLabel("2am")).toEqual({ hour: 2, minute: 0 });
    expect(parseClockLabel("11pm")).toEqual({ hour: 23, minute: 0 });
    expect(parseClockLabel("7am")).toEqual({ hour: 7, minute: 0 });
  });

  it("entiende los minutos, con y sin espacio", () => {
    expect(parseClockLabel("2:40 am")).toEqual({ hour: 2, minute: 40 });
    expect(parseClockLabel("10:30am")).toEqual({ hour: 10, minute: 30 });
    expect(parseClockLabel("11:30 am")).toEqual({ hour: 11, minute: 30 });
  });

  it("entiende «1:am», que lleva los dos puntos y no lleva minutos", () => {
    expect(parseClockLabel("1:am")).toEqual({ hour: 1, minute: 0 });
    expect(parseClockLabel("1:pm")).toEqual({ hour: 13, minute: 0 });
  });

  it("resuelve las doce, que es donde am y pm se cruzan", () => {
    expect(parseClockLabel("12am")).toEqual({ hour: 0, minute: 0 });
    expect(parseClockLabel("12:30 am")).toEqual({ hour: 0, minute: 30 });
    expect(parseClockLabel("12 pm")).toEqual({ hour: 12, minute: 0 });
    expect(parseClockLabel("12pm")).toEqual({ hour: 12, minute: 0 });
  });

  it("sin am ni pm, la mañana para 1-11 y el mediodía para las 12", () => {
    // «7:30» y «12:30» son opciones reales de la hora de levantarse.
    expect(parseClockLabel("7:30")).toEqual({ hour: 7, minute: 30 });
    expect(parseClockLabel("12:30")).toEqual({ hour: 12, minute: 30 });
  });

  it("admite el espacio antes del meridiem y las mayúsculas", () => {
    expect(parseClockLabel("4 pm")).toEqual({ hour: 16, minute: 0 });
    expect(parseClockLabel("8:30 AM")).toEqual({ hour: 8, minute: 30 });
    expect(parseClockLabel(" 2 PM ")).toEqual({ hour: 14, minute: 0 });
  });

  it("acepta la forma con puntos, por si aparece", () => {
    expect(parseClockLabel("9 a.m.")).toEqual({ hour: 9, minute: 0 });
  });

  it("lee una hora de 24 sin meridiem tal cual", () => {
    expect(parseClockLabel("23:15")).toEqual({ hour: 23, minute: 15 });
  });

  it("devuelve null antes que adivinar", () => {
    expect(parseClockLabel(null)).toBeNull();
    expect(parseClockLabel("")).toBeNull();
    expect(parseClockLabel("por la mañana")).toBeNull();
    expect(parseClockLabel("25:00")).toBeNull();
    expect(parseClockLabel("7:75")).toBeNull();
    // Un meridiem sobre una hora de 24 es contradictorio, no una hora rara.
    expect(parseClockLabel("15pm")).toBeNull();
  });
});

describe("formatClock", () => {
  it("rellena con ceros para que quepa en un campo de hora", () => {
    expect(formatClock({ hour: 2, minute: 5 })).toBe("02:05");
    expect(formatClock({ hour: 23, minute: 30 })).toBe("23:30");
    expect(formatClock({ hour: 0, minute: 0 })).toBe("00:00");
  });

  it("no inventa una hora cuando no la hay", () => {
    expect(formatClock(null)).toBeNull();
  });
});
