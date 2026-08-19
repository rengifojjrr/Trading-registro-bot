import { describe, expect, it } from "vitest";

import { bookProgress, formatReadingTime, totalsFor } from "./reading";

describe("totalsFor", () => {
  it("suma minutos y páginas por separado", () => {
    const totals = totalsFor([
      { minutes: 40, pages: 20, sessionDate: "2026-08-19" },
      { minutes: 20, pages: 10, sessionDate: "2026-08-18" },
    ]);
    expect(totals.sessions).toBe(2);
    expect(totals.minutes).toBe(60);
    expect(totals.pages).toBe(30);
    expect(totals.pagesPerHour).toBe(30);
  });

  it("una sesión sin páginas no anula sus minutos", () => {
    // Al contrario que en sueño, aquí cada campo se agrega por su cuenta.
    const totals = totalsFor([
      { minutes: 30, pages: null, sessionDate: "2026-08-19" },
      { minutes: 30, pages: 25, sessionDate: "2026-08-18" },
    ]);
    expect(totals.minutes).toBe(60);
    expect(totals.pages).toBe(25);
  });

  it("no calcula un ritmo con muy pocos minutos", () => {
    // 5 minutos y 10 páginas daría 120 pág/h, que no es creíble.
    const totals = totalsFor([{ minutes: 5, pages: 10, sessionDate: "2026-08-19" }]);
    expect(totals.pagesPerHour).toBeNull();
  });

  it("sin páginas no hay ritmo", () => {
    const totals = totalsFor([{ minutes: 60, pages: null, sessionDate: "2026-08-19" }]);
    expect(totals.pagesPerHour).toBeNull();
  });

  it("sin sesiones todo es cero, no null", () => {
    expect(totalsFor([])).toEqual({ sessions: 0, minutes: 0, pages: 0, pagesPerHour: null });
  });
});

describe("formatReadingTime", () => {
  it("formatea horas y minutos", () => {
    expect(formatReadingTime(80)).toBe("1h 20m");
    expect(formatReadingTime(120)).toBe("2h");
    expect(formatReadingTime(45)).toBe("45m");
    expect(formatReadingTime(0)).toBe("0m");
  });
});

describe("bookProgress", () => {
  it("calcula el porcentaje leído", () => {
    expect(bookProgress(50, 200)).toBe(25);
  });

  it("no inventa progreso sin total de páginas", () => {
    expect(bookProgress(50, null)).toBeNull();
    expect(bookProgress(50, 0)).toBeNull();
  });

  it("no pasa del 100 aunque leas de más", () => {
    expect(bookProgress(250, 200)).toBe(100);
  });
});
