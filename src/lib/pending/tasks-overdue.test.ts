import { describe, expect, it } from "vitest";

import { overdueTaskItems, type OverdueTask } from "./tasks-overdue";

const HOY = "2026-10-06";
const YO = "yo-0001";
const nombres: Record<string, string> = { "tomas-01": "Tomás", "ana-0001": "Ana" };
const nombreDe = (id: string) => nombres[id] ?? null;

const t = (title: string, due: string, assignee: string | null, parent: string | null = null): OverdueTask => ({
  title,
  due_date: due,
  assignee_id: assignee,
  parent_id: parent,
});

describe("las tareas pasadas de fecha en la portada", () => {
  it("cuenta como tuyas sólo las tuyas y las sin responsable", () => {
    const items = overdueTaskItems(
      [
        t("Llamar a la abogada", "2026-10-01", YO),
        t("Comprar teja", "2026-10-03", null),
        t("Mandar el presupuesto", "2026-09-28", "tomas-01"),
        t("Planos", "2026-10-02", "ana-0001"),
      ],
      YO,
      HOY,
      nombreDe,
    );
    expect(items[0]).toMatchObject({ id: "tasks-overdue", title: "2 tareas pasadas de fecha" });
    expect(items[0].detail).toContain("«Llamar a la abogada»");
    expect(items[1]).toMatchObject({
      id: "tasks-overdue-others",
      title: "Esperando a otros: 2 pasadas de fecha",
      href: "/tareas/todas?de=OTROS",
    });
    expect(items[1].detail).toBe("La más vieja es de Tomás: «Mandar el presupuesto», lleva 8 días.");
  });

  it("las subtareas no suman aparte", () => {
    const items = overdueTaskItems([t("Madre", "2026-10-01", YO), t("Hija", "2026-10-01", YO, "madre")], YO, HOY, nombreDe);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("1 tarea pasada de fecha");
  });

  it("si todo es de otros, no dice que te toca nada", () => {
    const items = overdueTaskItems([t("Planos", "2026-10-02", "ana-0001")], YO, HOY, nombreDe);
    expect(items.map((i) => i.id)).toEqual(["tasks-overdue-others"]);
  });

  it("nada vencido, nada que decir", () => {
    expect(overdueTaskItems([], YO, HOY, nombreDe)).toEqual([]);
  });
});
