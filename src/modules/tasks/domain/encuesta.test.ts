import { describe, expect, it } from "vitest";

import { diaMenos, opcionesDe, type PasoChips, type PasoFecha } from "@/core/encuesta/pasos";

import { ETIQUETAS_TAREA, pasosDeTarea, type ProyectoElegible } from "./encuesta";

const HOY = "2026-03-15";

const PROYECTOS: ProyectoElegible[] = [
  { id: "p1", name: "Casa", icon: "🏠" },
  { id: "p2", name: "Trabajo", icon: null },
];

describe("el orden de las preguntas", () => {
  /**
   * Primero lo que sitúa la tarea en la lista --estado, prioridad, proyecto--
   * y luego cuándo. Quien abandone a la mitad deja decidido lo que hace que la
   * tarea aparezca en el sitio correcto, que es para lo que sirve la lista.
   */
  it("decide antes dónde va que qué dice", () => {
    expect(pasosDeTarea(PROYECTOS, HOY).map((p) => p.id)).toEqual([
      "title",
      "status",
      "priority",
      "project_id",
      "due_date",
      "due_time",
      "due_end",
      "categories",
      "notes",
      "description",
    ]);
  });

  it("todas las respuestas tienen nombre corto para la ficha", () => {
    for (const paso of pasosDeTarea(PROYECTOS, HOY)) {
      expect(ETIQUETAS_TAREA[paso.id]).toBeTruthy();
    }
  });
});

describe("los proyectos", () => {
  it("se ofrecen como fichas, con su icono delante", () => {
    const paso = pasosDeTarea(PROYECTOS, HOY).find((p): p is PasoChips => p.id === "project_id")!;
    expect(opcionesDe(paso).map((o) => o.etiqueta)).toEqual(["🏠 Casa", "Trabajo"]);
  });

  it("se puede contestar «sin proyecto», que no es lo mismo que saltarla", () => {
    const paso = pasosDeTarea(PROYECTOS, HOY).find((p): p is PasoChips => p.id === "project_id")!;
    expect(paso.ninguno).toBeTruthy();
  });

  it("sin proyectos la pregunta desaparece en vez de quedarse vacía", () => {
    expect(pasosDeTarea([], HOY).map((p) => p.id)).not.toContain("project_id");
  });
});

describe("los plazos", () => {
  it("van hacia delante: una tarea se aplaza, no se retrasa al pasado", () => {
    const paso = pasosDeTarea(PROYECTOS, HOY).find((p): p is PasoFecha => p.id === "due_date")!;
    const dias = (paso.atajos ?? []).map((a) => [a.etiqueta, diaMenos(HOY, a.dias)]);

    expect(dias).toEqual([
      ["Hoy", "2026-03-15"],
      ["Mañana", "2026-03-16"],
      ["Pasado", "2026-03-17"],
      ["En una semana", "2026-03-22"],
    ]);
  });

  it("el día en que acaba usa los mismos atajos que el día en que empieza", () => {
    const pasos = pasosDeTarea(PROYECTOS, HOY);
    const inicio = pasos.find((p): p is PasoFecha => p.id === "due_date")!;
    const fin = pasos.find((p): p is PasoFecha => p.id === "due_end")!;
    expect(fin.atajos).toEqual(inicio.atajos);
  });
});
