import { describe, expect, it } from "vitest";

import { buildShape, extendSegment, positionMath, xabcdRatios, type Point } from "./geometry";
import { defaultStyle } from "./style";
import { TOOLS } from "./tools";

const p = (x: number, y: number): Point => ({ x, y });
const money = (n: number) => n.toFixed(2);

const build = (tool: Parameters<typeof buildShape>[0]["tool"], points: Point[], over = {}, prices?: number[]) =>
  buildShape({
    tool,
    points,
    style: { ...defaultStyle(tool), ...over },
    width: 800,
    height: 400,
    prices,
    formatPrice: money,
  });

describe("alargar un segmento", () => {
  it("no lo toca si no se pide", () => {
    const s = extendSegment(p(10, 10), p(20, 20), 800, false, false);
    expect(s.from).toEqual(p(10, 10));
    expect(s.to).toEqual(p(20, 20));
  });

  it("lo alarga por el lado que se pida, conservando la dirección", () => {
    const s = extendSegment(p(10, 10), p(20, 20), 800, false, true);
    expect(s.from).toEqual(p(10, 10));
    expect(s.to.x).toBeGreaterThan(800);
    // La pendiente no cambia: sigue siendo la misma recta.
    expect(s.to.y - s.from.y).toBeCloseTo(s.to.x - s.from.x, 6);
  });

  it("una línea casi vertical también se sale del lienzo", () => {
    // Con un avance fijo en x, una casi vertical se quedaría corta.
    const s = extendSegment(p(400, 10), p(401, 300), 800, true, true);
    expect(s.from.y).toBeLessThan(0);
    expect(s.to.y).toBeGreaterThan(400);
  });

  it("dos puntos iguales no producen infinitos", () => {
    const s = extendSegment(p(10, 10), p(10, 10), 800, true, true);
    expect(Number.isFinite(s.to.x)).toBe(true);
  });
});

describe("cada herramienta produce algo", () => {
  it("ninguna se queda en blanco con sus puntos completos", () => {
    // Una herramienta que no pinta nada es una que parece rota al usarla.
    for (const tool of TOOLS) {
      const points = Array.from({ length: tool.points }, (_, i) => p(100 + i * 60, 100 + i * 40));
      const prices = Array.from({ length: tool.points }, (_, i) => 68000 + i * 100);
      const shape = build(tool.id, points, {}, prices);
      const total =
        shape.segments.length + shape.polygons.length + shape.ellipses.length + shape.curves.length;
      expect(total, `${tool.id} no pinta nada`).toBeGreaterThan(0);
    }
  });

  it("ninguna revienta con menos puntos de los que pide", () => {
    // Pasa siempre: entre el primer clic y el último hay una vista previa.
    for (const tool of TOOLS) {
      for (let n = 1; n < tool.points; n += 1) {
        const points = Array.from({ length: n }, (_, i) => p(100 + i * 60, 100 + i * 40));
        expect(() => build(tool.id, points), `${tool.id} con ${n} puntos`).not.toThrow();
      }
    }
  });

  it("ninguna produce una coordenada que no es un número", () => {
    // Un NaN en el canvas no da error: deja de pintar y no dice nada.
    for (const tool of TOOLS) {
      const points = Array.from({ length: tool.points }, (_, i) => p(100 + i * 60, 100 + i * 40));
      const shape = build(tool.id, points, {}, [68000, 68100, 68200, 68300, 68400]);
      for (const s of shape.segments) {
        expect(Number.isFinite(s.from.x) && Number.isFinite(s.from.y), `${tool.id}`).toBe(true);
        expect(Number.isFinite(s.to.x) && Number.isFinite(s.to.y), `${tool.id}`).toBe(true);
      }
      for (const poly of shape.polygons) {
        for (const punto of poly.points) {
          expect(Number.isFinite(punto.x) && Number.isFinite(punto.y), `${tool.id}`).toBe(true);
        }
      }
    }
  });
});

