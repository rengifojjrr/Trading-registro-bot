import { describe, expect, it } from "vitest";

import {
  minutesByBook,
  minutesByDay,
  minutesByGenre,
  minutesByTimeOfDay,
  overallPace,
  type AnalysableSession,
} from "./reading-analysis";

const TZ = "America/Bogota";

function session(over: Partial<AnalysableSession> = {}): AnalysableSession {
  return {
    sessionDate: "2026-08-18",
    startedAt: "2026-08-18T21:00:00-05:00",
    minutes: 40,
    pages: 20,
    bookTitle: "Meditaciones",
    bookGenres: ["Espiritual"],
    ...over,
  };
}

describe("minutesByDay", () => {
  it("dibuja los días sin leer como cero, que es lo que hay que ver", () => {
    const points = minutesByDay(
      [session({ sessionDate: "2026-08-17" }), session({ sessionDate: "2026-08-19" })],
      "2026-08-17",
      "2026-08-19",
    );

    expect(points.map((p) => p.value)).toEqual([40, 0, 40]);
  });

  it("suma varias sesiones del mismo día", () => {
    const points = minutesByDay(
      [session({ minutes: 20 }), session({ minutes: 25 })],
      "2026-08-18",
      "2026-08-18",
    );

    expect(points[0].value).toBe(45);
  });

  it("ignora las sesiones de fuera de la ventana", () => {
    const points = minutesByDay([session({ sessionDate: "2026-07-01" })], "2026-08-18", "2026-08-18");
    expect(points[0].value).toBe(0);
  });
});

describe("minutesByGenre", () => {
  it("reparte los minutos de una sesión a todos los géneros de su libro", () => {
    const points = minutesByGenre([
      session({ minutes: 40, bookGenres: ["Espiritual", "Metafísica"] }),
    ]);

    expect(points).toEqual([
      { label: "Espiritual", value: 40 },
      { label: "Metafísica", value: 40 },
    ]);
  });

  it("ordena de más a menos minutos", () => {
    const points = minutesByGenre([
      session({ minutes: 10, bookGenres: ["Fantasía"] }),
      session({ minutes: 90, bookGenres: ["Marketing"] }),
    ]);

    expect(points.map((p) => p.label)).toEqual(["Marketing", "Fantasía"]);
  });

  it("no cuenta las sesiones sin minutos ni los libros sin género", () => {
    expect(minutesByGenre([session({ minutes: null }), session({ bookGenres: [] })])).toEqual([]);
  });
});

describe("minutesByBook", () => {
  it("agrupa por título y deja fuera las sesiones sin libro", () => {
    const points = minutesByBook([
      session({ minutes: 30 }),
      session({ minutes: 15 }),
      session({ bookTitle: null, minutes: 60 }),
    ]);

    expect(points).toEqual([{ label: "Meditaciones", value: 45 }]);
  });
});

describe("minutesByTimeOfDay", () => {
  it("reparte en franjas de dos horas y en la zona del usuario", () => {
    // 21:00 en Bogotá cae en la franja 20-22.
    const points = minutesByTimeOfDay([session()], TZ);

    expect(points).toHaveLength(12);
    expect(points.find((p) => p.label === "20-22")?.value).toBe(40);
  });

  it("no inventa una franja para las sesiones sin hora de inicio", () => {
    expect(minutesByTimeOfDay([session({ startedAt: null })], TZ)).toEqual([]);
  });

  it("devuelve las doce franjas cuando hay al menos una sesión con hora", () => {
    const points = minutesByTimeOfDay([session({ startedAt: null }), session()], TZ);
    expect(points).toHaveLength(12);
  });
});

describe("overallPace", () => {
  it("se calcula sobre el total y no promediando los ritmos de cada sesión", () => {
    // Una sesión corta y rápida junto a una larga y lenta: promediar ritmos
    // daría 105 pág/h; sobre el total son 33.
    const pace = overallPace([
      session({ minutes: 5, pages: 15 }),
      session({ minutes: 115, pages: 51 }),
    ]);

    expect(pace).toBe(33);
  });

  it("no da un ritmo con menos de diez minutos registrados", () => {
    expect(overallPace([session({ minutes: 5, pages: 40 })])).toBeNull();
  });

  it("no da un ritmo sin páginas", () => {
    expect(overallPace([session({ minutes: 120, pages: null })])).toBeNull();
  });
});
