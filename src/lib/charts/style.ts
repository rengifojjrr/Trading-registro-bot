import type { ParamId, ToolId } from "./tools";
import { TOOL_BY_ID } from "./tools";

/**
 * Los parámetros de un dibujo, con sus valores por defecto y su saneado.
 *
 * Un dibujo guardado hace meses puede traer un parámetro que ya no existe, o
 * un ancho de línea de 900 que alguien metió a mano en la base de datos. Se
 * lee campo a campo y se descarta lo que no encaje, en lugar de fiarse: el
 * dibujo malo se pinta con el valor de siempre, y no revienta el gráfico
 * entero -- que es lo que pasaría con un `JSON.parse` y a correr.
 *
 * Puro: no toca base de datos ni canvas.
 */

export type LineStyle = "SOLID" | "DASHED" | "DOTTED";

/** Los niveles que puede llevar un Fibonacci, un Gann o una extensión. */
export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const DEFAULT_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618, 4.236] as const;
export const DEFAULT_GANN_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;
/** El abanico lleva menos rayos que el retroceso: con siete no se ve nada. */
export const DEFAULT_FAN_LEVELS = [0.382, 0.5, 0.618] as const;
export const DEFAULT_CIRCLE_LEVELS = [0.236, 0.382, 0.5, 0.618, 1] as const;
/**
 * Los ángulos de Gann, como proporción del 1×1.
 *
 * Son los de siempre -- 1/8, 1/4, 1/3, 1/2, 1, 2, 3, 4, 8 -- y no una
 * repartición cualquiera: la gracia del abanico es que el 1×1 marca el
 * equilibrio entre precio y tiempo, y el resto son múltiplos suyos.
 */
export const DEFAULT_GANN_ANGLES = [0.125, 0.25, 0.333, 0.5, 1, 2, 3, 4, 8] as const;

/** Cómo se etiqueta una onda de Elliott según su grado. */
export const WAVE_DEGREES = {
  MINOR: ["1", "2", "3", "4", "5"],
  INTERMEDIATE: ["(1)", "(2)", "(3)", "(4)", "(5)"],
  PRIMARY: ["I", "II", "III", "IV", "V"],
  CORRECTIVE: ["A", "B", "C", "D", "E"],
} as const;

export type WaveDegree = keyof typeof WAVE_DEGREES;

export const WAVE_DEGREE_LABELS: Record<WaveDegree, string> = {
  MINOR: "Menor (1-5)",
  INTERMEDIATE: "Intermedio ((1)-(5))",
  PRIMARY: "Primario (I-V)",
  CORRECTIVE: "Correctivo (A-E)",
};

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  fill: boolean;
  /** 0-100. En porcentaje y no en 0-1 porque es lo que se enseña en el panel. */
  fillOpacity: number;
  extendLeft: boolean;
  extendRight: boolean;
  showPrice: boolean;
  showLabels: boolean;
  /** Los niveles activos, en proporción del movimiento. */
  levels: number[];
  textLabel: string;
  /** Sólo en las posiciones: enseñar la relación beneficio/riesgo. */
  riskReward: boolean;
  /** Para calcular cuántos contratos salen del riesgo que aceptas. */
  accountSize: number | null;
  riskPercent: number | null;
  waveDegree: WaveDegree;
  /** El cuerpo del texto, en píxeles. Las anotaciones lo suelen querer mayor. */
  fontSize: number;
}

const BASE: DrawingStyle = {
  color: "#38bdf8",
  lineWidth: 2,
  lineStyle: "SOLID",
  fill: true,
  fillOpacity: 12,
  extendLeft: false,
  extendRight: false,
  showPrice: true,
  showLabels: true,
  levels: [...DEFAULT_FIB_LEVELS],
  textLabel: "",
  riskReward: true,
  accountSize: null,
  riskPercent: null,
  waveDegree: "MINOR",
  fontSize: 11,
};