describe("líneas", () => {
  it("la horizontal cruza todo el ancho", () => {
    const shape = build("HLINE", [p(400, 200)]);
    expect(shape.segments[0].from.x).toBe(0);
    expect(shape.segments[0].to.x).toBe(800);
  });

  it("el rayo horizontal empieza donde se puso", () => {
    const shape = build("HRAY", [p(400, 200)], { extendLeft: false });
    expect(shape.segments[0].from.x).toBe(400);
  });

  it("la cruz pinta las dos líneas", () => {
    expect(build("CROSSLINE", [p(400, 200)]).segments).toHaveLength(2);
  });
});

describe("el canal paralelo", () => {
  it("la paralela pasa por el tercer punto", () => {
    // Es la definición del canal: si no pasa por ahí, el ancho es otro.
    const shape = build("PARALLEL_CHANNEL", [p(100, 300), p(300, 100), p(200, 250)]);
    const paralela = shape.segments[1];
    const pendiente = (paralela.to.y - paralela.from.y) / (paralela.to.x - paralela.from.x);
    const yEn200 = paralela.from.y + pendiente * (200 - paralela.from.x);
    expect(yEn200).toBeCloseTo(250, 6);
  });

  it("se desplaza en vertical, no perpendicularmente", () => {
    // El eje vertical es el precio: una separación perpendicular mezclaría
    // precio con tiempo y el canal dejaría de significar un rango de precio.
    const shape = build("PARALLEL_CHANNEL", [p(0, 100), p(100, 100), p(50, 150)]);
    const [base, paralela] = shape.segments;
    expect(paralela.from.y - base.from.y).toBeCloseTo(50, 6);
    expect(paralela.from.x).toBeCloseTo(base.from.x, 6);
  });
});

describe("la horquilla de Andrews", () => {
  it("la mediana sale del primer punto y pasa por el medio de los otros dos", () => {
    // Es la construcción original, no una aproximación.
    const shape = build("PITCHFORK", [p(100, 200), p(300, 100), p(300, 300)]);
    const mediana = shape.segments[0];
    expect(mediana.from).toEqual(p(100, 200));
    // El medio de (300,100) y (300,300) es (300,200): la mediana es horizontal.
    expect(mediana.to.y).toBeCloseTo(200, 6);
  });

  it("las dos ramas son paralelas a la mediana", () => {
    const shape = build("PITCHFORK", [p(100, 300), p(300, 100), p(400, 200)]);
    const [mediana, ramaB, ramaC] = shape.segments;
    const pendiente = (s: { from: Point; to: Point }) => (s.to.y - s.from.y) / (s.to.x - s.from.x);
    expect(pendiente(ramaB)).toBeCloseTo(pendiente(mediana), 6);
    expect(pendiente(ramaC)).toBeCloseTo(pendiente(mediana), 6);
  });
});

describe("Fibonacci", () => {
  it("pinta una línea por nivel más la del movimiento", () => {
    const shape = build("FIB", [p(100, 300), p(300, 100)], { levels: [0, 0.5, 1] });
    expect(shape.segments).toHaveLength(4);
  });

  it("el 50% cae justo en medio", () => {
    const shape = build("FIB", [p(100, 300), p(300, 100)], { levels: [0.5], showLabels: false });
    expect(shape.segments[0].from.y).toBeCloseTo(200, 6);
  });

  it("la etiqueta lleva el precio cuando se le dan los precios", () => {
    const shape = build("FIB", [p(100, 300), p(300, 100)], { levels: [0.5] }, [68000, 69000]);
    expect(shape.labels[0].text).toContain("50%");
    expect(shape.labels[0].text).toContain("68500.00");
  });

  it("sin precios, la etiqueta es sólo el porcentaje", () => {
    const shape = build("FIB", [p(100, 300), p(300, 100)], { levels: [0.618] });
    expect(shape.labels[0].text).toBe("61.8%");
  });

  it("la extensión proyecta desde el tercer punto, no desde el segundo", () => {
    // Es lo que la distingue del retroceso.
    const shape = build(
      "FIB_EXTENSION",
      [p(100, 300), p(200, 100), p(300, 250)],
      { levels: [1], showLabels: false },
    );
    // Alto = 100 - 300 = -200. Proyectado desde y=250 → 50.
    const nivel = shape.segments.find((s) => s.from.y === 50);
    expect(nivel).toBeDefined();
  });
});

