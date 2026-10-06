import { describe, expect, it } from "vitest";

import {
  compareWithinGroup,
  countTasks,
  countsAsMine,
  isMine,
  isWhose,
  matchesWhose,
  urgencyOf,
  type TaskLike,
} from "./tasks";

const TODAY = "2026-08-19";

function task(over: Partial<TaskLike> = {}): TaskLike {
  return { status: "NO_INICIADA", priority: "MEDIA", dueDate: null, ...over };
}

describe("urgencyOf", () => {
  it("clasifica según la fecha de vencimiento", () => {
    expect(urgencyOf("2026-08-18", TODAY)).toBe("VENCIDA");
    expect(urgencyOf("2026-08-19", TODAY)).toBe("HOY");
    expect(urgencyOf("2026-08-23", TODAY)).toBe("PRONTO");
    expect(urgencyOf("2026-09-30", TODAY)).toBe("DESPUES");
    expect(urgencyOf(null, TODAY)).toBe("SIN_FECHA");
  });

  it("el límite de la semana son siete días naturales", () => {
    expect(urgencyOf("2026-08-26", TODAY)).toBe("PRONTO");
    expect(urgencyOf("2026-08-27", TODAY)).toBe("DESPUES");
  });

  it("cuenta bien cruzando el cambio de mes", () => {
    expect(urgencyOf("2026-09-02", "2026-08-30")).toBe("PRONTO");
  });
});

describe("countTasks", () => {
  it("separa abiertas, hechas, vencidas y de hoy", () => {
    const counts = countTasks(
      [
        task({ dueDate: "2026-08-10" }),
        task({ dueDate: "2026-08-19" }),
        task({ dueDate: "2026-08-19", status: "HECHA" }),
        task({ status: "EN_CURSO" }),
      ],
      TODAY,
    );
    expect(counts).toEqual({ open: 3, done: 1, overdue: 1, dueToday: 1 });
  });

  it("una tarea hecha y vencida no cuenta como vencida", () => {
    // Ya no debe nada: terminarla tarde sigue siendo terminarla.
    const counts = countTasks([task({ dueDate: "2026-01-01", status: "HECHA" })], TODAY);
    expect(counts.overdue).toBe(0);
  });
});

describe("compareWithinGroup", () => {
  it("la prioridad manda sobre la fecha", () => {
    const alta = task({ priority: "ALTA", dueDate: "2026-12-01" });
    const baja = task({ priority: "BAJA", dueDate: "2026-08-19" });
    expect(compareWithinGroup(alta, baja)).toBeLessThan(0);
  });

  it("a igual prioridad, vence antes lo que va primero", () => {
    const antes = task({ dueDate: "2026-08-19" });
    const despues = task({ dueDate: "2026-08-25" });
    expect(compareWithinGroup(antes, despues)).toBeLessThan(0);
  });

  it("sin fecha va al final", () => {
    const conFecha = task({ dueDate: "2026-12-31" });
    const sinFecha = task({ dueDate: null });
    expect(compareWithinGroup(conFecha, sinFecha)).toBeLessThan(0);
  });
});

describe("de quién es una tarea", () => {
  const YO = "yo-0001";
  const tuya = { assignee_id: YO, parent_id: null };
  const sinNadie = { assignee_id: null, parent_id: null };
  const deTomas = { assignee_id: "tomas-01", parent_id: null };
  const subtarea = { assignee_id: YO, parent_id: "madre" };

  it("tuyas son las tuyas y las que no tienen responsable", () => {
    expect(isMine(tuya, YO)).toBe(true);
    expect(isMine(sinNadie, YO)).toBe(true);
    expect(isMine(deTomas, YO)).toBe(false);
    // Sin fila «Yo» todavía, lo asignado es de otros.
    expect(isMine(deTomas, null)).toBe(false);
    expect(isMine(sinNadie, null)).toBe(true);
  });

  it("las subtareas no cuentan aparte", () => {
    expect(countsAsMine(tuya, YO)).toBe(true);
    expect(countsAsMine(subtarea, YO)).toBe(false);
    expect(countsAsMine(deTomas, YO)).toBe(false);
  });

  it("el filtro «Mías · De otros · Todas»", () => {
    expect(matchesWhose(deTomas, YO, "MIAS")).toBe(false);
    expect(matchesWhose(deTomas, YO, "OTROS")).toBe(true);
    expect(matchesWhose(tuya, YO, "OTROS")).toBe(false);
    expect(matchesWhose(tuya, YO, "TODAS")).toBe(true);
    expect(isWhose("OTROS")).toBe(true);
    expect(isWhose("otros")).toBe(false);
  });
});
