import { buildShape } from "./geometry";
import { renderShape } from "./render";
import { defaultStyle } from "./style";
import { TOOL_BY_ID, type ToolId } from "./tools";

/**
 * El dibujo en miniatura de una herramienta, para la barra.
 *
 * «Horquilla de Andrews» no significa nada hasta que la ves. Un icono dibujado
 * a mano por herramienta serían cuarenta y seis SVG que se desincronizan con
 * la geometría en cuanto una cambie; en vez de eso se pinta **la herramienta
 * de verdad**, con el mismo `buildShape` y el mismo `renderShape` que usa el
 * gráfico. Si la horquilla cambia, su icono cambia solo.
 *
 * Lo único que hay aquí que no está en el gráfico son los puntos: unos que
 * dejan cada herramienta reconocible en sesenta píxeles. Un zigzag genérico
 * vale para un trazado y no para una posición larga, donde entrada, stop y
 * objetivo tienen que ir en el orden que los hace legibles.
 */

export interface PreviewPoint {
  x: number;
  y: number;
}

/**
 * Los puntos que hacen reconocible cada herramienta, en un lienzo 1×1.
 *
 * En proporción y no en píxeles para que el mismo juego sirva a 60×40 en la
 * barra y a 240×160 en un panel de ayuda.
 */
