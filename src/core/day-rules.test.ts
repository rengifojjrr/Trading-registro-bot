import { describe, expect, it } from "vitest";

import { nextDay, pieceTouches, taskDays, taskTouches } from "./day-rules";

describe("taskTouches", () => {
  const task = (
    due_date: string | null,
    due_end: string | null = null,
    completed_at: string | null = null,
  ) => ({ due_date, due_end, completed_at });

  it("una tarea de un día toca sólo ese día", () => {
    expect(taskTouches(task("2026-03-11"), "2026-03-11").due).toBe(true);
    expect(taskTouches(task("2026-03-11"), "2026-03-10").due).toBe(false);
    expect(taskTouches(task("2026-03-11"), "2026-03-12").due).toBe(false);
  });

  it("una tarea con rango toca todos sus días, extremos incluidos", () => {
    // Aplanarla a la fecha de fin es lo que hacía que el calendario mintiera
    // sobre cuándo hay trabajo.
    const t = task("2026-03-11", "2026-03-13");
    expect(taskTouches(t, "2026-03-11").due).toBe(true);
    expect(taskTouches(t, "2026-03-12").due).toBe(true);
    expect(taskTouches(t, "2026-03-13").due).toBe(true);
    expect(taskTouches(t, "2026-03-14").due).toBe(false);
  });

  it("una tarea sin fecha no toca ningún día", () => {
    expect(taskTouches(task(null), "2026-03-11").due).toBe(false);
  });

  it("toca también el día en que se cerró, aunque venciera otro", () => {
    // Es justo lo que se quiere ver al repasar la semana: cuándo se hizo, no
    // sólo cuándo tocaba.
    const t = task("2026-03-01", null, "2026-03-11T18:00:00.000Z");
    expect(taskTouches(t, "2026-03-11")).toEqual({ due: false, done: true });
    expect(taskTouches(t, "2026-03-01")).toEqual({ due: true, done: false });
  });

  it("puede vencer y cerrarse el mismo día", () => {
    const t = task("2026-03-11", null, "2026-03-11T09:00:00.000Z");
    expect(taskTouches(t, "2026-03-11")).toEqual({ due: true, done: true });
  });
});

describe("pieceTouches", () => {
  it("distingue prevista de publicada", () => {
    const piece = { planned_date: "2026-03-11", published_at: "2026-03-14T10:00:00.000Z" };
    expect(pieceTouches(piece, "2026-03-11")).toEqual({ due: true, done: false });
    expect(pieceTouches(piece, "2026-03-14")).toEqual({ due: false, done: true });
    expect(pieceTouches(piece, "2026-03-12")).toEqual({ due: false, done: false });
  });

  it("una idea sin fechas no toca nada", () => {
    expect(pieceTouches({ planned_date: null, published_at: null }, "2026-03-11")).toEqual({
      due: false,
      done: false,
    });
  });
});

describe("taskDays", () => {
  it("devuelve el día suelto", () => {
    expect(taskDays({ due_date: "2026-03-11", due_end: null, completed_at: null }, "2026-12-31")).toEqual(
      ["2026-03-11"],
    );
  });

  it("devuelve el rango entero", () => {
    expect(
      taskDays({ due_date: "2026-03-11", due_end: "2026-03-13", completed_at: null }, "2026-12-31"),
    ).toEqual(["2026-03-11", "2026-03-12", "2026-03-13"]);
  });

  it("no devuelve nada sin fecha", () => {
    expect(taskDays({ due_date: null, due_end: null, completed_at: null }, "2026-12-31")).toEqual([]);
  });

  it("corta en la ventana en lugar de colgar el bucle", () => {
    // Un dedazo en el año -- 2126 en vez de 2026 -- daría treinta y seis mil
    // días y dejaría la pantalla del mes colgada.
    const days = taskDays(
      { due_date: "2026-03-11", due_end: "2126-03-11", completed_at: null },
      "2026-03-31",
    );
    expect(days.length).toBeLessThan(40);
    expect(days[0]).toBe("2026-03-11");
  });

  it("ignora un fin anterior al principio", () => {
    expect(
      taskDays({ due_date: "2026-03-11", due_end: "2026-03-01", completed_at: null }, "2026-12-31"),
    ).toEqual([]);
  });
});

describe("nextDay", () => {
  it("avanza un día", () => {
    expect(nextDay("2026-03-11")).toBe("2026-03-12");
  });

  it("cruza el cambio de mes y de año", () => {
    expect(nextDay("2026-03-31")).toBe("2026-04-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("cuenta el 29 de febrero en un año bisiesto", () => {
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
  });
});
