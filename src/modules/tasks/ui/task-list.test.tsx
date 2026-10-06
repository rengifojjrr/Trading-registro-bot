// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TaskRow } from "@/modules/tasks/queries";

import { TaskList } from "./task-list";

/**
 * La lista de tareas de siempre, con gente en los proyectos: las subtareas
 * van debajo de su madre (no sueltas ni sumando en la cabecera) y una tarea de
 * otra persona dice de quién es. Nombres inventados.
 */

vi.mock("@/modules/tasks/actions", () => ({
  afterTaskRemoved: async () => {},
  setTaskStatus: async () => {},
  setTasksStatus: async () => ({ error: null, changed: 0 }),
}));
vi.mock("@/core/ui/delete-button", () => ({ DeleteButton: () => null }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

function tarea(id: string, title: string, extra: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    title,
    status: "NO_INICIADA",
    priority: "MEDIA",
    due_date: null,
    due_end: null,
    due_time: null,
    categories: [],
    notes: null,
    description: null,
    icon: null,
    project_id: null,
    projectName: null,
    projectColor: null,
    created_at: "2026-10-01T00:00:00Z",
    completed_at: null,
    assignee_id: null,
    parent_id: null,
    assignee: null,
    mine: true,
    ...extra,
  };
}

const TOMAS = { id: "tomas-01", name: "Tomás", is_owner: false, color: null, has_whatsapp: false, whatsapp_hint: null };

describe("la lista de tareas", () => {
  it("la subtarea va debajo de su madre y no cuenta aparte en la cabecera", () => {
    render(
      <TaskList
        today="2026-10-06"
        tasks={[
          tarea("m", "Mandar el presupuesto", { due_date: "2026-10-01" }),
          tarea("h", "Pedir tres precios", { due_date: "2026-10-02", parent_id: "m" }),
        ]}
      />,
    );
    const cabecera = screen.getByRole("heading", { level: 3 });
    expect(cabecera).toHaveTextContent("· 1");
    const grupo = cabecera.parentElement!;
    const enlaces = within(grupo).getAllByRole("link").map((a) => a.textContent);
    expect(enlaces).toEqual(["Mandar el presupuesto", "Pedir tres precios"]);
  });

  it("si la madre no sale (otra ventana), la subtarea sale sola", () => {
    render(
      <TaskList
        today="2026-10-06"
        only={["VENCIDA", "HOY"]}
        tasks={[tarea("m", "Madre para noviembre", { due_date: "2026-11-30" }), tarea("h", "Hija vencida", { due_date: "2026-10-01", parent_id: "m" })]}
      />,
    );
    expect(screen.getByText("Hija vencida")).toBeInTheDocument();
    expect(screen.queryByText("Madre para noviembre")).not.toBeInTheDocument();
  });

  it("una tarea de otra persona dice de quién es", () => {
    render(<TaskList today="2026-10-06" tasks={[tarea("t", "Mandar los planos", { mine: false, assignee_id: TOMAS.id, assignee: TOMAS })]} />);
    const fila = screen.getByText("Mandar los planos").closest("div")!.parentElement!;
    expect(fila).toHaveTextContent("Tomás");
  });
});
