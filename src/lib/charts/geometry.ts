import { Decimal } from "decimal.js";

import type { DrawingStyle } from "./style";
import { REWARD_FILL, RISK_FILL, WAVE_DEGREES, zoneFill } from "./style";
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
  /**
   * Un relleno propio, distinto del color del dibujo.
   *
   * Lo usa la posición, cuyas dos zonas tienen que ser rojo y verde aunque la
   * herramienta sea de otro color: si comparten color no se ve dónde acaba el
   * riesgo y empieza el beneficio, que es lo único que la herramienta enseña.
   */
  fillColor?: string;
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
  /**
   * Los momentos reales de los puntos, en segundos unix y en el mismo orden.
   *
   * Los usan las herramientas que miden tiempo -- la línea informativa, el
   * rango de fechas -- porque en píxeles el eje de tiempo no es lineal: las
   * velas que no existen (fin de semana, hueco de datos) no ocupan sitio.
   */
  times?: number[];
  /** Cuántos segundos dura una vela, para contar velas en vez de segundos. */
  barSeconds?: number;
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
    case "TREND_ANGLE":
      return anguloDeTendencia(params);
    case "INFO_LINE":
      return lineaInformativa(params);
    case "ARROW":
      return flecha(params);
    case "RECTANGLE":
      return rectangulo(params);
    case "ROTATED_RECTANGLE":
      return rectanguloRotado(params);
    case "ELLIPSE":
      return elipse(params);
    case "TRIANGLE":
      return triangulo(params);
    case "PARALLEL_CHANNEL":
      return canal(params);
    case "ARC":
      return arco(params);
    case "CURVE":
      return curva(params);
    case "POLYLINE":
      return polilinea(params);
    case "PATH":
    case "ELLIOTT":
    case "HEAD_SHOULDERS":
    case "XABCD":
    case "CYPHER":
    case "ABCD":
    case "TRIANGLE_PATTERN":
    case "THREE_DRIVES":
      return poligonal(params);
    case "FIB":
      return fibonacci(params);
    case "FIB_EXTENSION":
      return fibExtension(params);
    case "FIB_FAN":
      return abanicoFibonacci(params);
    case "FIB_TIMEZONE":
      return zonasHorarias(params);
    case "FIB_CHANNEL":
      return canalFibonacci(params);
    case "FIB_CIRCLE":
      return circulosFibonacci(params);
    case "PITCHFORK":
      return horquilla(params);
    case "GANN_BOX":
      return gann(params);
    case "GANN_FAN":
      return abanicoGann(params);
    case "LONG_POSITION":
    case "SHORT_POSITION":
      return posicion(params);
    case "DATE_PRICE_RANGE":
      return rango(params);
    case "PRICE_RANGE":
      return rangoDePrecio(params);
    case "DATE_RANGE":
      return rangoDeFechas(params);
    case "FORECAST":
      return proyeccion(params);
    case "TEXT":
      return texto(params);
    case "NOTE":
    case "PRICE_LABEL":
      return notaEnmarcada(params);
    case "CALLOUT":
      return llamada(params);
    case "FLAG":
      return banderin(params);
    default:
      return vacio();
  }
}

/**
 * La punta de flecha, como dos segmentos.
 *
 * Sale aquí fuera porque la usan la proyección, la flecha y los rangos, y
 * tenerla tres veces era garantizar que una de ellas apuntase al revés.
 */
function puntaDeFlecha(desde: Point, hasta: Point, largo = 9): Segment[] {
  const angulo = Math.atan2(hasta.y - desde.y, hasta.x - desde.x);
  return [Math.PI * 0.85, -Math.PI * 0.85].map((giro) => ({
    from: hasta,
    to: {
      x: hasta.x + largo * Math.cos(angulo + giro),
      y: hasta.y + largo * Math.sin(angulo + giro),
    },
    emphasis: "SECONDARY" as const,
  }));
}

