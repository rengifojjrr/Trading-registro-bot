import { describe, expect, it } from "vitest";

import { applyTemplate, findTemplate, JOURNAL_TEMPLATES } from "./templates";

const plantilla = JOURNAL_TEMPLATES[0];

describe("plantillas del diario", () => {
  it("todas tienen un id distinto", () => {
    const ids = JOURNAL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todas hacen preguntas, no piden datos que la app ya sabe", () => {
    // Una plantilla que pide precio o tamaño duplica lo que ya está calculado,
    // y encima escrito a mano, que es como empiezan a discrepar dos cifras.
    for (const t of JOURNAL_TEMPLATES) {
      expect(t.body).toMatch(/[:?]/);
      expect(t.body.toLowerCase()).not.toMatch(/precio de entrada|tamaño|comisión/);
    }
  });

  it("en un recuadro vacío pone la plantilla tal cual", () => {
    expect(applyTemplate("", plantilla)).toBe(plantilla.body);
    expect(applyTemplate("   \n  ", plantilla)).toBe(plantilla.body);
  });

  it("nunca borra lo que ya estaba escrito", () => {
    // Un botón que se come un párrafo recién escrito no se vuelve a tocar.
    const resultado = applyTemplate("Ya había escrito esto.", plantilla);
    expect(resultado).toContain("Ya había escrito esto.");
    expect(resultado).toContain(plantilla.body);
    expect(resultado.indexOf("Ya había escrito")).toBeLessThan(resultado.indexOf(plantilla.body));
  });

  it("busca por id y no inventa una plantilla que no existe", () => {
    expect(findTemplate(plantilla.id)?.label).toBe(plantilla.label);
    expect(findTemplate("no-existe")).toBeUndefined();
  });
});
