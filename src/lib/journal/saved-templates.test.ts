import { describe, expect, it } from "vitest";

import { describeTemplate, parseTemplateValues } from "./saved-templates";

describe("leer una plantilla guardada", () => {
  it("aguanta que la columna traiga cualquier cosa", () => {
    // Es `jsonb`. Reventar aquí rompería el diálogo de apuntar justo cuando
    // alguien intenta despachar una ráfaga deprisa.
    expect(parseTemplateValues(null)).toEqual({});
    expect(parseTemplateValues([1, 2] as never)).toEqual({});
    expect(parseTemplateValues("texto" as never)).toEqual({});
  });

  it("descarta códigos de error que ya no existen", () => {
    // Una plantilla de hace meses puede traer un código retirado. Aplicarlo
    // escribiría en `trade_mistakes` algo que ninguna pantalla sabe contar.
    const values = parseTemplateValues({ mistakes: ["FOMO", "INVENTADO", "OVERTRADING"] });
    expect(values.mistakes).toEqual(["FOMO", "OVERTRADING"]);
  });

  it("no guarda listas vacías, para que no cuenten como campo marcado", () => {
    // Un campo presente pero vacío haría que la vista previa dijera que se va
    // a escribir algo cuando no se va a escribir nada.
    expect(parseTemplateValues({ mistakes: [], emotional_state: ["  "] })).toEqual({});
  });

  it("limpia el texto y respeta los topes", () => {
    const values = parseTemplateValues({ notes: `  ${"x".repeat(6000)}  ` });
    expect(values.notes).toHaveLength(5000);
  });

  it("rechaza puntuaciones fuera de rango o decimales", () => {
    expect(parseTemplateValues({ plan_adherence: 9 }).plan_adherence).toBeUndefined();
    expect(parseTemplateValues({ plan_adherence: 2.5 }).plan_adherence).toBeUndefined();
    expect(parseTemplateValues({ plan_adherence: 3 }).plan_adherence).toBe(3);
  });

  it("conserva la estrategia aunque apunte a una archivada", () => {
    // Quién puede usarla lo decide la comprobación de propiedad al aplicar,
    // no el lector de la plantilla.
    const id = "3f8b1c2d-0000-4000-8000-000000000000";
    expect(parseTemplateValues({ strategy_id: id }).strategy_id).toBe(id);
  });

  it("una plantilla a la que le falta un trozo sigue sirviendo", () => {
    const values = parseTemplateValues({ mistakes: ["FOMO"], plan_adherence: "alta", notes: 42 });
    expect(values.mistakes).toEqual(["FOMO"]);
    expect(values.plan_adherence).toBeUndefined();
    expect(values.notes).toBeUndefined();
  });
});

describe("describir una plantilla en una línea", () => {
  it("enumera lo que trae", () => {
    const texto = describeTemplate({ mistakes: ["FOMO"], notes: "algo", plan_adherence: 2 });
    expect(texto).toContain("1 error(es)");
    expect(texto).toContain("adherencia");
    expect(texto).toContain("notas");
  });

  it("lo dice cuando no trae nada", () => {
    expect(describeTemplate({})).toBe("Vacía");
  });
});

describe("las plantillas guardan también las preguntas del plan", () => {
  it("se lee la nota del setup", () => {
    expect(parseTemplateValues({ setup_grade: "A+" }).setup_grade).toBe("A+");
  });

  it("una nota que no existe se descarta en vez de escribirse", () => {
    expect(parseTemplateValues({ setup_grade: "D" }).setup_grade).toBeUndefined();
    expect(parseTemplateValues({ setup_grade: 4 }).setup_grade).toBeUndefined();
  });

  it("se lee la dirección planeada, pero nunca «sin definir»", () => {
    // Una plantilla que ponga `NONE` borraría la dirección que ya tuvieran, y
    // aplicar una plantilla no borra nada.
    expect(parseTemplateValues({ planned_direction: "LONG" }).planned_direction).toBe("LONG");
    expect(parseTemplateValues({ planned_direction: "NONE" }).planned_direction).toBeUndefined();
  });

  it("el resumen nombra lo que trae", () => {
    const texto = describeTemplate({
      setup_grade: "B",
      planned_direction: "SHORT",
      htf_bias: "Bajista",
      sr_proximity: "En resistencia",
      entry_quality: 4,
    });

    expect(texto).toContain("setup B");
    expect(texto).toContain("dirección");
    expect(texto).toContain("sesgo");
    expect(texto).toContain("calidad de entrada");
  });
});