/** Un recuadro alrededor de un texto, para que se lea sobre las velas. */
function recuadroDeTexto(centro: Point, texto: string, style: DrawingStyle): Polygon {
  // El ancho se estima por el número de caracteres: medir de verdad exige un
  // canvas, y esto es geometría pura. Con monoespaciada la estimación es buena.
  const ancho = Math.max(24, texto.length * style.fontSize * 0.62) + 10;
  const alto = style.fontSize + 8;
  return {
    points: [
      { x: centro.x - ancho / 2, y: centro.y - alto / 2 },
      { x: centro.x + ancho / 2, y: centro.y - alto / 2 },
      { x: centro.x + ancho / 2, y: centro.y + alto / 2 },
      { x: centro.x - ancho / 2, y: centro.y + alto / 2 },
    ],
    filled: style.fill,
  };
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

/**
 * El ángulo de tendencia: la línea y con cuántos grados sube.
 *
 * El ángulo se mide en píxeles, no en precio partido por tiempo, y es lo
 * correcto: el ángulo que se ve depende del zoom, y lo que interesa es lo que
 * se ve. Un ángulo «real» en unidades de precio/segundo no significaría nada,
 * porque precio y tiempo no comparten unidad.
 */
function anguloDeTendencia({ points, style, width }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  shape.segments.push(extendSegment(a, b, width, style.extendLeft, style.extendRight));
  // La horizontal de referencia, que es contra lo que se mide el ángulo.
  const radio = Math.min(48, Math.max(20, Math.hypot(b.x - a.x, b.y - a.y) / 3));
  shape.segments.push({
    from: a,
    to: { x: a.x + radio, y: a.y },
    emphasis: "SECONDARY",
  });

  if (!style.showLabels) return shape;

  // Negativo en pantalla es hacia arriba, que para quien mira es subir.
  const grados = (Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI;
  shape.labels.push({
    at: { x: a.x + radio + 6, y: a.y - 4 },
    text: `${grados >= 0 ? "+" : ""}${grados.toFixed(1)}°`,
    align: "left",
  });
  return shape;
}

/** La línea que dice cuánto se movió el precio y en cuántas velas. */
function lineaInformativa({
  points,
  style,
  prices,
  times,
  barSeconds,
  formatPrice,
}: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  shape.segments.push({ from: a, to: b });
  shape.segments.push(...puntaDeFlecha(a, b));

  if (!style.showLabels) return shape;

  const partes: string[] = [];
  if (style.showPrice && prices && prices.length >= 2 && formatPrice) {
    const delta = new Decimal(prices[1]).minus(prices[0]);
    partes.push(`${delta.isNegative() ? "" : "+"}${formatPrice(delta.toNumber())}`);
    if (prices[0] !== 0) {
      partes.push(`${delta.dividedBy(prices[0]).times(100).toFixed(2)}%`);
    }
  }
  if (barSeconds && barSeconds > 0 && times && times.length >= 2) {
    const velas = Math.round(Math.abs(times[1] - times[0]) / barSeconds);
    partes.push(`${velas} ${velas === 1 ? "vela" : "velas"}`);
  }
  if (partes.length === 0) return shape;

  shape.labels.push({
    at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 },
    text: partes.join("  ·  "),
    align: "center",
  });
  return shape;
}

/** Una flecha que señala algo. El texto va donde acaba la punta. */
function flecha({ points, style }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  shape.segments.push({ from: a, to: b });
  shape.segments.push(...puntaDeFlecha(a, b, 12));
  if (style.textLabel) {
    shape.labels.push({ at: { x: a.x, y: a.y - 8 }, text: style.textLabel, align: "center" });
  }
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

/**
 * El rectángulo rotado: una zona que sigue la pendiente.
 *
 * Como el canal, el grosor se toma en vertical y no en perpendicular, porque el
 * eje vertical es el precio: un grosor perpendicular mezclaría precio y tiempo
 * y la zona dejaría de cubrir un rango de precio constante.
 */
function rectanguloRotado({ points, style }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return poligonalSimple(points);

  const pendiente = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
  const desplazamiento = c.y - (a.y + pendiente * (c.x - a.x));

  const shape = vacio();
  shape.polygons.push({
    points: [
      a,
      b,
      { x: b.x, y: b.y + desplazamiento },
      { x: a.x, y: a.y + desplazamiento },
    ],
    filled: style.fill,
  });
  if (style.textLabel) {
    shape.labels.push({
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + desplazamiento / 2 },
      text: style.textLabel,
      align: "center",
      baseline: "middle",
    });
  }
  return shape;
}

/**
 * La curva cerrada: el arco más la cuerda, rellenable.
 *
 * Se aproxima la parábola por tramos para poder rellenarla; el arco suelto no
 * lo necesita porque no se rellena nunca.
 */
function curva({ points, style }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return arco({ points, style } as BuildParams);

  const shape = vacio();
  const muestras: Point[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    muestras.push({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
    });
  }
  shape.polygons.push({ points: muestras, filled: style.fill });
  if (style.textLabel) {
    shape.labels.push({ at: c, text: style.textLabel, align: "center" });
  }
  return shape;
}

/** La polilínea: los puntos que se pincharon, cerrados sobre sí mismos. */
function polilinea({ points, style }: BuildParams): Shape {
  if (points.length < 3) return poligonalSimple(points);
  const shape = vacio();
  shape.polygons.push({ points, filled: style.fill });
  if (style.textLabel) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    shape.labels.push({
      at: { x: cx, y: cy },
      text: style.textLabel,
      align: "center",
      baseline: "middle",
    });
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

  if (RELLENAN_EN_ZIGZAG.has(tool) && style.fill && points.length >= 4) {
    // Los triángulos que forman el zigzag del patrón: es lo que hace que se
    // vea como una figura y no como cuatro rayas.
    for (let i = 0; i + 2 < points.length; i += 2) {
      shape.polygons.push({ points: points.slice(i, i + 3), filled: true });
    }
  }
  if (tool === "TRIANGLE_PATTERN" && style.fill && points.length >= 3) {
    shape.polygons.push({ points, filled: true });
  }

  if (!style.showLabels) return shape;

  const etiquetas = etiquetasDe(tool, style, points.length);
  points.forEach((p, i) => {
    const texto = etiquetas[i];
    if (!texto) return;
    shape.labels.push({ at: { x: p.x, y: p.y - 10 }, text: texto, align: "center" });
  });

  // Las proporciones entre tramos: es lo que se mira de un patrón armónico, y
  // sin ellas es un garabato con letras.
  if (CON_PROPORCIONES.has(tool) && prices && prices.length >= 3 && formatPrice) {
    const ratios = tool === "CYPHER" ? cypherRatios(prices) : xabcdRatios(prices);
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

/** Los patrones que se rellenan como una «M»: triángulos alternos. */
const RELLENAN_EN_ZIGZAG = new Set<ToolId>(["XABCD", "CYPHER", "ABCD", "THREE_DRIVES"]);
/** Los que enseñan la proporción de cada tramo respecto al anterior. */
const CON_PROPORCIONES = new Set<ToolId>(["XABCD", "CYPHER", "ABCD"]);

function etiquetasDe(tool: ToolId, style: DrawingStyle, n: number): string[] {
  if (tool === "ELLIOTT") return [...WAVE_DEGREES[style.waveDegree]].slice(0, n);
  if (tool === "XABCD" || tool === "CYPHER") return ["X", "A", "B", "C", "D"].slice(0, n);
  if (tool === "ABCD") return ["A", "B", "C", "D"].slice(0, n);
  if (tool === "HEAD_SHOULDERS") return ["HI", "V1", "C", "V2", "HD"].slice(0, n);
  if (tool === "THREE_DRIVES") return ["0", "1", "A", "2", "B", "3", "C"].slice(0, n);
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

/**
 * Las proporciones que pide un Cypher, tramo a tramo, con su veredicto.
 *
 * Es lo único que distingue al Cypher del XABCD: la forma es la misma y lo que
 * cambia es dónde tienen que caer los tramos. Sin esto serían dos nombres para
 * el mismo dibujo, que es exactamente lo que no hay que hacer.
 *
 * Los rangos son los canónicos: XA→AB entre 0,382 y 0,618; AB→BC entre 1,13 y
 * 1,414; BC→CD en 0,786 del tramo XC (aquí se comprueba contra el tramo
 * anterior, que es lo que se puede medir sin más datos).
 */
const CYPHER_RANGOS: [number, number][] = [
  [0.382, 0.618],
  [1.13, 1.414],
  [0.618, 0.786],
];

export function cypherRatios(prices: number[]): string[] {
  const salida: string[] = [];
  for (let i = 1; i < prices.length - 1; i += 1) {
    const anterior = new Decimal(prices[i]).minus(prices[i - 1]).abs();
    const actual = new Decimal(prices[i + 1]).minus(prices[i]).abs();
    if (anterior.isZero()) {
      salida.push("--");
      continue;
    }
    const ratio = actual.dividedBy(anterior);
    const rango = CYPHER_RANGOS[i - 1];
    // Un tick o una cruz al lado del número: el patrón se valida de un vistazo
    // en vez de tener que recordar los tres rangos de memoria.
    const marca = rango
      ? ratio.greaterThanOrEqualTo(rango[0]) && ratio.lessThanOrEqualTo(rango[1])
        ? " ✓"
        : " ✗"
      : "";
    salida.push(`${ratio.toFixed(3)}${marca}`);
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
 * El abanico de Fibonacci.
 *
 * Los rayos salen del primer punto y pasan por los niveles repartidos sobre la
 * vertical del segundo. Es lo que lo distingue del retroceso: en vez de rayas
 * horizontales a cada nivel, rectas que se abren con el tiempo.
 */
function abanicoFibonacci({ points, style, width }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  shape.segments.push({ from: a, to: b, emphasis: "SECONDARY" });

  for (const nivel of style.levels) {
    const destino = { x: b.x, y: a.y + (b.y - a.y) * nivel };
    const rayo = extendSegment(a, destino, width, false, true);
    shape.segments.push({ ...rayo, emphasis: nivel === 0.5 ? "PRIMARY" : "SECONDARY" });

    if (!style.showLabels) continue;
    shape.labels.push({
      at: { x: destino.x + 4, y: destino.y - 3 },
      text: `${(nivel * 100).toFixed(1).replace(/\.0$/, "")}%`,
      align: "left",
    });
  }
  return shape;
}

/**
 * Los primeros términos de Fibonacci, que son las verticales que se pintan.
 *
 * Se para en 89 porque a partir de ahí la siguiente vertical cae tan lejos que
 * ya no está en la pantalla en ninguna temporalidad razonable.
 */
const SUCESION_FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;

/** Las zonas horarias: verticales a 1, 2, 3, 5, 8… veces la unidad marcada. */
function zonasHorarias({ points, style, width, height }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const unidad = b.x - a.x;
  if (unidad === 0) return vacio();

  const shape = vacio();
  for (const n of SUCESION_FIBONACCI) {
    const x = a.x + unidad * n;
    // Fuera del lienzo no se pinta: alargar la lista hasta 89 sólo tiene
    // sentido si lo que se sale se descarta.
    if (x < 0 || x > width) continue;
    shape.segments.push({
      from: { x, y: 0 },
      to: { x, y: height },
      emphasis: n <= 1 ? "PRIMARY" : "SECONDARY",
    });
    if (style.showLabels) {
      shape.labels.push({ at: { x: x + 4, y: 12 }, text: String(n), align: "left" });
    }
  }
  return shape;
}

/**
 * El canal de Fibonacci: un canal con los niveles repartidos entre sus bordes.
 *
 * Como el canal normal, el desplazamiento es vertical, por el mismo motivo: el
 * eje vertical es el precio.
 */
function canalFibonacci({ points, style, width }: BuildParams): Shape {
  const [a, b, c] = points;
  if (!c) return poligonalSimple(points);

  const shape = vacio();
  const pendiente = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
  const ancho = c.y - (a.y + pendiente * (c.x - a.x));

  for (const nivel of style.levels) {
    const dy = ancho * nivel;
    const linea = extendSegment(
      { x: a.x, y: a.y + dy },
      { x: b.x, y: b.y + dy },
      width,
      style.extendLeft,
      style.extendRight,
    );
    shape.segments.push({
      ...linea,
      emphasis: nivel === 0 || nivel === 1 ? "PRIMARY" : "SECONDARY",
    });
    if (style.showLabels) {
      shape.labels.push({
        at: { x: linea.to.x - 4, y: linea.to.y - 4 },
        text: `${(nivel * 100).toFixed(1).replace(/\.0$/, "")}%`,
        align: "right",
      });
    }
  }
  return shape;
}

/** Anillos alrededor del primer punto, a cada nivel del radio marcado. */
function circulosFibonacci({ points, style }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  const rx = Math.abs(b.x - a.x);
  const ry = Math.abs(b.y - a.y);

  for (const nivel of style.levels) {
    if (nivel <= 0) continue;
    shape.ellipses.push({
      center: a,
      rx: rx * nivel,
      ry: ry * nivel,
      // Sólo el mayor se rellena: rellenar todos deja el centro opaco.
      filled: style.fill && nivel === Math.max(...style.levels),
    });
    if (style.showLabels) {
      shape.labels.push({
        at: { x: a.x, y: a.y - ry * nivel - 3 },
        text: `${(nivel * 100).toFixed(1).replace(/\.0$/, "")}%`,
        align: "center",
      });
    }
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

/**
 * El abanico de Gann.
 *
 * El segundo punto fija el 1×1 -- una unidad de precio por una de tiempo -- y
 * el resto de rayos son múltiplos suyos: 2×1 sube el doble de rápido, 1×2 la
 * mitad. Por eso los niveles se aplican a la *pendiente* y no a la altura, que
 * es lo que separa un abanico de Gann de un abanico de Fibonacci.
 */
function abanicoGann({ points, style, width }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0) return vacio();

  const shape = vacio();
  for (const factor of style.levels) {
    if (factor <= 0) continue;
    const destino = { x: b.x, y: a.y + dy * factor };
    const rayo = extendSegment(a, destino, width, false, true);
    shape.segments.push({ ...rayo, emphasis: factor === 1 ? "PRIMARY" : "SECONDARY" });

    if (!style.showLabels) continue;
    // Se nombra como se nombra en Gann: 1×1, 2×1, 1×2.
    const nombre = factor >= 1 ? `${redondeaGann(factor)}×1` : `1×${redondeaGann(1 / factor)}`;
    shape.labels.push({
      at: { x: destino.x + 4, y: destino.y - 3 },
      text: nombre,
      align: "left",
    });
  }
  return shape;
}

/** 0,333 es un tercio; sin esto la etiqueta diría «1×3.003003003». */
function redondeaGann(n: number): string {
  const cerca = Math.round(n);
  return Math.abs(n - cerca) < 0.02 ? String(cerca) : n.toFixed(2);
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
  // apagado porque son la herramienta, no un adorno, y cada una con su color
  // -- rojo el riesgo, verde el beneficio -- porque con un color común la
  // figura es un rectángulo liso en el que no se distingue una de otra.
  shape.polygons.push({
    points: [
      { x: x0, y: entrada.y },
      { x: x1, y: entrada.y },
      { x: x1, y: stop.y },
      { x: x0, y: stop.y },
    ],
    filled: true,
    fillColor: zoneFill(RISK_FILL, style.fillOpacity),
  });
  shape.polygons.push({
    points: [
      { x: x0, y: entrada.y },
      { x: x1, y: entrada.y },
      { x: x1, y: objetivo.y },
      { x: x0, y: objetivo.y },
    ],
    filled: true,
    fillColor: zoneFill(REWARD_FILL, style.fillOpacity),
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
    // Una línea por encima de todo lo demás, no junto a la entrada: ahí
    // chocaba con «Entrada 68000», que va en la misma línea, y en un gráfico
    // estrecho las dos quedaban ilegibles una encima de la otra. El margen es
    // el propio cuerpo de letra, así que sigue separado si se agranda.
    shape.labels.push({
      at: {
        x: x1 - 6,
        y: Math.min(entrada.y, stop.y, objetivo.y) - style.fontSize - 8,
      },
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
 * El rango de precio: sólo cuánto se movió, sin contar el tiempo.
 *
 * Se pinta como una banda que cruza el ancho que se marcó, con las dos flechas
 * verticales que dicen de dónde a dónde se mide.
 */
function rangoDePrecio({ points, style, prices, formatPrice }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const medio = (x0 + x1) / 2;

  shape.polygons.push({
    points: [
      { x: x0, y: a.y },
      { x: x1, y: a.y },
      { x: x1, y: b.y },
      { x: x0, y: b.y },
    ],
    filled: style.fill,
  });
  shape.segments.push({ from: { x: medio, y: a.y }, to: { x: medio, y: b.y } });
  shape.segments.push(...puntaDeFlecha({ x: medio, y: a.y }, { x: medio, y: b.y }));
  shape.segments.push(...puntaDeFlecha({ x: medio, y: b.y }, { x: medio, y: a.y }));

  if (!style.showLabels || !prices || prices.length < 2 || !formatPrice) return shape;

  const delta = new Decimal(prices[1]).minus(prices[0]);
  const pct = prices[0] === 0 ? null : delta.dividedBy(prices[0]).times(100);
  shape.labels.push({
    at: { x: medio + 6, y: (a.y + b.y) / 2 },
    text: `${delta.isNegative() ? "" : "+"}${formatPrice(delta.toNumber())}${
      pct ? `  (${pct.toFixed(2)}%)` : ""
    }`,
    align: "left",
    baseline: "middle",
  });
  return shape;
}

/** El rango de fechas: cuánto duró, en velas y en tiempo de reloj. */
function rangoDeFechas({ points, style, times, barSeconds }: BuildParams): Shape {
  const [a, b] = points;
  if (!b) return vacio();

  const shape = vacio();
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const medio = (y0 + y1) / 2;

  shape.polygons.push({
    points: [
      { x: a.x, y: y0 },
      { x: b.x, y: y0 },
      { x: b.x, y: y1 },
      { x: a.x, y: y1 },
    ],
    filled: style.fill,
  });
  shape.segments.push({ from: { x: a.x, y: medio }, to: { x: b.x, y: medio } });
  shape.segments.push(...puntaDeFlecha({ x: a.x, y: medio }, { x: b.x, y: medio }));
  shape.segments.push(...puntaDeFlecha({ x: b.x, y: medio }, { x: a.x, y: medio }));

  if (!style.showLabels || !times || times.length < 2) return shape;

  const segundos = Math.abs(times[1] - times[0]);
  const partes: string[] = [];
  if (barSeconds && barSeconds > 0) {
    const velas = Math.round(segundos / barSeconds);
    partes.push(`${velas} ${velas === 1 ? "vela" : "velas"}`);
  }
  partes.push(duracionLegible(segundos));

  shape.labels.push({
    at: { x: (a.x + b.x) / 2, y: medio - 6 },
    text: partes.join("  ·  "),
    align: "center",
  });
  return shape;
}

/** Una duración en segundos dicha como la diría una persona. */
export function duracionLegible(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const minutos = Math.round(s / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = s / 3600;
  if (horas < 48) return `${horas.toFixed(horas < 10 ? 1 : 0)} h`;
  return `${Math.round(horas / 24)} d`;
}

// ----------------------------------------------------------- anotaciones

/** Texto suelto sobre el gráfico. */
function texto({ points, style }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();
  // Sin texto todavía no hay nada que pintar, pero sí que marcar: si no, un
  // dibujo recién puesto parece que no se guardó.
  const contenido = style.textLabel || "Texto…";
  shape.labels.push({ at: a, text: contenido, align: "center", baseline: "middle" });
  return shape;
}

/** Nota y etiqueta de precio: el mismo recuadro, distinto contenido. */
function notaEnmarcada({ tool, points, style, prices, formatPrice }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();

  const contenido =
    tool === "PRICE_LABEL"
      ? [prices && formatPrice ? formatPrice(prices[0]) : null, style.textLabel]
          .filter(Boolean)
          .join("  ")
      : style.textLabel || "Nota…";

  shape.polygons.push(recuadroDeTexto(a, contenido, style));
  shape.labels.push({ at: a, text: contenido, align: "center", baseline: "middle" });
  return shape;
}

/** La llamada: el recuadro en el segundo punto, apuntando al primero. */
function llamada({ points, style }: BuildParams): Shape {
  const [objetivo, caja] = points;
  if (!caja) return vacio();

  const shape = vacio();
  const contenido = style.textLabel || "Llamada…";
  shape.segments.push({ from: caja, to: objetivo, emphasis: "SECONDARY" });
  shape.segments.push(...puntaDeFlecha(caja, objetivo));
  shape.polygons.push(recuadroDeTexto(caja, contenido, style));
  shape.labels.push({ at: caja, text: contenido, align: "center", baseline: "middle" });
  return shape;
}

/** El banderín: un mástil y un triángulo, con el texto al lado. */
function banderin({ points, style }: BuildParams): Shape {
  const [a] = points;
  const shape = vacio();
  const alto = style.fontSize * 1.6;
  const ancho = style.fontSize * 1.3;

  shape.segments.push({ from: a, to: { x: a.x, y: a.y - alto * 1.6 } });
  shape.polygons.push({
    points: [
      { x: a.x, y: a.y - alto * 1.6 },
      { x: a.x + ancho, y: a.y - alto * 1.3 },
      { x: a.x, y: a.y - alto },
    ],
    filled: style.fill,
  });
  if (style.textLabel) {
    shape.labels.push({
      at: { x: a.x + ancho + 4, y: a.y - alto * 1.3 },
      text: style.textLabel,
      align: "left",
      baseline: "middle",
    });
  }
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

  shape.segments.push(...puntaDeFlecha(b, c, 10));

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