const PUNTOS: Partial<Record<ToolId, PreviewPoint[]>> = {
  // Las de una línea: una diagonal que sube, que es como se dibujan de verdad.
  TRENDLINE: [{ x: 0.15, y: 0.78 }, { x: 0.85, y: 0.25 }],
  RAY: [{ x: 0.15, y: 0.78 }, { x: 0.55, y: 0.45 }],
  EXTENDED: [{ x: 0.35, y: 0.65 }, { x: 0.65, y: 0.38 }],
  ARROW: [{ x: 0.15, y: 0.78 }, { x: 0.82, y: 0.28 }],
  TREND_ANGLE: [{ x: 0.18, y: 0.75 }, { x: 0.7, y: 0.35 }],
  INFO_LINE: [{ x: 0.18, y: 0.75 }, { x: 0.82, y: 0.3 }],
  HLINE: [{ x: 0.5, y: 0.5 }],
  // Empieza pasada la mitad: es lo único que la distingue de la horizontal a
  // veinte píxeles, donde las dos son un guion.
  HRAY: [{ x: 0.55, y: 0.5 }],
  VLINE: [{ x: 0.5, y: 0.5 }],
  CROSSLINE: [{ x: 0.5, y: 0.5 }],

  // Figuras: un rectángulo apaisado se reconoce mejor que uno cuadrado.
  RECTANGLE: [{ x: 0.15, y: 0.3 }, { x: 0.85, y: 0.72 }],
  ROTATED_RECTANGLE: [{ x: 0.15, y: 0.62 }, { x: 0.85, y: 0.3 }, { x: 0.15, y: 0.85 }],
  ELLIPSE: [{ x: 0.14, y: 0.28 }, { x: 0.86, y: 0.74 }],
  TRIANGLE: [{ x: 0.14, y: 0.8 }, { x: 0.5, y: 0.2 }, { x: 0.86, y: 0.8 }],
  PARALLEL_CHANNEL: [{ x: 0.14, y: 0.7 }, { x: 0.86, y: 0.3 }, { x: 0.14, y: 0.92 }],
  ARC: [{ x: 0.14, y: 0.78 }, { x: 0.86, y: 0.78 }, { x: 0.5, y: 0.12 }],
  CURVE: [{ x: 0.14, y: 0.78 }, { x: 0.86, y: 0.78 }, { x: 0.5, y: 0.12 }],
  PATH: [
    { x: 0.1, y: 0.78 },
    { x: 0.37, y: 0.28 },
    { x: 0.63, y: 0.62 },
    { x: 0.9, y: 0.2 },
  ],
  POLYLINE: [
    { x: 0.12, y: 0.72 },
    { x: 0.35, y: 0.2 },
    { x: 0.68, y: 0.32 },
    { x: 0.88, y: 0.7 },
    { x: 0.45, y: 0.88 },
  ],

  // Fibonacci: de arriba a abajo, que es como se traza un retroceso.
  FIB: [{ x: 0.2, y: 0.22 }, { x: 0.8, y: 0.78 }],
  FIB_EXTENSION: [{ x: 0.15, y: 0.8 }, { x: 0.45, y: 0.2 }, { x: 0.7, y: 0.6 }],
  FIB_FAN: [{ x: 0.15, y: 0.85 }, { x: 0.85, y: 0.2 }],
  FIB_TIMEZONE: [{ x: 0.12, y: 0.5 }, { x: 0.24, y: 0.5 }],
  FIB_CHANNEL: [{ x: 0.12, y: 0.66 }, { x: 0.88, y: 0.34 }, { x: 0.12, y: 0.9 }],
  FIB_CIRCLE: [{ x: 0.5, y: 0.78 }, { x: 0.86, y: 0.5 }],
  // Los dos puntos de la boca a distinta altura *y* a distinta x: con la boca
  // vertical el punto medio queda a la altura del mango, la mediana sale
  // horizontal y la horquilla se ve como tres rayas paralelas.
  PITCHFORK: [{ x: 0.08, y: 0.72 }, { x: 0.4, y: 0.16 }, { x: 0.46, y: 0.6 }],
  GANN_BOX: [{ x: 0.15, y: 0.2 }, { x: 0.85, y: 0.8 }],
  GANN_FAN: [{ x: 0.12, y: 0.88 }, { x: 0.88, y: 0.2 }],

  // Posición: entrada en medio, stop y objetivo a cada lado. Es lo que la
  // hace reconocible de un vistazo, y con un zigzag genérico sale una banda
  // de altura cero.
  LONG_POSITION: [{ x: 0.1, y: 0.52 }, { x: 0.1, y: 0.82 }, { x: 0.1, y: 0.18 }],
  SHORT_POSITION: [{ x: 0.1, y: 0.48 }, { x: 0.1, y: 0.18 }, { x: 0.1, y: 0.82 }],

  // Medida.
  DATE_PRICE_RANGE: [{ x: 0.16, y: 0.3 }, { x: 0.84, y: 0.72 }],
  PRICE_RANGE: [{ x: 0.25, y: 0.26 }, { x: 0.75, y: 0.76 }],
  DATE_RANGE: [{ x: 0.16, y: 0.32 }, { x: 0.84, y: 0.68 }],
  FORECAST: [{ x: 0.1, y: 0.8 }, { x: 0.45, y: 0.45 }, { x: 0.88, y: 0.18 }],

  // Patrones: el zigzag que los define, con la cabeza donde toca.
  ELLIOTT: [
    { x: 0.08, y: 0.85 },
    { x: 0.3, y: 0.35 },
    { x: 0.45, y: 0.6 },
    { x: 0.72, y: 0.18 },
    { x: 0.92, y: 0.45 },
  ],
  XABCD: [
    { x: 0.08, y: 0.8 },
    { x: 0.3, y: 0.2 },
    { x: 0.5, y: 0.55 },
    { x: 0.72, y: 0.22 },
    { x: 0.92, y: 0.72 },
  ],
  CYPHER: [
    { x: 0.08, y: 0.8 },
    { x: 0.3, y: 0.2 },
    { x: 0.5, y: 0.55 },
    { x: 0.72, y: 0.22 },
    { x: 0.92, y: 0.72 },
  ],
  ABCD: [
    { x: 0.1, y: 0.82 },
    { x: 0.38, y: 0.2 },
    { x: 0.62, y: 0.55 },
    { x: 0.9, y: 0.15 },
  ],
  TRIANGLE_PATTERN: [
    { x: 0.1, y: 0.2 },
    { x: 0.9, y: 0.45 },
    { x: 0.12, y: 0.82 },
    { x: 0.88, y: 0.55 },
  ],
  THREE_DRIVES: [
    { x: 0.06, y: 0.82 },
    { x: 0.22, y: 0.4 },
    { x: 0.36, y: 0.62 },
    { x: 0.52, y: 0.28 },
    { x: 0.66, y: 0.5 },
    { x: 0.82, y: 0.16 },
    { x: 0.94, y: 0.4 },
  ],
  // La cabeza más alta que los hombros: si no, es un trazado cualquiera.
  HEAD_SHOULDERS: [
    { x: 0.06, y: 0.6 },
    { x: 0.26, y: 0.78 },
    { x: 0.5, y: 0.18 },
    { x: 0.74, y: 0.78 },
    { x: 0.94, y: 0.6 },
  ],

  // Anotaciones: el texto en miniatura no se lee, así que lo que se reconoce
  // es el marco y el rabito.
  TEXT: [{ x: 0.5, y: 0.5 }],
  NOTE: [{ x: 0.5, y: 0.5 }],
  CALLOUT: [{ x: 0.18, y: 0.82 }, { x: 0.6, y: 0.32 }],
  PRICE_LABEL: [{ x: 0.5, y: 0.5 }],
  FLAG: [{ x: 0.34, y: 0.85 }],
};

