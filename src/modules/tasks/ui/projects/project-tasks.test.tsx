// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { fallosDeAccesibilidad } from "@/test-support/axe";
import type { PersonRow, ProjectTaskRow } from "@/modules/tasks/project-queries";

import { HealthDot } from "./health-dot";
import { ProjectTasks } from "./project-tasks";

/**
 * Las tareas de un proyecto, por persona, y el semáforo con su texto.
 * Personas inventadas.
 */

vi.mock("@/modules/tasks/project-actions", () => ({
  addProjectTask: async () => ({ error: null }),
  setProjectTaskStatus: async () => ({ error: null }),
  updateProjectTask: async () => ({ error: null }),
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

function persona(id: string, name: string, extra: Partial<PersonRow> = {}): PersonRow {
  return {
    id,
    name,
    aliases: [],
    is_owner: false,
    relation: null,
    org: null,
    circle: null,
    note: null,
    has_whatsapp: false,
    whatsapp_hint: null,
    phone_tail: null,
    color: null,
    archived_at: null,
    field_src: {},
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

function tarea(id: string, title: string, extra: Partial<ProjectTaskRow> = {}): ProjectTaskRow {
  return {
    id,
    title,
    status: "NO_INICIADA",
    priority: "MEDIA",
    due_date: null,
    due_time: null,
    project_id: "p1",
    assignee_id: null,
    stream_id: null,
    milestone_id: null,
    parent_id: null,
    origin: "A_MANO",
    source_kind: null,
    source_label: null,
    notes: null,
    notion_page_id: null,
    field_src: {},
    created_at: "2026-10-01T00:00:00Z",
    completed_at: null,
    ...extra,
  };
}

const YO = persona("00000000-0000-7000-8000-000000000001", "Yo", { is_owner: true });
const LUCIA = persona("00000000-0000-7000-8000-000000000002", "Lucía", { whatsapp_hint: "SI" });
const INES = persona("00000000-0000-7000-8000-000000000003", "Inés", { whatsapp_hint: "NO" });

const TAREAS = [
  tarea("t1", "Llamar a la abogada", { assignee_id: YO.id, due_date: "2026-10-01" }),
  tarea("t2", "Mandar los planos", { assignee_id: LUCIA.id, source_kind: "LLAMADA", source_label: "la llamada del 5 oct", origin: "CLAUDE" }),
  tarea("t3", "Pedir cita", { assignee_id: LUCIA.id, parent_id: "t2" }),
  tarea("t4", "Algo sin dueño"),
  tarea("t5", "Ya hecha", { assignee_id: YO.id, status: "HECHA" }),
];

function pintar() {
  return render(
    <ProjectTasks
      projectId="p1"
      tasks={TAREAS}
      members={[
        { person: YO, role: "Coordinador", waitingDays: null },
        { person: LUCIA, role: "Arquitecta", waitingDays: 5 },
        { person: INES, role: "Abogada", waitingDays: null },
      ]}
      people={[YO, LUCIA, INES]}
      ownerId={YO.id}
      streams={[]}
      milestones={[]}
      today="2026-10-06"
    />,
  );
}

describe("las tareas por persona", () => {
  it("un grupo por persona, con su papel; lo tuyo primero y lo sin asignar al final", () => {
    pintar();
    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(titulos[0]).toContain("Tú");
    expect(titulos[1]).toContain("Lucía");
    expect(titulos[1]).toContain("Arquitecta");
    expect(titulos[1]).toContain("esperando 5 días");
    expect(titulos[2]).toContain("Inés");
    expect(titulos[titulos.length - 1]).toContain("Sin asignar");
  });

  it("quien no tiene nada sale igual, con «+ tarea para…»", () => {
    pintar();
    expect(screen.getByRole("button", { name: /tarea para Inés/ })).toBeInTheDocument();
  });

  it("la subtarea va dentro de su tarea, no suelta", () => {
    pintar();
    const grupoLucia = screen.getAllByRole("heading", { level: 3 })[1].closest("section")!;
    expect(within(grupoLucia).getByText("Mandar los planos")).toBeInTheDocument();
    expect(within(grupoLucia).getByText("Pedir cita")).toBeInTheDocument();
    expect(within(grupoLucia).getByText("0/1 subtareas")).toBeInTheDocument();
  });

  it("lo atrasado se marca y lo hecho va plegado", async () => {
    pintar();
    expect(screen.queryByText("Ya hecha")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Hechas \(1\)/ }));
    expect(screen.getByText("Ya hecha")).toBeInTheDocument();
  });

  it("el icono de origen dice de dónde salió", async () => {
    pintar();
    const boton = screen.getByRole("button", { name: "Salió de la llamada del 5 oct" });
    await userEvent.setup().click(boton);
    expect(screen.getAllByText("Salió de la llamada del 5 oct").length).toBeGreaterThan(0);
  });

  it("se puede agrupar por estado", async () => {
    pintar();
    await userEvent.setup().click(screen.getByRole("button", { name: "Estado" }));
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Sin empezar");
  });

  it("el porqué del origen sale en una burbuja aparte y se cierra al tocar fuera", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: "Salió de la llamada del 5 oct" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Salió de la llamada del 5 oct");
    await user.click(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("agrupado por estado, cada tarea dice quién la hace", async () => {
    pintar();
    await userEvent.setup().click(screen.getByRole("button", { name: "Estado" }));
    const fila = screen.getByText("Mandar los planos").closest("div.flex.min-w-0")!;
    expect(fila).toHaveTextContent("Lucía");
    const sinDueno = screen.getByText("Algo sin dueño").closest("div.flex.min-w-0")!;
    expect(sinDueno).toHaveTextContent("Sin asignar");
  });

  it("«Etapa» sólo sale si alguna tarea cuelga de un hito", () => {
    pintar();
    expect(screen.queryByRole("button", { name: "Etapa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frente" })).toBeInTheDocument();
  });

  it("dentro de un grupo, lo vencido primero y luego por fecha", async () => {
    render(
      <ProjectTasks
        projectId="p1"
        tasks={[
          tarea("a", "Para noviembre", { due_date: "2026-11-18" }),
          tarea("b", "Sin fecha"),
          tarea("c", "Vencida", { due_date: "2026-10-01" }),
          tarea("d", "Para la semana", { due_date: "2026-10-13" }),
        ]}
        members={[]}
        people={[YO]}
        ownerId={YO.id}
        streams={[]}
        milestones={[]}
        today="2026-10-06"
      />,
    );
    const grupo = screen.getByRole("heading", { level: 3, name: /Sin asignar/ }).closest("section")!;
    const orden = within(grupo)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(orden).toEqual(["Vencida", "Para la semana", "Para noviembre", "Sin fecha"]);
  });

  it("es accesible", async () => {
    const { container } = pintar();
    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });
});

describe("el semáforo", () => {
  it("siempre dice con palabras lo que es, no sólo el color", () => {
    render(<HealthDot level="AMARILLO" why="2 tareas atrasadas de Lucía" />);
    expect(screen.getByText("Atención")).toBeInTheDocument();
    expect(screen.getByText(/2 tareas atrasadas de Lucía/)).toBeInTheDocument();
  });

  it("sin semáforo (en pausa) dice el estado", () => {
    render(<HealthDot level={null} why="En pausa" />);
    expect(screen.getByText("En pausa")).toBeInTheDocument();
  });
});
