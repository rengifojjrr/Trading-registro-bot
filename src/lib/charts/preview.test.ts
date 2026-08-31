import { describe, expect, it } from "vitest";

import { previewPoints, renderPreview } from "./preview";
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

describe("las miniaturas de las anotaciones", () => {
  /**
   * Un lienzo de mentira que apunta el texto que se le pide pintar.
   *
   * Las anotaciones no tienen forma propia: lo que se dibuja es su texto. Sin
   * decirle cuál, la geometría pone el suyo de relleno -- «Texto…», «Nota…» --
   * y en un icono de veinte píxeles eso salía como «exto».
   */
  function lienzoDeTexto() {
    const textos: string[] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      arc() {}, ellipse() {}, quadraticCurveTo() {}, setLineDash() {}, stroke() {},
      rect() {}, clip() {}, fill() {}, setTransform() {}, clearRect() {},
      measureText(t: string) { return { width: t.length * 6 }; },
      strokeText() {},
      fillText(t: string) { textos.push(t); },
      strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
      font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    return { ctx, textos };
  }

  it("una sola letra, nunca una palabra de relleno", () => {
    for (const tool of ["TEXT", "NOTE", "CALLOUT", "PRICE_LABEL"] as const) {
      const { ctx, textos } = lienzoDeTexto();
      renderPreview(ctx, tool, 20, 20);

      expect(textos, tool).not.toHaveLength(0);
      for (const t of textos) {
        expect(t.length, `${tool}: "${t}"`).toBeLessThanOrEqual(2);
        expect(t, tool).not.toMatch(/…/);
      }
    }
  });

  it("la letra cabe entera dentro del icono", () => {
    // Seis píxeles por carácter contra un icono de veinte: si la esquina
    // saliera negativa, el navegador recortaría media letra.
    const { ctx, textos } = lienzoDeTexto();
    renderPreview(ctx, "TEXT", 20, 20);
    expect(textos).toEqual(["T"]);
  });
});