/**
 * La letra que representa a cada herramienta de anotación en su miniatura.
 *
 * Sólo las que se dibujan escribiendo: el resto tiene forma y no necesita
 * ninguna letra encima.
 */
const INICIAL: Partial<Record<ToolId, string>> = {
  TEXT: "T",
  NOTE: "N",
  CALLOUT: "!",
  PRICE_LABEL: "$",
};

/** Un zigzag repartido, para una herramienta que no declare los suyos. */
function porDefecto(n: number): PreviewPoint[] {
  if (n === 1) return [{ x: 0.5, y: 0.5 }];
  return Array.from({ length: n }, (_, i) => ({
    x: 0.12 + (0.76 * i) / (n - 1),
    y: i % 2 === 0 ? 0.78 : 0.24,
  }));
}

/**
 * Los puntos de la miniatura de una herramienta, en proporción del lienzo.
 *
 * Siempre devuelve tantos como la herramienta pide: una miniatura con menos
 * puntos de los necesarios se pinta como una vista previa a medias, que es
 * justo lo que no queremos enseñar en un icono.
 */
export function previewPoints(tool: ToolId): PreviewPoint[] {
  const declarados = PUNTOS[tool];
  const necesarios = TOOL_BY_ID[tool].points;
  if (!declarados || declarados.length !== necesarios) return porDefecto(necesarios);
  return declarados;
}

export interface PreviewOptions {
  /** El color del trazo. Por defecto, el de fábrica de la herramienta. */
  color?: string;
  /** El color del texto de las etiquetas, normalmente el del tema. */
  labelColor?: string;
  /** El fondo, para el contorno del texto. */
  haloColor?: string;
}

/**
 * Pinta la miniatura de una herramienta en un lienzo ya dimensionado.
 *
 * Recibe el contexto y no lo crea: quien llama sabe del `devicePixelRatio` y
 * del tamaño, y esto sólo sabe de la herramienta.
 */
export function renderPreview(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  width: number,
  height: number,
  options: PreviewOptions = {},
): void {
  const base = defaultStyle(tool);
  const style = {
    ...base,
    color: options.color ?? base.color,
    // A este tamaño el texto de verdad es una mancha; las etiquetas se apagan
    // donde se puedan apagar y el cuerpo baja donde no.
    showLabels: false,
    showPrice: false,
    riskReward: false,
    // Una letra y no una palabra.
    //
    // Las herramientas de anotación no tienen forma propia: lo que se dibuja
    // es su texto. Con la etiqueta vacía, la geometría pone el suyo de relleno
    // -- «Texto…», «Nota…» -- y en un icono de veinte píxeles eso salía como
    // «exto», que no es ni un dibujo ni una palabra. Una inicial sí cabe
    // entera y se reconoce.
    textLabel: INICIAL[tool] ?? "",
    fontSize: Math.max(7, Math.min(12, Math.round(height * 0.42))),
    lineWidth: Math.max(1, base.lineWidth - 1),
  };

  // Un margen para que un rayo que se prolonga no salga tocando el borde.
  const margen = 3;
  const w = width - margen * 2;
  const h = height - margen * 2;

  const puntos = previewPoints(tool).map((p) => ({
    x: margen + p.x * w,
    y: margen + p.y * h,
  }));

  // Recortado al lienzo. Un rayo se prolonga el doble del ancho, y sin
  // recortar eso se pinta fuera del icono -- sobre el botón de al lado si
  // comparten lienzo. El recorte es además lo que hace visible la diferencia
  // entre una línea de tendencia, que acaba dentro, y un rayo, que se va por
  // el borde: sin él las dos son la misma diagonal.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const shape = buildShape({
    tool,
    points: puntos,
    style,
    width,
    height,
    // Precios y tiempos coherentes para que lo que calcula números no divida
    // por cero ni saque una proporción absurda.
    prices: puntos.map((_, i) => 68000 + i * 100),
    times: puntos.map((_, i) => 1000 + i * 3600),
    barSeconds: 3600,
    formatPrice: (n) => n.toFixed(0),
  });

  renderShape(ctx, shape, style, {
    labelColor: options.labelColor,
    haloColor: options.haloColor,
    // Aunque haya recorte: recortar esconde la mitad de la letra, y meterla
    // dentro la enseña entera.
    bounds: { width, height },
  });

  ctx.restore();
}
