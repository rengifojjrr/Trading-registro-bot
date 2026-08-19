import { describe, expect, it } from "vitest";

import { HABIT_COLUMNS, countMarksByHabit, mapNotionHabitDay } from "./notion-mapping";

const yes = { type: "checkbox", checkbox: true };
const no = { type: "checkbox", checkbox: false };

function day(properties: Record<string, unknown>, date = "2026-03-14", id = "day-1") {
  return { id, properties: { Fecha: { type: "date", date: { start: date } }, ...properties } };
}

describe("mapNotionHabitDay", () => {
  it("gira las columnas marcadas en una marca por hábito", () => {
    const result = mapNotionHabitDay(
      day({ "⏰ 7am": yes, "💧2ML": yes, "📚 10 pag": no }),
    );

    expect(result?.marks).toEqual([
      { habit: "7am", date: "2026-03-14" },
      { habit: "2ML", date: "2026-03-14" },
    ]);
  });

  it("no deja fila para lo no marcado: la ausencia ya es el «no lo hice»", () => {
    const result = mapNotionHabitDay(day({ "⏰ 7am": no, "💧2ML": no }));
    expect(result?.marks).toEqual([]);
  });

  it("devuelve el día aunque no haya nada marcado, que no es lo mismo que no existir", () => {
    const result = mapNotionHabitDay(day({}));
    expect(result).toEqual({ date: "2026-03-14", marks: [] });
  });

  it("encuentra las columnas con emoji, tono de piel y espacio colgando", () => {
    const result = mapNotionHabitDay(
      day({ "💪🏽15-30 min": yes, "🦷 2 veces ": yes, "🧘‍♂️15 min": yes }),
    );

    expect(result?.marks.map((m) => m.habit)).toEqual(["2 veces", "15-30 min", "15 min"]);
  });

  it("descarta una fila sin fecha", () => {
    expect(mapNotionHabitDay({ id: "x", properties: {} })).toBeNull();
  });

  it("recorta una fecha con hora al día", () => {
    const result = mapNotionHabitDay(day({ "⏰ 7am": yes }, "2026-03-14T05:00:00.000-05:00"));
    expect(result?.marks[0].date).toBe("2026-03-14");
  });
});

describe("HABIT_COLUMNS", () => {
  it("son los diez hábitos de la tabla, sin nombres repetidos", () => {
    expect(HABIT_COLUMNS).toHaveLength(10);
    expect(new Set(HABIT_COLUMNS.map((h) => h.name)).size).toBe(10);
  });

  it("separa el emoji del nombre en todos", () => {
    for (const habit of HABIT_COLUMNS) {
      expect(habit.name).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe("countMarksByHabit", () => {
  it("cuenta por hábito y deja a cero los que nunca se marcaron", () => {
    const counts = countMarksByHabit([
      mapNotionHabitDay(day({ "⏰ 7am": yes }, "2026-03-14"))!,
      mapNotionHabitDay(day({ "⏰ 7am": yes, "💧2ML": yes }, "2026-03-15"))!,
    ]);

    expect(counts["7am"]).toBe(2);
    expect(counts["2ML"]).toBe(1);
    expect(counts["10 pag"]).toBe(0);
  });
});