/**
 * Lo que trae cada herramienta puesta de fábrica.
 *
 * Sólo lo que se aparta de la base: repetir los quince campos por herramienta
 * sería garantizar que un cambio en el valor común se olvide en tres de ellas.
 */
const POR_HERRAMIENTA: Partial<Record<ToolId, Partial<DrawingStyle>>> = {
  // Un rayo se prolonga: es lo que lo distingue de una línea de tendencia.
  RAY: { extendRight: true },
  EXTENDED: { extendLeft: true, extendRight: true },
  HRAY: { extendRight: true },
  HLINE: { extendLeft: true, extendRight: true },
  // Una línea no rellena nada, y dejar `fill` en true haría que el panel
  // enseñara un control de opacidad que no hace nada.
  TRENDLINE: { fill: false },
  VLINE: { fill: false, showPrice: false },
  CROSSLINE: { fill: false },
  ARC: { fill: false },
  PATH: { fill: false, showLabels: false },
  FIB: { fill: false, extendRight: true },
  FIB_EXTENSION: { fill: false, levels: [...DEFAULT_EXTENSION_LEVELS] },
  GANN_BOX: { fill: false, levels: [...DEFAULT_GANN_LEVELS] },
  PITCHFORK: { extendRight: true, fillOpacity: 8 },
  // Verde para la larga y rojo para la corta, como en todas partes: que el
  // color diga la dirección ahorra leer la etiqueta.
  LONG_POSITION: { color: "#22c55e", fillOpacity: 15 },
  SHORT_POSITION: { color: "#ef4444", fillOpacity: 15 },
  DATE_PRICE_RANGE: { fillOpacity: 10 },
  FORECAST: { fillOpacity: 10 },
  ELLIOTT: { fill: false },
  XABCD: { fillOpacity: 8 },
  HEAD_SHOULDERS: { fill: false },

  // ------------------------------------------------- añadidas en la ronda 2
  TREND_ANGLE: { fill: false, extendRight: true },
  INFO_LINE: { fill: false },
  ARROW: { fill: false },
  CURVE: { fillOpacity: 10 },
  POLYLINE: { fillOpacity: 10 },
  FIB_FAN: { fill: false, levels: [...DEFAULT_FAN_LEVELS] },
  FIB_TIMEZONE: { fill: false },
  FIB_CHANNEL: { fill: false, extendRight: true },
  FIB_CIRCLE: { fillOpacity: 6, levels: [...DEFAULT_CIRCLE_LEVELS] },
  GANN_FAN: { fill: false, levels: [...DEFAULT_GANN_ANGLES] },
  PRICE_RANGE: { fillOpacity: 10 },
  DATE_RANGE: { fillOpacity: 10 },
  CYPHER: { fillOpacity: 8 },
  ABCD: { fillOpacity: 8 },
  TRIANGLE_PATTERN: { fillOpacity: 8 },
  THREE_DRIVES: { fill: false },
  // El texto suelto se lee, no se enmarca; el resto de anotaciones sí.
  TEXT: { fill: false, fontSize: 13 },
  NOTE: { fillOpacity: 18, fontSize: 12 },
  CALLOUT: { fillOpacity: 18, fontSize: 12 },
  PRICE_LABEL: { fillOpacity: 22, fontSize: 12 },
  FLAG: { fillOpacity: 70, fontSize: 12 },
};

export function defaultStyle(tool: ToolId): DrawingStyle {
  return { ...BASE, ...POR_HERRAMIENTA[tool] };
}

/**
 * Lee lo guardado sin fiarse, quedándose con lo que encaja.
 *
 * Un parámetro con la forma equivocada no invalida el dibujo entero: cae al
 * valor de siempre y el resto se conserva. Perder un dibujo por un campo mal
 * escrito sería peor que perder el campo.
 */
