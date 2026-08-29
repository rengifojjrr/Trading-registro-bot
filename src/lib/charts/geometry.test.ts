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
      // Las etiquetas cuentan: el texto suelto no pinta más que texto, y es
      // exactamente lo que tiene que pintar.
      const total =
        shape.segments.length +
        shape.polygons.length +
        shape.ellipses.length +
        shape.curves.length +
        shape.labels.length;
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

// ----------------------------------------------------- las de la ronda 2

/** Como `build`, pero pasando también los tiempos reales de los puntos. */
const buildConTiempo = (
  tool: Parameters<typeof buildShape>[0]["tool"],
  points: Point[],
  times: number[],
  barSeconds: number,
  over = {},
  prices?: number[],
) =>
  buildShape({
    tool,
    points,
    style: { ...defaultStyle(tool), ...over },
    width: 800,
    height: 400,
    times,
    barSeconds,
    prices,
    formatPrice: money,
  });

describe("el ángulo de tendencia", () => {
  it("una subida da grados positivos y una bajada negativos", () => {
    // En pantalla la y crece hacia abajo, así que subir es que la y baje. Sin
    // invertirlo, el ángulo diría lo contrario de lo que se ve.
    const sube = build("TREND_ANGLE", [p(100, 300), p(200, 200)]);
    expect(sube.labels[0].text).toBe("+45.0°");

    const baja = build("TREND_ANGLE", [p(100, 200), p(200, 300)]);
    expect(baja.labels[0].text).toBe("-45.0°");
  });

  it("una horizontal da cero", () => {
    expect(build("TREND_ANGLE", [p(100, 200), p(300, 200)]).labels[0].text).toBe("+0.0°");
  });
});

describe("la línea informativa", () => {
  it("dice el movimiento, el porcentaje y las velas", () => {
    const shape = buildConTiempo(
      "INFO_LINE",
      [p(100, 300), p(300, 100)],
      [1000, 4600],
      3600,
      {},
      [68000, 69360],
    );
    const texto = shape.labels[0].text;
    expect(texto).toContain("+1360.00");
    expect(texto).toContain("2.00%");
    expect(texto).toContain("1 vela");
  });

  it("cuenta las velas por el tiempo real, no por los píxeles", () => {
    // El eje de tiempo no es lineal en píxeles: un fin de semana no ocupa
    // sitio. Contar por píxeles daría menos velas de las que hubo.
    const shape = buildConTiempo(
      "INFO_LINE",
      [p(100, 300), p(110, 100)],
      [0, 3600 * 24],
      3600,
      {},
      [68000, 69000],
    );
    expect(shape.labels[0].text).toContain("24 velas");
  });
});

describe("el rango de fechas", () => {
  it("dice cuántas velas y cuánto tiempo", () => {
    const shape = buildConTiempo("DATE_RANGE", [p(100, 100), p(300, 200)], [0, 7200], 3600);
    expect(shape.labels[0].text).toContain("2 velas");
    expect(shape.labels[0].text).toContain("2.0 h");
  });

  it("sin tiempos no inventa una duración", () => {
    expect(build("DATE_RANGE", [p(100, 100), p(300, 200)]).labels).toHaveLength(0);
  });
});

describe("el abanico de Fibonacci", () => {
  it("saca un rayo por nivel, más la base", () => {
    const shape = build("FIB_FAN", [p(100, 300), p(300, 100)], { levels: [0.382, 0.5, 0.618] });
    expect(shape.segments).toHaveLength(4);
  });

  it("los rayos salen todos del primer punto", () => {
    const shape = build("FIB_FAN", [p(100, 300), p(300, 100)], { levels: [0.5] });
    // El segundo segmento es el rayo; el primero es la base a-b.
    expect(shape.segments[1].from).toEqual(p(100, 300));
  });

  it("el del 50% pasa por el medio de la vertical del segundo punto", () => {
    const shape = build("FIB_FAN", [p(100, 300), p(300, 100)], {
      levels: [0.5],
      showLabels: false,
    });
    const rayo = shape.segments[1];
    const t = (300 - rayo.from.x) / (rayo.to.x - rayo.from.x);
    expect(rayo.from.y + (rayo.to.y - rayo.from.y) * t).toBeCloseTo(200, 6);
  });
});

describe("las zonas horarias de Fibonacci", () => {
  it("las verticales caen en la sucesión, no a intervalos iguales", () => {
    const shape = build("FIB_TIMEZONE", [p(100, 200), p(120, 200)], { showLabels: false });
    expect(shape.segments.map((s) => s.from.x)).toEqual([
      100, 120, 140, 160, 200, 260, 360, 520, 780,
    ]);
  });

  it("lo que se sale del lienzo no se pinta", () => {
    const shape = build("FIB_TIMEZONE", [p(700, 200), p(760, 200)]);
    // 700 y 760 caben; 820 ya no.
    expect(shape.segments.every((s) => s.from.x <= 800)).toBe(true);
  });

  it("dos puntos en la misma vertical no dan nada", () => {
    // Sin unidad de tiempo no hay zonas que repartir; dividir daría infinitos.
    expect(build("FIB_TIMEZONE", [p(100, 200), p(100, 300)]).segments).toHaveLength(0);
  });
});

