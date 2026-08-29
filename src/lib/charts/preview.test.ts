import { describe, expect, it } from "vitest";

import { previewPoints } from "./preview";
import { TOOL_BY_ID, TOOLS } from "./tools";

describe("los puntos de la miniatura", () => {
  it("cada herramienta recibe exactamente los puntos que pide", () => {
    // Una miniatura con menos puntos de los necesarios se pinta como una vista
    // previa a medias -- justo lo que no se quiere enseñar en un icono.
    for (const tool of TOOLS) {
      expect(previewPoints(tool.id), tool.id).toHaveLength(TOOL_BY_ID[tool.id].points);
    }
  });

  it("todos caen dentro del lienzo", () => {
    // Fuera de [0,1] el punto se pinta fuera del icono y la herramienta se ve
    // recortada por un lado sin motivo.
    for (const tool of TOOLS) {
      for (const p of previewPoints(tool.id)) {
        expect(p.x, `${tool.id}.x`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${tool.id}.x`).toBeLessThanOrEqual(1);
        expect(p.y, `${tool.id}.y`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${tool.id}.y`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ninguna herramienta de varios puntos los pone todos en el mismo sitio", () => {
    // Salvo las posiciones, que apilan precios en una misma vertical a
    // propósito: ahí lo que varía es la altura, no el momento.
    for (const tool of TOOLS.filter((t) => t.points > 1)) {
      const puntos = previewPoints(tool.id);
      const distintos = new Set(puntos.map((p) => `${p.x},${p.y}`));
      expect(distintos.size, tool.id).toBe(puntos.length);
    }
  });
});