export function parseStyle(tool: ToolId, raw: unknown): DrawingStyle {
  const base = defaultStyle(tool);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;

  const o = raw as Record<string, unknown>;

  return {
    color: color(o.color) ?? base.color,
    lineWidth: entero(o.lineWidth, 1, 8) ?? base.lineWidth,
    lineStyle: lineStyle(o.lineStyle) ?? base.lineStyle,
    fill: booleano(o.fill) ?? base.fill,
    fillOpacity: entero(o.fillOpacity, 0, 100) ?? base.fillOpacity,
    extendLeft: booleano(o.extendLeft) ?? base.extendLeft,
    extendRight: booleano(o.extendRight) ?? base.extendRight,
    showPrice: booleano(o.showPrice) ?? base.showPrice,
    showLabels: booleano(o.showLabels) ?? base.showLabels,
    levels: niveles(o.levels) ?? base.levels,
    textLabel: texto(o.textLabel, 80) ?? base.textLabel,
    riskReward: booleano(o.riskReward) ?? base.riskReward,
    accountSize: positivo(o.accountSize) ?? base.accountSize,
    riskPercent: rango(o.riskPercent, 0.01, 100) ?? base.riskPercent,
    waveDegree: grado(o.waveDegree) ?? base.waveDegree,
    fontSize: entero(o.fontSize, 8, 32) ?? base.fontSize,
  };
}

/**
 * Guarda sólo lo que se aparta del valor de fábrica.
 *
 * Así un cambio en los valores por defecto llega a los dibujos que nunca los
 * tocaron, en vez de dejarlos congelados con lo que era normal el día que se
 * dibujaron. Es el mismo criterio que ya seguía la lista de niveles de
 * Fibonacci al vivir en el código y no en la base de datos.
 */
export function serialiseStyle(tool: ToolId, style: DrawingStyle): Record<string, unknown> {
  const base = defaultStyle(tool);
  const salida: Record<string, unknown> = {};

  for (const clave of Object.keys(base) as (keyof DrawingStyle)[]) {
    const valor = style[clave];
    const porDefecto = base[clave];

    if (clave === "levels") {
      const a = valor as number[];
      const b = porDefecto as number[];
      if (a.length !== b.length || a.some((n, i) => n !== b[i])) salida[clave] = a;
      continue;
    }
    if (valor !== porDefecto) salida[clave] = valor;
  }

  return salida;
}

/** Si el panel debe enseñar este control para esta herramienta. */
export function hasParam(tool: ToolId, param: ParamId): boolean {
  return TOOL_BY_ID[tool].params.includes(param);
}

/** El color con la opacidad del relleno aplicada, listo para el canvas. */
export function fillColor(style: DrawingStyle): string {
  const alpha = Math.min(100, Math.max(0, style.fillOpacity)) / 100;
  const hex = style.color.replace("#", "");
  if (hex.length !== 6) return style.color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** El patrón de guiones que corresponde al estilo de línea. */
export function dashPattern(style: DrawingStyle): number[] {
  if (style.lineStyle === "DASHED") return [6, 4];
  if (style.lineStyle === "DOTTED") return [2, 3];
  return [];
}

// ------------------------------------------------------------ validadores

function color(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

function entero(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v >= min && v <= max ? v : null;
}

function rango(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= min && v <= max ? v : null;
}

function positivo(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v > 0 ? v : null;
}

function booleano(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function texto(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

function lineStyle(v: unknown): LineStyle | null {
  return v === "SOLID" || v === "DASHED" || v === "DOTTED" ? v : null;
}

function grado(v: unknown): WaveDegree | null {
  return typeof v === "string" && v in WAVE_DEGREES ? (v as WaveDegree) : null;
}

/**
 * Los niveles, ordenados y sin repetidos.
 *
 * Se admite hasta 4.236 (la extensión más lejana que se usa) y desde -1: un
 * nivel negativo tiene sentido al proyectar hacia el otro lado.
 */
function niveles(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const limpios = v
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .filter((n) => n >= -1 && n <= 10)
    .slice(0, 20);
  if (limpios.length === 0) return null;
  return [...new Set(limpios)].sort((a, b) => a - b);
}
