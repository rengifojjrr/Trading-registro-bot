import { Decimal } from "decimal.js";

import type { DrawingStyle } from "./style";
import { WAVE_DEGREES } from "./style";
import type { ToolId } from "./tools";

/**
 * De los puntos que se pincharon a los segmentos que hay que pintar.
 *
 * Separado del canvas a propósito: aquí está la parte que puede estar mal
 * -- dónde cae la mediana de una horquilla, qué proporción hay entre dos
 * tramos de un XABCD, cuántos contratos salen de un riesgo -- y esa parte se
 * puede probar sin montar un navegador. El canvas se queda con lo que no
 * tiene decisiones: mover el lápiz.
 *
 * Todo en coordenadas de pantalla ya convertidas, salvo lo que necesita el
 * precio de verdad para calcular (las posiciones), que lo recibe aparte.
 *
 * Puro.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  from: Point;
  to: Point;
  /** Para poder pintar una parte del dibujo distinta del resto. */
  emphasis?: "PRIMARY" | "SECONDARY";
}

export interface Label {
  at: Point;
  text: string;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
}

export interface Polygon {
  points: Point[];
  /** Rellenar con el color de relleno, no sólo el borde. */
  filled: boolean;
}

export interface Shape {
  segments: Segment[];
  labels: Label[];
  polygons: Polygon[];
  /** Círculos y elipses, que no se pueden expresar como polígono sin perder suavidad. */
  ellipses: { center: Point; rx: number; ry: number; filled: boolean }[];
  /** Arcos cuadráticos: el punto de control es lo que los comba. */
  curves: { from: Point; control: Point; to: Point }[];
}

const vacio = (): Shape => ({ segments: [], labels: [], polygons: [], ellipses: [], curves: [] });

/**
 * Alarga un segmento hasta salirse del lienzo, por el lado que se pida.
 *
 * Se alarga por proporción y no a una x fija porque una línea casi vertical
 * necesita mucho menos avance en x para salirse que una casi horizontal, y con
 * una x fija la vertical se quedaría corta.
 */
export function extendSegment(a: Point, b: Point, width: number, left: boolean, right: boolean): Segment {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longitud = Math.hypot(dx, dy);

  if (longitud === 0) return { from: a, to: b };

  // Con el ancho del lienzo basta y sobra: ninguna diagonal necesita más para
  // salirse por los dos lados.
  const factor = (width * 2) / longitud;
  const ux = dx * factor;
  const uy = dy * factor;

  return {
    from: left ? { x: a.x - ux, y: a.y - uy } : a,
    to: right ? { x: b.x + ux, y: b.y + uy } : b,
  };
}

export interface BuildParams {
  tool: ToolId;
  points: Point[];
  style: DrawingStyle;
  /** El lienzo, para saber hasta dónde alargar y dónde poner las etiquetas. */
  width: number;
  height: number;
  /**
   * Los precios reales de los puntos, en el mismo orden.
   *
   * Hacen falta para lo que calcula de verdad -- niveles de Fibonacci,
   * relación beneficio/riesgo -- porque en píxeles la escala puede ser
   * logarítmica y las proporciones no se conservan.
   */
  prices?: number[];
  /** Formatea un precio para las etiquetas. */
  formatPrice?: (price: number) => string;
}

/** Todo lo que hay que pintar de un dibujo. */
export function buildShape(params: BuildParams): Shape {
  const { tool, points } = params;
  if (points.length === 0) return vacio();

  switch (tool) {
    case "TRENDLINE":
    case "RAY":
    case "EXTENDED":
      return recta(params);
    case "HLINE":
    case "HRAY":
      return horizontal(params);
    case "VLINE":
      return vertical(params);
    case "CROSSLINE":
      return cruz(params);
    case "RECTANGLE":
      return rectangulo(params);
    case "ELLIPSE":
      return elipse(params);
    case "TRIANGLE":
      return triangulo(params);
    case "PARALLEL_CHANNEL":
      return canal(params);
    case "ARC":
      return arco(params);
    case "PATH":
    case "ELLIOTT":
    case "HEAD_SHOULDERS":
    case "XABCD":
      return poligonal(params);
    case "FIB":
      return fibonacci(params);
    case "FIB_EXTENSION":
      return fibExtension(params);
    case "PITCHFORK":
      return horquilla(params);
    case "GANN_BOX":
      return gann(params);
    case "LONG_POSITION":
    case "SHORT_POSITION":
      return posicion(params);
    case "DATE_PRICE_RANGE":
      return rango(params);
    case "FORECAST":
      return proyeccion(params);
    default:
      return vacio();
  }
}

