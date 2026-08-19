import { describe, expect, it } from "vitest";

import { formatModuleValue } from "./format-metrics";

describe("formatModuleValue", () => {
  it("sin métricas del módulo devuelve null para que la tarjeta invite", () => {
    expect(formatModuleValue("sleep", {})).toBeNull();
  });

  it("sueño junta duración y puntaje", () => {
    expect(formatModuleValue("sleep", { sleep: { minutos: 440, puntaje: 8 } })).toBe("7h 20m · 8/10");
  });

  it("sueño sin puntaje enseña sólo la duración", () => {
    expect(formatModuleValue("sleep", { sleep: { minutos: 480 } })).toBe("8h");
  });

  it("hábitos sin ninguno activo no enseña 0 de 0", () => {
    expect(formatModuleValue("habits", { habits: { completados: 0, total: 0 } })).toBeNull();
  });

  it("hábitos a cero sí se muestra si hay hábitos que marcar", () => {
    expect(formatModuleValue("habits", { habits: { completados: 0, total: 10 } })).toBe("0 de 10");
  });

  it("cero tareas pendientes es noticia y se dice", () => {
    // Cae a texto propio en lugar de al mensaje de invitación.
    expect(formatModuleValue("tasks", { tasks: { pendientes: 0 } })).toBe("Todo al día");
  });

  it("las tareas vencidas se destacan aparte", () => {
    expect(formatModuleValue("tasks", { tasks: { pendientes: 5, vencidas: 2 } })).toBe("5 · 2 vencidas");
  });

  it("lectura sin nada registrado devuelve null, no 0m", () => {
    expect(formatModuleValue("reading", { reading: { minutos: 0, paginas: 0 } })).toBeNull();
  });

  it("lectura combina tiempo y páginas", () => {
    expect(formatModuleValue("reading", { reading: { minutos: 40, paginas: 20 } })).toBe("40m · 20 pág");
  });

  it("trading muestra el signo del resultado", () => {
    expect(
      formatModuleValue("trading", { trading: { operaciones: 2, resultado_neto: -120.5 } }),
    ).toBe("2 operaciones · -$120.50");
  });

  it("una sola operación va en singular", () => {
    expect(formatModuleValue("trading", { trading: { operaciones: 1, resultado_neto: 152.95 } })).toBe(
      "1 operación · +$152.95",
    );
  });
});
