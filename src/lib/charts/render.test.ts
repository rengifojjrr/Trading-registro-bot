import { describe, expect, it } from "vitest";

import { buildShape } from "./geometry";
import { clampLabel, distanceToSegment, distanceToShape, labelTopLeft, renderShape } from "./render";
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
      // Un ancho por carácter que basta: lo que se comprueba aquí no es la
      // tipografía, sino que la etiqueta acaba dentro del lienzo.
      measureText(t: string) { return { width: t.length * 6 }; },
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

describe("el orden de pintado", () => {
  it("el texto se pinta después de los tiradores", () => {
    // En una anotación el punto de anclaje *es* el centro del texto: un
    // tirador pintado encima tapa una letra justo cuando el dibujo se acaba de
    // crear y está seleccionado, que es cuando más se mira.
    const orden: string[] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      ellipse() {}, quadraticCurveTo() {}, setLineDash() {}, stroke() {}, strokeText() {},
      arc() { orden.push("tirador"); },
      fill() {},
      fillText() { orden.push("texto"); },
      measureText(t: string) { return { width: t.length * 6 }; },
      strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
      font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const style = defaultStyle("NOTE");
    const shape = buildShape({
      tool: "NOTE",
      points: [{ x: 200, y: 200 }],
      style: { ...style, textLabel: "hola" },
      width: 800,
      height: 400,
    });
    renderShape(ctx, shape, style, { handles: [{ x: 200, y: 200 }] });

    expect(orden).toEqual(["tirador", "texto"]);
  });

  it("una zona con relleno propio no se pinta del color del dibujo", () => {
    const pintados: string[] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      arc() {}, ellipse() {}, quadraticCurveTo() {}, setLineDash() {}, stroke() {},
      strokeText() {}, fillText() {},
      measureText(t: string) { return { width: t.length * 6 }; },
      fill() { pintados.push(String(ctx.fillStyle)); },
      strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
      font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D & { fillStyle: string };

    const style = defaultStyle("LONG_POSITION");
    const shape = buildShape({
      tool: "LONG_POSITION",
      points: [
        { x: 100, y: 200 },
        { x: 100, y: 260 },
        { x: 100, y: 120 },
      ],
      style,
      width: 800,
      height: 400,
      prices: [68000, 67900, 68200],
    });
    renderShape(ctx, shape, style);

    expect(pintados[0]).toContain("239, 68, 68");
    expect(pintados[1]).toContain("34, 197, 94");
  });
});

describe("las etiquetas se quedan dentro del lienzo", () => {
  it("una etiqueta que cabe no se mueve", () => {
    const caja = { x: 100, y: 100, width: 80, height: 12 };
    expect(clampLabel(caja, { width: 800, height: 400 })).toEqual({ x: 100, y: 100 });
  });

  it("la que se sale por arriba baja hasta el borde", () => {
    // Es el caso real: el objetivo de un plan que cae en lo más alto de la
    // vista pintaba «objetivo $71.500,00» cortado por la mitad de arriba.
    const caja = { x: 100, y: -9, width: 120, height: 12 };
    expect(clampLabel(caja, { width: 800, height: 400 })).toEqual({ x: 100, y: 2 });
  });

  it("la que se sale por la derecha entra hasta el borde", () => {
    const caja = { x: 760, y: 100, width: 120, height: 12 };
    expect(clampLabel(caja, { width: 800, height: 400 })).toEqual({ x: 678, y: 100 });
  });

  it("una etiqueta más ancha que el gráfico enseña el principio", () => {
    // Recortada por la derecha se lee «objetivo $71.5»; recortada por la
    // izquierda, «00,00», que no dice de qué es.
    const caja = { x: -50, y: 100, width: 900, height: 12 };
    expect(clampLabel(caja, { width: 800, height: 400 }).x).toBe(2);
  });

  it("el anclaje se convierte a la esquina según su alineación", () => {
    expect(labelTopLeft({ x: 100, y: 50 }, 40, 10, "center", "middle")).toEqual({ x: 80, y: 45 });
    expect(labelTopLeft({ x: 100, y: 50 }, 40, 10, "right", "bottom")).toEqual({ x: 60, y: 40 });
    expect(labelTopLeft({ x: 100, y: 50 }, 40, 10, "left", "top")).toEqual({ x: 100, y: 50 });
  });

  it("con el lienzo pintan dentro; sin él, donde diga la geometría", () => {
    function espia(bounds?: { width: number; height: number }) {
      const puestas: { x: number; y: number }[] = [];
      const ctx = {
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        arc() {}, ellipse() {}, quadraticCurveTo() {}, setLineDash() {}, stroke() {},
        strokeText() {}, fill() {},
        measureText(t: string) { return { width: t.length * 6 }; },
        fillText(_t: string, x: number, y: number) { puestas.push({ x, y }); },
        strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
        font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D;

      const style = defaultStyle("TEXT");
      const shape = buildShape({
        tool: "TEXT",
        // Pegado al techo: la etiqueta se ancla en el punto y su mitad de
        // arriba queda fuera.
        points: [{ x: 400, y: 0 }],
        style,
        width: 800,
        height: 400,
      });
      renderShape(ctx, shape, style, bounds ? { bounds } : {});
      return puestas;
    }

    expect(espia({ width: 800, height: 400 })[0].y).toBeGreaterThanOrEqual(0);
    expect(espia()[0].y).toBeLessThan(0);
  });
});