describe("la caja de Gann", () => {
  it("pinta la rejilla y las dos diagonales", () => {
    const shape = build("GANN_BOX", [p(100, 100), p(300, 300)], { levels: [0, 0.5, 1] });
    // Tres niveles × (una horizontal + una vertical) + dos diagonales.
    expect(shape.segments).toHaveLength(8);
  });
});

describe("la posición", () => {
  it("calcula la relación beneficio/riesgo", () => {
    const m = positionMath(68000, 67000, 70000, defaultStyle("LONG_POSITION"));
    expect(m.risk).toBe("1000.00");
    expect(m.reward).toBe("2000.00");
    expect(m.ratio).toBe("2.00");
  });

  it("funciona igual en corto, donde el objetivo está por debajo", () => {
    const m = positionMath(68000, 69000, 66000, defaultStyle("SHORT_POSITION"));
    expect(m.risk).toBe("1000.00");
    expect(m.reward).toBe("2000.00");
    expect(m.ratio).toBe("2.00");
  });

  it("no divide por cero cuando el stop está en la entrada", () => {
    const m = positionMath(68000, 68000, 70000, defaultStyle("LONG_POSITION"));
    expect(m.ratio).toBeNull();
    expect(m.summary).toContain("--");
  });

  it("saca el tamaño del capital y el riesgo aceptado", () => {
    // 10.000 al 1% son 100; con 1.000 de riesgo por contrato, 0,1 contratos.
    const m = positionMath(68000, 67000, 70000, {
      ...defaultStyle("LONG_POSITION"),
      accountSize: 10000,
      riskPercent: 1,
    });
    expect(m.size).toBe("0.10");
    expect(m.summary).toContain("contratos");
  });

  it("sin capital declarado no inventa un tamaño", () => {
    expect(positionMath(68000, 67000, 70000, defaultStyle("LONG_POSITION")).size).toBeNull();
  });

  it("pinta las dos zonas y las tres líneas", () => {
    const shape = build("LONG_POSITION", [p(100, 200), p(100, 300), p(100, 100)], {}, [
      68000, 67000, 70000,
    ]);
    expect(shape.polygons).toHaveLength(2);
    expect(shape.segments.filter((s) => s.from.y !== s.to.y)).toHaveLength(0);
  });
});

describe("las proporciones del XABCD", () => {
  it("cada tramo contra el anterior", () => {
    // XA = 100, AB = 61,8 → 0,618, que es lo que pide un Gartley.
    expect(xabcdRatios([100, 200, 138.2])).toEqual(["0.618"]);
  });

  it("no divide por cero cuando dos puntos coinciden", () => {
    expect(xabcdRatios([100, 100, 150])).toEqual(["--"]);
  });

  it("da una proporción menos que puntos hay", () => {
    expect(xabcdRatios([1, 2, 3, 4, 5])).toHaveLength(3);
  });
});

describe("el rango de fecha y precio", () => {
  it("dice cuánto se movió y en qué porcentaje", () => {
    const shape = build("DATE_PRICE_RANGE", [p(100, 300), p(300, 100)], {}, [68000, 69360]);
    const texto = shape.labels[0].text;
    expect(texto).toContain("+1360.00");
    expect(texto).toContain("2.00%");
  });

  it("un movimiento a la baja lleva su signo", () => {
    const shape = build("DATE_PRICE_RANGE", [p(100, 100), p(300, 300)], {}, [69000, 68000]);
    expect(shape.labels[0].text).toContain("-1000.00");
  });
});

describe("la onda de Elliott", () => {
  it("etiqueta según el grado elegido", () => {
    const puntos = Array.from({ length: 5 }, (_, i) => p(100 + i * 50, 200 - i * 20));
    expect(build("ELLIOTT", puntos).labels.map((l) => l.text)).toEqual(["1", "2", "3", "4", "5"]);
    expect(build("ELLIOTT", puntos, { waveDegree: "PRIMARY" }).labels.map((l) => l.text)).toEqual([
      "I",
      "II",
      "III",
      "IV",
      "V",
    ]);
  });

  it("sin etiquetas no pone ninguna", () => {
    const puntos = Array.from({ length: 5 }, (_, i) => p(100 + i * 50, 200));
    expect(build("ELLIOTT", puntos, { showLabels: false }).labels).toHaveLength(0);
  });
});