// ---------------------------------------------------------------- líneas

function recta({ points, style, width }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();
  const shape = vacio();
  shape.segments.push(extendSegment(a, b, width, style.extendLeft, style.extendRight));
  if (style.textLabel) {
    shape.labels.push({ at: { x: b.x, y: b.y }, text: style.textLabel, align: "left" });
  }
  return shape;
}

function horizontal({ points, style, width }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();
  shape.segments.push({
    from: { x: style.extendLeft ? 0 : a.x, y: a.y },
    to: { x: width, y: a.y },
  });
  if (style.textLabel) {
    shape.labels.push({ at: { x: a.x + 6, y: a.y - 6 }, text: style.textLabel, align: "left" });
  }
  return shape;
}

function vertical({ points, style, height }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();
  shape.segments.push({ from: { x: a.x, y: 0 }, to: { x: a.x, y: height } });
  if (style.textLabel) {
    shape.labels.push({ at: { x: a.x + 6, y: 12 }, text: style.textLabel, align: "left" });
  }
  return shape;
}

function cruz({ points, width, height }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();
  shape.segments.push({ from: { x: 0, y: a.y }, to: { x: width, y: a.y } });
  shape.segments.push({ from: { x: a.x, y: 0 }, to: { x: a.x, y: height } });
  return shape;
}

// --------------------------------------------------------------- figuras

function rectangulo({ points, style }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();
  const shape = vacio();
  const esquinas = [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
  shape.polygons.push({ points: esquinas, filled: style.fill });
  if (style.textLabel) {
    shape.labels.push({
      at: { x: Math.min(a.x, b.x) + 6, y: Math.min(a.y, b.y) + 6 },
      text: style.textLabel,
      align: "left",
      baseline: "top",
    });
  }
  return shape;
}

function elipse({ points, style }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();
  const shape = vacio();
  shape.ellipses.push({
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2,
    filled: style.fill,
  });
  if (style.textLabel) {
    shape.labels.push({
      at: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 8 },
      text: style.textLabel,
      align: "center",
    });
  }
  return shape;
}

function triangulo({ points, style }: BuildParams): Shape {
  if (points.length < 3) return poligonalSimple(points);
  const shape = vacio();
  shape.polygons.push({ points: points.slice(0, 3), filled: style.fill });
  return shape;
}

/**
 * El canal paralelo.
 *
 * Los dos primeros puntos son la línea base; el tercero da la separación. La
 * paralela se desplaza sólo en vertical -- no perpendicularmente -- porque en
 * un gráfico de precio el eje vertical es el precio: una separación
 * perpendicular mezclaría precio con tiempo y el canal dejaría de significar
 * «este rango de precio se mueve así».
 */
function canal({ points, style, width }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return poligonalSimple(points);

  const shape = vacio();

  // Cuánto hay que subir o bajar la base para que pase por el tercer punto.
  const pendiente = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
  const yEnC = a.y + pendiente * (c.x - a.x);
  const desplazamiento = c.y - yEnC;

  const base = extendSegment(a, b, width, false, style.extendRight);
  const paralela = extendSegment(
    { x: a.x, y: a.y + desplazamiento },
    { x: b.x, y: b.y + desplazamiento },
    width,
    false,
    style.extendRight,
  );

  shape.segments.push(base, paralela);
  if (style.fill) {
    shape.polygons.push({
      points: [base.from, base.to, paralela.to, paralela.from],
      filled: true,
    });
  }
  return shape;
}

function arco({ points, style }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!b) return vacio();
  const shape = vacio();
  // Sin tercer punto la curva es una recta: el control cae en el medio.
  const control = c ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  shape.curves.push({ from: a, control, to: b });
  if (style.textLabel) {
    shape.labels.push({ at: control, text: style.textLabel, align: "center" });
  }
  return shape;
}

function poligonalSimple(points: Point[]): Shape {
  const shape = vacio();
  for (let i = 0; i < points.length - 1; i += 1) {
    shape.segments.push({ from: points[i], to: points[i + 1] });
  }
  return shape;
}

/**
 * Trazados con etiquetas: trazado libre, Elliott, XABCD y hombro-cabeza-hombro.
 *
 * Los tres últimos son el mismo dibujo con etiquetas distintas, así que
 * comparten código en vez de tener tres copias que se desincronizan.
 */
