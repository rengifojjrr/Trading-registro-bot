import { describe, expect, it } from "vitest";

import {
  averageDaysToDone,
  flowSeries,
  openByCategory,
  openByProject,
  stalest,
  type AnalysableTask,
} from "./tasks-analysis";

const TZ = "America/Bogota";

function task(over: Partial<AnalysableTask> = {}): AnalysableTask {
  return {
    status: "NO_INICIADA",
    priority: "MEDIA",
    dueDate: null,
    createdAt: "2026-08-17T15:00:00Z",
    completedAt: null,
    categories: [],
    projectName: null,
    ...over,
  };
}

describe("flowSeries", () => {
  it("cuenta creadas y terminadas por día, con los días vacíos a cero", () => {
    const rows = flowSeries(
      [
        task({ createdAt: "2026-08-17T15:00:00Z" }),
        task({
          createdAt: "2026-08-17T15:00:00Z",
          completedAt: "2026-08-19T15:00:00Z",
          status: "HECHA",
        }),
      ],
      "2026-08-17",
      "2026-08-19",
      TZ,
    );

    expect(rows.map((r) => r.creadas)).toEqual([2, 0, 0]);
    expect(rows.map((r) => r.terminadas)).toEqual([0, 0, 1]);
  });

  it("usa el día del calendario del usuario, no el de UTC", () => {
    // 02:00 UTC del 18 son las 21:00 del 17 en Bogotá.
    const rows = flowSeries([task({ createdAt: "2026-08-18T02:00:00Z" })], "2026-08-17", "2026-08-18", TZ);

    expect(rows[0].creadas).toBe(1);
    expect(rows[1].creadas).toBe(0);
  });

  it("ignora lo de fuera de la ventana", () => {
    const rows = flowSeries([task({ createdAt: "2026-01-01T15:00:00Z" })], "2026-08-17", "2026-08-17", TZ);
    expect(rows[0].creadas).toBe(0);
  });
});

describe("averageDaysToDone", () => {
  it("mide de creación a cierre", () => {
    const average = averageDaysToDone([
      task({ createdAt: "2026-08-10T00:00:00Z", completedAt: "2026-08-12T00:00:00Z", status: "HECHA" }),
      task({ createdAt: "2026-08-10T00:00:00Z", completedAt: "2026-08-14T00:00:00Z", status: "HECHA" }),
    ]);

    expect(average).toBe(3);
  });

  it("no cuenta las que siguen abiertas", () => {
    const average = averageDaysToDone([
      task({ createdAt: "2026-08-10T00:00:00Z", completedAt: "2026-08-12T00:00:00Z", status: "HECHA" }),
      task({ createdAt: "2026-01-01T00:00:00Z" }),
    ]);

    expect(average).toBe(2);
  });

  it("devuelve null si no se ha terminado ninguna", () => {
    expect(averageDaysToDone([task()])).toBeNull();
  });
});

describe("stalest", () => {
  it("ordena por antigüedad y deja fuera las hechas", () => {
    const list = stalest(
      [
        { ...task({ createdAt: "2026-08-01T00:00:00Z" }), title: "Vieja" },
        { ...task({ createdAt: "2026-08-15T00:00:00Z" }), title: "Reciente" },
        {
          ...task({ createdAt: "2026-01-01T00:00:00Z", status: "HECHA" }),
          title: "Antiquísima pero hecha",
        },
      ],
      "2026-08-19",
      TZ,
    );

    expect(list.map((t) => t.title)).toEqual(["Vieja", "Reciente"]);
    expect(list[0].days).toBe(18);
  });

  it("no incluye las creadas hoy: llevar horas abierta no es estar atascada", () => {
    const list = stalest(
      [{ ...task({ createdAt: "2026-08-19T13:00:00Z" }), title: "De hoy" }],
      "2026-08-19",
      TZ,
    );

    expect(list).toEqual([]);
  });

  it("respeta el límite", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...task({ createdAt: "2026-08-01T00:00:00Z" }),
      title: `T${i}`,
    }));

    expect(stalest(many, "2026-08-19", TZ, 3)).toHaveLength(3);
  });
});

describe("openByCategory", () => {
  it("sólo cuenta las pendientes", () => {
    const points = openByCategory([
      task({ categories: ["Trabajo"] }),
      task({ categories: ["Trabajo"], status: "HECHA" }),
    ]);

    expect(points).toEqual([{ label: "Trabajo", value: 1 }]);
  });

  it("cuenta una tarea en cada una de sus categorías", () => {
    const points = openByCategory([task({ categories: ["Trabajo", "Estudio"] })]);
    expect(points).toEqual([
      { label: "Trabajo", value: 1 },
      { label: "Estudio", value: 1 },
    ]);
  });

  it("agrupa las tareas sin categoría en lugar de perderlas", () => {
    expect(openByCategory([task()])).toEqual([{ label: "Sin categoría", value: 1 }]);
  });

  it("mantiene un orden fijo, para que la gráfica no se reordene sola al marcar una", () => {
    const points = openByCategory([
      task({ categories: ["Ocio"] }),
      task({ categories: ["Trabajo"] }),
      task({ categories: ["Trabajo"] }),
    ]);

    // Trabajo va antes que Ocio en la lista de categorías, aunque aquí
    // llegara después.
    expect(points.map((p) => p.label)).toEqual(["Trabajo", "Ocio"]);
  });
});

describe("openByProject", () => {
  it("ordena de más cargado a menos y recoge las sueltas", () => {
    const points = openByProject([
      task({ projectName: "Canal" }),
      task({ projectName: "Canal" }),
      task(),
    ]);

    expect(points).toEqual([
      { label: "Canal", value: 2 },
      { label: "Sin proyecto", value: 1 },
    ]);
  });
});
