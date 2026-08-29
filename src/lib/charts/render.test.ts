import { describe, expect, it } from "vitest";

import { buildShape } from "./geometry";
import { distanceToSegment, distanceToShape, renderShape } from "./render";
import { defaultStyle } from "./style";

describe("distancia a un segmento", () => {
  it("cero si el punto está encima", () => {
    expect(distanceToSegment(5, 5, 0, 0, 10, 10)).toBeCloseTo(0, 6);
  });

  it("la perpendicular cuando cae dentro", () => {
    expect(distanceToSegment(0, 10, 0, 0, 10, 0)).toBeCloseTo(10, 6);
  });

  it("se queda dentro del segmento, no de la recta", () => {
    // Un clic muy lejos pero alineado con la recta no puede contar como encima:
    // si no, seleccionar una línea de tendencia sería posible desde el otro
    // extremo del gráfico.
    expect(distanceToSegment(1000, 1000, 0, 0, 10, 10)).toBeCloseTo(Math.hypot(990, 990), 6);
  });

  it("un segmento de longitud cero no divide por cero", () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 6);
  });
});

describe("distancia a una figura", () => {
  const style = defaultStyle("RECTANGLE");
  const shape = buildShape({
    tool: "RECTANGLE",
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ],
    style,
    width: 800,
    height: 400,
  });

  it("cero sobre el borde", () => {
    expect(distanceToShape(shape, 200, 100)).toBeCloseTo(0, 6);
  });

  it("se mide contra el borde, no contra el relleno", () => {
    // Pinchar dentro de un rectángulo grande y moverlo sin querer es más
    // molesto que tener que pinchar el borde.
    expect(distanceToShape(shape, 200, 150)).toBeGreaterThan(40);
  });

  it("una elipse se mide contra su contorno", () => {
    const elipse = buildShape({
      tool: "ELLIPSE",
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 300 },
      ],
      style: defaultStyle("ELLIPSE"),
      width: 800,
      height: 400,
    });
    // El centro está a un radio del borde; un punto del borde, a cero.
    expect(distanceToShape(elipse, 200, 100)).toBeLessThan(2);
    expect(distanceToShape(elipse, 200, 200)).toBeGreaterThan(50);
  });

  it("una curva se puede seleccionar por donde se ve", () => {
    const arco = buildShape({
      tool: "ARC",
      points: [
        { x: 100, y: 300 },
        { x: 300, y: 300 },
        { x: 200, y: 100 },
      ],
      style: defaultStyle("ARC"),
      width: 800,
      height: 400,
    });
    // El vértice de la parábola con control en (200,100) cae en y=200.
    expect(distanceToShape(arco, 200, 200)).toBeLessThan(5);
  });

  it("una figura vacía está infinitamente lejos, no a cero", () => {
    // A cero, un clic en cualquier sitio seleccionaría el dibujo vacío.
    const vacia = { segments: [], labels: [], polygons: [], ellipses: [], curves: [] };
    expect(distanceToShape(vacia, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("el contorno de las etiquetas", () => {
  /**
   * Un lienzo de mentira que apunta cada color de trazo que se le pide.
   *
   * jsdom no trae contexto 2D, y aquí no hace falta: lo que se comprueba es
   * *qué colores* pide el pintor, no cómo quedan los píxeles.
   */
  function lienzoEspia() {
    const trazos: string[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      arc() {},
      ellipse() {},
      quadraticCurveTo() {},
      setLineDash() {},
      fill() {},
      fillText() {},
      strokeText() {
        trazos.push(String(ctx.strokeStyle));
      },
      stroke() {
        trazos.push(String(ctx.strokeStyle));
      },
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      lineJoin: "",
      lineCap: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      globalAlpha: 1,
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, trazos };
  }

  const style = defaultStyle("FIB");
  const shape = buildShape({
    tool: "FIB",
    points: [
      { x: 100, y: 300 },
      { x: 400, y: 100 },
    ],
    style,
    width: 800,
    height: 400,
    prices: [67000, 69000],
  });

  it("usa el color del fondo que le den, no un negro fijo", () => {
    // Un contorno negro fijo separa el texto en el tema oscuro y lo ensucia en
    // el claro. El fondo lo sabe quien pinta el gráfico, no esta función.
    const { ctx, trazos } = lienzoEspia();
    renderShape(ctx, shape, style, { haloColor: "rgba(255, 255, 255, 0.75)" });

    expect(trazos).toContain("rgba(255, 255, 255, 0.75)");
    expect(trazos.some((t) => t.startsWith("rgba(0, 0, 0"))).toBe(false);
  });

  it("sin fondo conocido no inventa un contorno", () => {
    const { ctx, trazos } = lienzoEspia();
    renderShape(ctx, shape, style, {});

    // Sólo el color del propio dibujo llega al lienzo.
    expect(new Set(trazos)).toEqual(new Set([style.color]));
  });
});