describe("el abanico de Gann", () => {
  it("el 1×1 pasa por el segundo punto", () => {
    const shape = build("GANN_FAN", [p(100, 300), p(300, 100)], { levels: [1] });
    const rayo = shape.segments[0];
    const t = (300 - rayo.from.x) / (rayo.to.x - rayo.from.x);
    expect(rayo.from.y + (rayo.to.y - rayo.from.y) * t).toBeCloseTo(100, 6);
  });

  it("nombra los ángulos como se nombran en Gann", () => {
    const shape = build("GANN_FAN", [p(100, 300), p(300, 100)], { levels: [0.5, 1, 2] });
    expect(shape.labels.map((l) => l.text)).toEqual(["1×2", "1×1", "2×1"]);
  });

  it("un tercio se dice 1×3, no 1×3.00", () => {
    const shape = build("GANN_FAN", [p(100, 300), p(300, 100)], { levels: [0.333] });
    expect(shape.labels[0].text).toBe("1×3");
  });
});

describe("los círculos de Fibonacci", () => {
  it("un anillo por nivel, centrados en el primer punto", () => {
    const shape = build("FIB_CIRCLE", [p(200, 200), p(300, 250)], { levels: [0.5, 1] });
    expect(shape.ellipses).toHaveLength(2);
    expect(shape.ellipses.every((e) => e.center.x === 200 && e.center.y === 200)).toBe(true);
    expect(shape.ellipses[0].rx).toBeCloseTo(50, 6);
    expect(shape.ellipses[1].rx).toBeCloseTo(100, 6);
  });

  it("sólo se rellena el mayor, para no tapar el centro", () => {
    const shape = build("FIB_CIRCLE", [p(200, 200), p(300, 250)], {
      levels: [0.5, 1],
      fill: true,
    });
    expect(shape.ellipses.map((e) => e.filled)).toEqual([false, true]);
  });
});

describe("el canal de Fibonacci", () => {
  it("el 0% pasa por la base y el 100% por el tercer punto", () => {
    const shape = build("FIB_CHANNEL", [p(100, 200), p(300, 200), p(100, 260)], {
      levels: [0, 1],
      extendRight: false,
      extendLeft: false,
      showLabels: false,
    });
    expect(shape.segments[0].from.y).toBeCloseTo(200, 6);
    expect(shape.segments[1].from.y).toBeCloseTo(260, 6);
  });

  it("el desplazamiento es vertical, no perpendicular", () => {
    // El eje vertical es el precio: un desplazamiento perpendicular mezclaría
    // precio con tiempo y el canal dejaría de cubrir un rango constante.
    const shape = build("FIB_CHANNEL", [p(100, 100), p(300, 300), p(100, 150)], {
      levels: [1],
      extendRight: false,
      extendLeft: false,
      showLabels: false,
    });
    expect(shape.segments[0].from.x).toBeCloseTo(100, 6);
    expect(shape.segments[0].from.y).toBeCloseTo(150, 6);
  });
});

describe("el rectángulo rotado", () => {
  it("los dos lados largos son paralelos", () => {
    const shape = build("ROTATED_RECTANGLE", [p(100, 100), p(300, 200), p(100, 160)]);
    const [a, b, c, d] = shape.polygons[0].points;
    expect(b.y - a.y).toBeCloseTo(c.y - d.y, 6);
    expect(b.x - a.x).toBeCloseTo(c.x - d.x, 6);
  });

  it("el grosor lo da el tercer punto", () => {
    const shape = build("ROTATED_RECTANGLE", [p(100, 100), p(300, 100), p(200, 180)]);
    const pts = shape.polygons[0].points;
    expect(pts[3].y - pts[0].y).toBeCloseTo(80, 6);
  });
});

describe("la polilínea y la curva", () => {
  it("la polilínea se cierra sobre sí misma", () => {
    const puntos = [p(100, 100), p(200, 80), p(300, 140), p(250, 220), p(120, 200)];
    expect(build("POLYLINE", puntos).polygons[0].points).toHaveLength(5);
  });

  it("la curva se aproxima por tramos para poder rellenarse", () => {
    const shape = build("CURVE", [p(100, 300), p(300, 300), p(200, 100)]);
    expect(shape.polygons[0].points.length).toBeGreaterThan(20);
    // Empieza y acaba donde se pinchó.
    expect(shape.polygons[0].points[0]).toEqual(p(100, 300));
    expect(shape.polygons[0].points.at(-1)).toEqual(p(300, 300));
  });
});

