// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallosDeAccesibilidad } from "@/test-support/axe";

import { TaskSurvey } from "./task-survey";
import type { ProjectRow, TaskRow } from "@/modules/tasks/queries";

/**
 * Lo que tiene que cumplir la ficha de una tarea.
 *
 * La diferencia con las demás encuestas, y la razón de estas pruebas: una
 * tarea no se escribe una vez y se archiva, se toca muchas veces. Si rellenar
 * la deja bien pero cambiarle la fecha cuesta nueve toques, esto habrá
 * empeorado el módulo aunque cada pregunta suelta se vea mejor.
 */

const guardados: { campo: string; valor: unknown }[] = [];

vi.mock("@/modules/tasks/actions", () => ({
  saveTaskAnswer: async (_taskId: string, campo: string, valor: unknown) => {
    guardados.push({ campo, valor });
    return { error: null, success: true };
  },
}));

const HOY = "2026-03-15";

const PROYECTOS: ProjectRow[] = [
  { id: "11111111-1111-8111-8111-111111111111", name: "Casa", icon: "🏠" } as ProjectRow,
];

/** Una tarea recién apuntada: título y los dos valores por defecto, nada más. */
function recienApuntada(extra: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "99999999-9999-8999-8999-999999999999",
    title: "Llamar al fontanero",
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
    created_at: "2026-03-15T10:00:00Z",
    completed_at: null,
    ...extra,
  } as TaskRow;
}

/** Una tarea con todo contestado. */
function entera(extra: Partial<TaskRow> = {}): TaskRow {
  return recienApuntada({
    project_id: PROYECTOS[0].id,
    due_date: "2026-03-16",
    due_time: "09:00:00",
    due_end: "2026-03-18",
    categories: ["Casa"],
    notes: "El del bajo",
    description: "Gotea el grifo de la cocina.",
    ...extra,
  });
}

beforeEach(() => {
  guardados.length = 0;
});

describe("una tarea recién apuntada", () => {
  /**
   * El estado y la prioridad vienen con valor por defecto, así que la primera
   * de verdad sin contestar es el proyecto: es donde se sienta uno a decidir.
   */
  it("abre en la primera pregunta sin contestar", () => {
    render(<TaskSurvey task={recienApuntada()} projects={PROYECTOS} hoy={HOY} />);
    expect(screen.getByRole("heading", { name: "¿De qué proyecto es?" })).toBeTruthy();
  });

  it("cada respuesta se guarda al contestarla", async () => {
    const user = userEvent.setup();
    render(<TaskSurvey task={recienApuntada()} projects={PROYECTOS} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Casa/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({ campo: "project_id", valor: PROYECTOS[0].id }),
    );
  });
});

describe("una tarea ya entera", () => {
  /**
   * Lo que más se hace con una tarea es cambiarle un campo, no rellenarla. Si
   * abriera en la primera pregunta, moverla al viernes costaría recorrer
   * nueve.
   */
  it("abre en su ficha, no en la primera pregunta", () => {
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    expect(screen.getByRole("heading", { name: "La tarea, entera" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "¿Qué hay que hacer?" })).toBeNull();
  });

  it("enseña lo contestado con el nombre de cada cosa", () => {
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    expect(screen.getByText("Llamar al fontanero")).toBeTruthy();
    expect(screen.getByText("Gotea el grifo de la cocina.")).toBeTruthy();
    // El día por su nombre y no en crudo: «Mañana» se lee de un vistazo.
    expect(screen.getByText("Mañana")).toBeTruthy();
  });

  it("tocar una línea salta a su pregunta y sólo a ésa", async () => {
    const user = userEvent.setup();
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Para\s+Mañana/ }));

    expect(screen.getByRole("heading", { name: "¿Para cuándo?" })).toBeTruthy();
  });

  it("y desde ahí se cambia en un toque", async () => {
    const user = userEvent.setup();
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Para\s+Mañana/ }));
    await user.click(screen.getByRole("button", { name: "En una semana" }));
    await user.click(screen.getByRole("button", { name: /Siguiente|Terminar/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({ campo: "due_date", valor: "2026-03-22" }),
    );
  });
});

describe("los huecos de la ficha", () => {
  it("las preguntas sin contestar también salen, para poder tocarlas", () => {
    render(<TaskSurvey task={entera({ notes: null })} projects={PROYECTOS} hoy={HOY} />);

    // Con un hueco, la tarea ya no está entera, así que abre en él.
    expect(screen.getByRole("heading", { name: "¿Alguna nota?" })).toBeTruthy();
  });

  it("desde la ficha se llega a un hueco igual que a lo contestado", async () => {
    const user = userEvent.setup();
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Estado/ }));

    expect(screen.getByRole("heading", { name: "¿Cómo va?" })).toBeTruthy();
  });

  it("marcar hecha desde la ficha manda el estado", async () => {
    const user = userEvent.setup();
    render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Estado/ }));
    await user.click(screen.getByRole("button", { name: "Hecha" }));

    // El sello de cierre lo pone el servidor, que es quien sabe si ya estaba
    // puesto; aquí basta con que la respuesta llegue.
    await waitFor(() => expect(guardados).toContainEqual({ campo: "status", valor: "HECHA" }));
  });
});

describe("accesibilidad", () => {
  it("la ficha, con el selector de icono, no tiene fallos que jsdom pueda ver", async () => {
    const { container } = render(<TaskSurvey task={entera()} projects={PROYECTOS} hoy={HOY} />);
    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });
});
