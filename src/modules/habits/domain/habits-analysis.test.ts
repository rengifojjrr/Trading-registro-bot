import { describe, expect, it } from "vitest";

import {
  dailyCompletion,
  daysBetween,
  habitRanking,
  weekdayRates,
  type HabitHistory,
} from "./habits-analysis";

function habit(id: string, dates: string[], name = id): HabitHistory {
  return { id, name, emoji: null, dates };
}

describe("daysBetween", () => {
  it("incluye los dos extremos", () => {
    expect(daysBetween("2026-08-17", "2026-08-19")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });

  it("no gira para siempre con un rango invertido", () => {
    expect(daysBetween("2026-08-19", "2026-08-17")).toEqual([]);
  });
});

describe("dailyCompletion", () => {
  it("es el porcentaje de hábitos marcados cada día", () => {
    const series = dailyCompletion(
      [habit("a", ["2026-08-17", "2026-08-18"]), habit("b", ["2026-08-18"])],
      "2026-08-17",
      "2026-08-19",
    );

    expect(series.map((p) => p.value)).toEqual([50, 100, 0]);
  });

  it("dibuja los días sin marcar como cero, porque no marcar es no hacerlo", () => {
    const series = dailyCompletion([habit("a", [])], "2026-08-18", "2026-08-18");
    expect(series).toEqual([{ label: "18 ago", value: 0 }]);
  });

  it("no devuelve nada sin hábitos, en lugar de una línea plana en cero", () => {
    expect(dailyCompletion([], "2026-08-17", "2026-08-19")).toEqual([]);
  });

  it("no cuenta dos veces una fecha repetida", () => {
    const series = dailyCompletion([habit("a", ["2026-08-18", "2026-08-18"])], "2026-08-18", "2026-08-18");
    expect(series[0].value).toBe(100);
  });
});

describe("weekdayRates", () => {
  it("divide entre los días de esa semana que ha habido, no entre todos", () => {
    // 17 y 24 de agosto de 2026 son lunes; sólo se marcó el primero.
    const rates = weekdayRates(
      [habit("a", ["2026-08-17"])],
      "2026-08-17",
      "2026-08-30",
    );

    const lunes = rates.find((r) => r.label === "Lunes");
    expect(lunes?.value).toBe(50);
  });

  it("devuelve los siete días aunque la ventana no los cubra todos", () => {
    const rates = weekdayRates([habit("a", [])], "2026-08-17", "2026-08-18");
    expect(rates).toHaveLength(7);
    expect(rates.map((r) => r.label)[0]).toBe("Lunes");
  });

  it("empieza la semana en lunes y no en domingo", () => {
    // 2026-08-23 es domingo.
    const rates = weekdayRates([habit("a", ["2026-08-23"])], "2026-08-23", "2026-08-23");
    expect(rates.find((r) => r.label === "Domingo")?.value).toBe(100);
    expect(rates.find((r) => r.label === "Lunes")?.value).toBe(0);
  });
});

describe("habitRanking", () => {
  it("ordena de mayor a menor cumplimiento", () => {
    const ranking = habitRanking(
      [
        habit("a", ["2026-08-17"], "Leer"),
        habit("b", ["2026-08-17", "2026-08-18"], "Entrenar"),
      ],
      "2026-08-17",
      "2026-08-18",
    );

    expect(ranking).toEqual([
      { label: "Entrenar", value: 100 },
      { label: "Leer", value: 50 },
    ]);
  });

  it("ignora las marcas de fuera de la ventana", () => {
    const ranking = habitRanking(
      [habit("a", ["2026-07-01", "2026-08-17"], "Leer")],
      "2026-08-17",
      "2026-08-18",
    );

    expect(ranking[0].value).toBe(50);
  });

  it("pone el emoji delante del nombre cuando lo hay", () => {
    const ranking = habitRanking(
      [{ id: "a", name: "Leer", emoji: "📚", dates: [] }],
      "2026-08-17",
      "2026-08-18",
    );

    expect(ranking[0].label).toBe("📚 Leer");
  });
});