function poligonal({ tool, points, style, prices, formatPrice }: BuildParams): Shape {
  const shape = poligonalSimple(points);

  if (tool === "XABCD" && style.fill && points.length >= 4) {
    // Los dos triángulos que forman la «M» del patrón: es lo que hace que se
    // vea como una figura y no como cuatro rayas.
    shape.polygons.push({ points: points.slice(0, 3), filled: true });
    if (points.length >= 5) shape.polygons.push({ points: points.slice(2, 5), filled: true });
  }

  if (!style.showLabels) return shape;

  const etiquetas = etiquetasDe(tool, style, points.length);
  points.forEach((p, i) => {
    const texto = etiquetas[i];
    if (!texto) return;
    shape.labels.push({ at: { x: p.x, y: p.y - 10 }, text: texto, align: "center" });
  });

  // Las proporciones entre tramos: es lo que se mira de un XABCD, y sin ellas
  // el patrón es un garabato con letras.
  if (tool === "XABCD" && prices && prices.length >= 4 && formatPrice) {
    const ratios = xabcdRatios(prices);
    ratios.forEach((r, i) => {
      const desde = points[i + 1];
      const hasta = points[i + 2];
      if (!desde || !hasta) return;
      shape.labels.push({
        at: { x: (desde.x + hasta.x) / 2, y: (desde.y + hasta.y) / 2 + 14 },
        text: r,
        align: "center",
      });
    });
  }

  return shape;
}

function etiquetasDe(tool: ToolId, style: DrawingStyle, n: number): string[] {
  if (tool === "ELLIOTT") return [...WAVE_DEGREES[style.waveDegree]].slice(0, n);
  if (tool === "XABCD") return ["X", "A", "B", "C", "D"].slice(0, n);
  if (tool === "HEAD_SHOULDERS") return ["HI", "V1", "C", "V2", "HD"].slice(0, n);
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

/**
 * Las proporciones entre tramos de un XABCD.
 *
 * Cada una es la longitud de un tramo dividida por la del anterior, que es
 * como se nombran los patrones armónicos: un Gartley pide 0,618 en XA→AB.
 */
export function xabcdRatios(prices: number[]): string[] {
  const salida: string[] = [];
  for (let i = 1; i < prices.length - 1; i += 1) {
    const anterior = new Decimal(prices[i]).minus(prices[i - 1]).abs();
    const actual = new Decimal(prices[i + 1]).minus(prices[i]).abs();
    salida.push(anterior.isZero() ? "--" : actual.dividedBy(anterior).toFixed(3));
  }
  return salida;
}

// ------------------------------------------------------------- Fibonacci

function fibonacci({ points, style, width, prices, formatPrice }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  const desdeX = style.extendRight ? Math.min(a.x, b.x) : Math.min(a.x, b.x);
  const hastaX = style.extendRight ? width : Math.max(a.x, b.x);

  for (const nivel of style.levels) {
    // En píxeles y no en precio: con escala logarítmica el punto medio en
    // píxeles no es el punto medio en precio, y lo que se mira es dónde cae la
    // raya sobre la vela.
    const y = a.y + (b.y - a.y) * nivel;
    shape.segments.push({
      from: { x: desdeX, y },
      to: { x: hastaX, y },
      emphasis: nivel === 0 || nivel === 1 ? "PRIMARY" : "SECONDARY",
    });

    if (!style.showLabels) continue;

    const precio =
      prices && prices.length >= 2 ? prices[0] + (prices[1] - prices[0]) * nivel : null;
    const porcentaje = `${(nivel * 100).toFixed(1).replace(/\.0$/, "")}%`;
    shape.labels.push({
      at: { x: desdeX + 4, y: y - 4 },
      text:
        style.showPrice && precio !== null && formatPrice
          ? `${porcentaje}  ${formatPrice(precio)}`
          : porcentaje,
      align: "left",
    });
  }

  shape.segments.push({ from: a, to: b, emphasis: "SECONDARY" });
  return shape;
}

/**
 * La extensión: tres puntos.
 *
 * El movimiento se mide entre el primero y el segundo, y se proyecta desde el
 * tercero. Es la diferencia con el retroceso, que proyecta sobre sí mismo.
 */
function fibExtension({ points, style, width, prices, formatPrice }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return poligonalSimple(points);

  const shape = poligonalSimple(points);
  const alto = b.y - a.y;

  for (const nivel of style.levels) {
    const y = c.y + alto * nivel;
    shape.segments.push({
      from: { x: Math.min(a.x, c.x), y },
      to: { x: width, y },
      emphasis: nivel === 1 || nivel === 1.618 ? "PRIMARY" : "SECONDARY",
    });

    if (!style.showLabels) continue;

    const precio =
      prices && prices.length >= 3 ? prices[2] + (prices[1] - prices[0]) * nivel : null;
    const porcentaje = `${(nivel * 100).toFixed(1).replace(/\.0$/, "")}%`;
    shape.labels.push({
      at: { x: Math.min(a.x, c.x) + 4, y: y - 4 },
      text:
        style.showPrice && precio !== null && formatPrice
          ? `${porcentaje}  ${formatPrice(precio)}`
          : porcentaje,
      align: "left",
    });
  }

  return shape;
}

/**
 * La horquilla de Andrews.
 *
 * La mediana sale del primer punto y pasa por el medio de los otros dos; las
 * dos ramas salen de esos dos puntos, paralelas a la mediana. Es la
 * construcción original, no una aproximación.
 */
function horquilla({ points, style, width }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return poligonalSimple(points);

  const shape = vacio();
  const medio = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };

  const mediana = extendSegment(a, medio, width, false, true);
  const dx = medio.x - a.x;
  const dy = medio.y - a.y;

  const ramaB = extendSegment(b, { x: b.x + dx, y: b.y + dy }, width, false, true);
  const ramaC = extendSegment(c, { x: c.x + dx, y: c.y + dy }, width, false, true);

  shape.segments.push({ ...mediana, emphasis: "PRIMARY" }, ramaB, ramaC);
  // El tramo que une los dos puntos de partida, para que se vea la boca.
  shape.segments.push({ from: b, to: c, emphasis: "SECONDARY" });

  if (style.fill) {
    shape.polygons.push({
      points: [ramaB.from, ramaB.to, ramaC.to, ramaC.from],
      filled: true,
    });
  }

  return shape;
}