describe("los patrones nuevos", () => {
  const cinco = [p(100, 300), p(160, 150), p(220, 240), p(280, 120), p(340, 260)];

  it("el Cypher etiqueta como el XABCD", () => {
    expect(build("CYPHER", cinco).labels.slice(0, 5).map((l) => l.text)).toEqual([
      "X",
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("el Cypher marca si cada tramo cae donde el patrón pide", () => {
    // Es lo único que lo separa del XABCD: la forma es la misma, cambia dónde
    // tienen que caer los tramos.
    const shape = build("CYPHER", cinco, {}, [100, 200, 150, 280, 190]);
    const proporciones = shape.labels.slice(5).map((l) => l.text);
    expect(proporciones).toHaveLength(3);
    expect(proporciones[0]).toContain("✓"); // 50/100 = 0,5, dentro de 0,382-0,618
    expect(proporciones[1]).toContain("✗"); // 130/50 = 2,6, fuera de 1,13-1,414
    expect(proporciones[2]).toContain("✓"); // 90/130 = 0,692, dentro de 0,618-0,786
  });

  it("un XABCD con los mismos puntos no lleva veredicto", () => {
    // Es lo que justifica que sean dos herramientas: el XABCD sólo mide, el
    // Cypher además dice si el patrón se cumple.
    const shape = build("XABCD", cinco, {}, [100, 200, 150, 280, 190]);
    const proporciones = shape.labels.slice(5).map((l) => l.text);
    expect(proporciones.some((t) => t.includes("✓") || t.includes("✗"))).toBe(false);
  });

  it("el ABCD lleva cuatro letras y tres proporciones", () => {
    const cuatro = [p(100, 300), p(180, 150), p(260, 220), p(340, 100)];
    const shape = build("ABCD", cuatro, {}, [100, 200, 160, 260]);
    expect(shape.labels.slice(0, 4).map((l) => l.text)).toEqual(["A", "B", "C", "D"]);
    expect(shape.labels.slice(4)).toHaveLength(2);
  });

  it("los tres impulsos usan siete puntos", () => {
    const siete = Array.from({ length: 7 }, (_, i) => p(100 + i * 40, 300 - i * 20));
    expect(build("THREE_DRIVES", siete).labels.map((l) => l.text)).toEqual([
      "0",
      "1",
      "A",
      "2",
      "B",
      "3",
      "C",
    ]);
  });

  it("el patrón triangular se rellena entero, no en zigzag", () => {
    const cuatro = [p(100, 100), p(300, 200), p(120, 260), p(300, 210)];
    const shape = build("TRIANGLE_PATTERN", cuatro, { fill: true });
    expect(shape.polygons).toHaveLength(1);
    expect(shape.polygons[0].points).toHaveLength(4);
  });
});

describe("las anotaciones", () => {
  it("el texto vacío deja una marca en vez de nada", () => {
    // Un dibujo recién puesto que no pinta nada parece que no se guardó.
    expect(build("TEXT", [p(200, 200)]).labels[0].text).toBe("Texto…");
    expect(build("TEXT", [p(200, 200)], { textLabel: "doble suelo" }).labels[0].text).toBe(
      "doble suelo",
    );
  });

  it("la etiqueta de precio dice el precio de su punto", () => {
    const shape = build("PRICE_LABEL", [p(200, 200)], {}, [68123.5]);
    expect(shape.labels[0].text).toContain("68123.50");
    expect(shape.polygons).toHaveLength(1);
  });

  it("la llamada apunta del recuadro a lo que comenta", () => {
    const shape = build("CALLOUT", [p(100, 100), p(300, 250)], { textLabel: "aquí" });
    // El primer segmento va de la caja al objetivo, no al revés.
    expect(shape.segments[0].from).toEqual(p(300, 250));
    expect(shape.segments[0].to).toEqual(p(100, 100));
    expect(shape.labels[0].text).toBe("aquí");
  });

  it("el recuadro crece con el texto y con el cuerpo de letra", () => {
    const corto = build("NOTE", [p(200, 200)], { textLabel: "hm", fontSize: 11 });
    const largo = build("NOTE", [p(200, 200)], { textLabel: "una nota bastante más larga", fontSize: 11 });
    const grande = build("NOTE", [p(200, 200)], { textLabel: "hm", fontSize: 20 });

    const ancho = (s: ReturnType<typeof build>) =>
      s.polygons[0].points[1].x - s.polygons[0].points[0].x;
    expect(ancho(largo)).toBeGreaterThan(ancho(corto));
    expect(ancho(grande)).toBeGreaterThan(ancho(corto));
  });

  it("el banderín se clava en su punto y sube desde ahí", () => {
    const shape = build("FLAG", [p(200, 300)]);
    expect(shape.segments[0].from).toEqual(p(200, 300));
    expect(shape.segments[0].to.y).toBeLessThan(300);
    expect(shape.polygons).toHaveLength(1);
  });
});

describe("el rango de precio", () => {
  it("mide sólo el precio, con su porcentaje", () => {
    const shape = build("PRICE_RANGE", [p(100, 300), p(300, 100)], {}, [68000, 69360]);
    expect(shape.labels[0].text).toContain("+1360.00");
    expect(shape.labels[0].text).toContain("2.00%");
  });

  it("lleva flecha en los dos extremos", () => {
    const shape = build("PRICE_RANGE", [p(100, 300), p(300, 100)]);
    // Un tramo central más dos puntas de dos segmentos cada una.
    expect(shape.segments).toHaveLength(5);
  });
});
