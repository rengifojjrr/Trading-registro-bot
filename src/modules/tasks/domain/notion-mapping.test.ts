import { describe, expect, it } from "vitest";

import { mapNotionTask, projectsIn } from "./notion-mapping";

function page(properties: Record<string, unknown>, id = "task-1") {
  return {
    id,
    properties: { Name: { type: "title", title: [{ plain_text: "Llamar al banco" }] }, ...properties },
  };
}

const status = (name: string) => ({ type: "status", status: { name } });
const select = (name: string) => ({ type: "select", select: { name } });
const multi = (...names: string[]) => ({
  type: "multi_select",
  multi_select: names.map((name) => ({ name })),
});

describe("mapNotionTask", () => {
  it("traduce los tres estados", () => {
    expect(mapNotionTask(page({ Estado: status("Not started") }))?.task.status).toBe("NO_INICIADA");
    expect(mapNotionTask(page({ Estado: status("In progress") }))?.task.status).toBe("EN_CURSO");
    expect(mapNotionTask(page({ Estado: status("Done") }))?.task.status).toBe("HECHA");
  });

  it("traduce las tres prioridades", () => {
    expect(mapNotionTask(page({ Prioridad: select("Alta") }))?.task.priority).toBe("ALTA");
    expect(mapNotionTask(page({ Prioridad: select("Baja") }))?.task.priority).toBe("BAJA");
  });

  it("lee las categorías de la columna que se quedó llamándose «Multi-select»", () => {
    const result = mapNotionTask(page({ "Multi-select": multi("Trabajo", "Quehaceres domésticos") }));

    expect(result?.task.categories).toEqual(["Trabajo", "Quehaceres domésticos"]);
    expect(result?.warnings).toEqual([]);
  });

  it("trae el proyecto por su nombre, para que el llamador cree la fila", () => {
    expect(mapNotionTask(page({ Projectos: select("Trendy Sports") }))?.task.project).toBe(
      "Trendy Sports",
    );
    expect(mapNotionTask(page({}))?.task.project).toBeNull();
  });

  it("sin estado la deja sin empezar, que es lo que menos afirma", () => {
    const result = mapNotionTask(page({}));

    expect(result?.task.status).toBe("NO_INICIADA");
    expect(result?.task.priority).toBe("MEDIA");
    expect(result?.warnings).toEqual([]);
  });

  it("avisa de un estado o una categoría que no reconoce", () => {
    const result = mapNotionTask(
      page({ Estado: status("Bloqueada"), "Multi-select": multi("Trabajo", "Inventada") }),
    );

    expect(result?.warnings).toContain("Estado desconocido: «Bloqueada»");
    expect(result?.warnings).toContain("Categoría desconocida: «Inventada»");
    expect(result?.task.categories).toEqual(["Trabajo"]);
  });

  it("recorta la fecha de vencimiento al día", () => {
    const result = mapNotionTask(
      page({ Fecha: { type: "date", date: { start: "2026-04-24T05:00:00.000-05:00" } } }),
    );

    expect(result?.task.due_date).toBe("2026-04-24");
  });

  it("descarta una fila sin título", () => {
    expect(mapNotionTask({ id: "x", properties: {} })).toBeNull();
  });
});

describe("projectsIn", () => {
  it("devuelve los proyectos usados de verdad, sin repetir y ordenados", () => {
    const tasks = [
      mapNotionTask(page({ Projectos: select("Trendy Sports") }, "a"))!.task,
      mapNotionTask(page({ Projectos: select("Aquavita") }, "b"))!.task,
      mapNotionTask(page({ Projectos: select("Trendy Sports") }, "c"))!.task,
      mapNotionTask(page({}, "d"))!.task,
    ];

    expect(projectsIn(tasks)).toEqual(["Aquavita", "Trendy Sports"]);
  });
});