/** La caja de Gann: la misma rejilla en precio y en tiempo. */
function gann({ points, style }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);

  for (const nivel of style.levels) {
    const y = y0 + (y1 - y0) * nivel;
    const x = x0 + (x1 - x0) * nivel;
    shape.segments.push({ from: { x: x0, y }, to: { x: x1, y }, emphasis: "SECONDARY" });
    shape.segments.push({ from: { x, y: y0 }, to: { x, y: y1 }, emphasis: "SECONDARY" });

    if (style.showLabels) {
      shape.labels.push({
        at: { x: x0 + 4, y: y - 4 },
        text: `${(nivel * 100).toFixed(0)}%`,
        align: "left",
      });
    }
  }

  // Las dos diagonales, que son de lo que trata una caja de Gann.
  shape.segments.push({ from: { x: x0, y: y1 }, to: { x: x1, y: y0 }, emphasis: "PRIMARY" });
  shape.segments.push({ from: { x: x0, y: y0 }, to: { x: x1, y: y1 }, emphasis: "PRIMARY" });

  return shape;
}

// -------------------------------------------------------------- posición

/**
 * La posición larga o corta: entrada, stop y objetivo.
 *
 * Es la herramienta que más conecta con el resto de la aplicación: los mismos
 * tres números que el diario guarda por operación. Enseña la relación
 * beneficio/riesgo y, si se le dice cuánto capital y cuánto riesgo se acepta,
 * cuántos contratos salen.
 */
function posicion({ points, style, width, prices, formatPrice }: BuildParams): Shape {
  const [entrada, stop, objetivo] = points;
  if (!objetivo) return poligonalSimple(points);

  const shape = vacio();
  const x0 = entrada.x;
  const x1 = Math.max(entrada.x + 40, width * 0.6);

  // Dos zonas: la del riesgo y la del beneficio. Se pintan aunque `fill` esté
  // apagado porque son la herramienta, no un adorno.
  shape.polygons.push({
    points: [
      { x: x0, y: entrada.y },
      { x: x1, y: entrada.y },
      { x: x1, y: stop.y },
      { x: x0, y: stop.y },
    ],
    filled: true,
  });
  shape.polygons.push({
    points: [
      { x: x0, y: entrada.y },
      { x: x1, y: entrada.y },
      { x: x1, y: objetivo.y },
      { x: x0, y: objetivo.y },
    ],
    filled: true,
  });

  for (const [punto, etiqueta] of [
    [entrada, "Entrada"],
    [stop, "Stop"],
    [objetivo, "Objetivo"],
  ] as const) {
    shape.segments.push({
      from: { x: x0, y: punto.y },
      to: { x: x1, y: punto.y },
      emphasis: etiqueta === "Entrada" ? "PRIMARY" : "SECONDARY",
    });
  }

  if (!style.showPrice && !style.riskReward) return shape;

  const calculo = prices && prices.length >= 3 ? positionMath(prices[0], prices[1], prices[2], style) : null;

  const lineas: [Point, string][] = [];
  if (style.showPrice && prices && formatPrice) {
    lineas.push([entrada, `Entrada ${formatPrice(prices[0])}`]);
    lineas.push([stop, `Stop ${formatPrice(prices[1])}`]);
    lineas.push([objetivo, `Objetivo ${formatPrice(prices[2])}`]);
  }
  for (const [punto, texto] of lineas) {
    shape.labels.push({ at: { x: x0 + 6, y: punto.y - 5 }, text: texto, align: "left" });
  }

  if (style.riskReward && calculo) {
    shape.labels.push({
      at: { x: x1 - 6, y: entrada.y - 6 },
      text: calculo.summary,
      align: "right",
    });
  }

  return shape;
}

export interface PositionMath {
  /** Cuánto se arriesga por contrato. */
  risk: string;
  /** Cuánto se gana por contrato si llega al objetivo. */
  reward: string;
  /** Beneficio dividido entre riesgo. Null si el stop está en la entrada. */
  ratio: string | null;
  /** Contratos que salen del capital y el riesgo aceptado, si se dieron. */
  size: string | null;
  summary: string;
}

/**
 * Los números de una posición.
 *
 * En decimal y no en coma flotante, como todo el dinero de esta aplicación: un
 * ratio de 1,9999999 en vez de 2 se nota en cuanto se compara con un umbral.
 */
export function positionMath(
  entry: number,
  stop: number,
  target: number,
  style: DrawingStyle,
): PositionMath {
  const riesgo = new Decimal(entry).minus(stop).abs();
  const beneficio = new Decimal(target).minus(entry).abs();
  const ratio = riesgo.isZero() ? null : beneficio.dividedBy(riesgo);

  let size: string | null = null;
  if (style.accountSize !== null && style.riskPercent !== null && !riesgo.isZero()) {
    // Cuánto dinero se acepta perder, dividido entre lo que se pierde por
    // contrato. Sin redondear a entero: el tamaño de contrato depende del
    // producto, y redondear aquí sería decidir por el instrumento.
    const dinero = new Decimal(style.accountSize).times(style.riskPercent).dividedBy(100);
    size = dinero.dividedBy(riesgo).toFixed(2);
  }

  const partes = [ratio ? `R:R ${ratio.toFixed(2)}` : "R:R --"];
  if (size !== null) partes.push(`${size} contratos`);

  return {
    risk: riesgo.toFixed(2),
    reward: beneficio.toFixed(2),
    ratio: ratio ? ratio.toFixed(2) : null,
    size,
    summary: partes.join("  ·  "),
  };
}

// ---------------------------------------------------------------- medida

function rango({ points, style, prices, formatPrice }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = rectangulo({ points, style } as BuildParams);

  if (!style.showLabels || !prices || prices.length < 2 || !formatPrice) return shape;

  const delta = new Decimal(prices[1]).minus(prices[0]);
  const pct = prices[0] === 0 ? null : delta.dividedBy(prices[0]).times(100);

  shape.labels.push({
    at: { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 8 },
    text: `${delta.isNegative() ? "" : "+"}${formatPrice(delta.toNumber())}${
      pct ? `  (${pct.toFixed(2)}%)` : ""
    }`,
    align: "center",
  });

  return shape;
}

/**
 * La proyección: de dónde viene, dónde está y a dónde se cree que va.
 *
 * El tercer punto es la previsión, y se dibuja con una flecha para que se
 * distinga de los dos primeros, que son hechos.
 */
function proyeccion({ points, style, prices, formatPrice }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!b) return vacio();

  const shape = vacio();
  shape.segments.push({ from: a, to: b, emphasis: "PRIMARY" });

  if (!c) return shape;

  shape.segments.push({ from: b, to: c, emphasis: "SECONDARY" });

  // La punta de flecha, como dos segmentos: no hace falta un polígono para
  // algo que se ve a doce píxeles.
  const angulo = Math.atan2(c.y - b.y, c.x - b.x);
  const largo = 10;
  for (const giro of [Math.PI * 0.85, -Math.PI * 0.85]) {
    shape.segments.push({
      from: c,
      to: { x: c.x + largo * Math.cos(angulo + giro), y: c.y + largo * Math.sin(angulo + giro) },
      emphasis: "SECONDARY",
    });
  }

  if (style.fill) {
    shape.polygons.push({ points: [a, b, c], filled: true });
  }

  if (style.showPrice && prices && prices.length >= 3 && formatPrice) {
    const delta = new Decimal(prices[2]).minus(prices[1]);
    shape.labels.push({
      at: { x: c.x + 6, y: c.y - 6 },
      text: `${delta.isNegative() ? "" : "+"}${formatPrice(delta.toNumber())}`,
      align: "left",
    });
  }

  return shape;
}
