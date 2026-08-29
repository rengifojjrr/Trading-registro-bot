/**
 * Cómo se lee el eje de precios.
 *
 * Había un solo interruptor -- logarítmica sí o no -- y con eso no se puede
 * responder la pregunta que uno se hace al revisar una operación: «¿cuánto se
 * movió esto, en tanto por ciento?». La respuesta absoluta («mil trescientos
 * dólares») no se compara entre una operación de agosto y una de marzo si el
 * precio de partida era otro.
 *
 * Tres modos, no dos booleanos cruzados: lineal, logarítmica y porcentaje son
 * excluyentes entre sí, y con dos interruptores independientes existirían
 * estados imposibles («logarítmica y porcentaje a la vez») que habría que
 * prohibir a mano en cada sitio.
 *
 * Puro: nombra los modos y los traduce a lo que la librería entiende, sin
 * tocarla.
 */

export type ScaleMode = "NORMAL" | "LOG" | "PERCENT";

export const SCALE_MODES: ScaleMode[] = ["NORMAL", "LOG", "PERCENT"];

export const SCALE_LABELS: Record<ScaleMode, string> = {
  NORMAL: "Lineal",
  LOG: "Logarítmica",
  PERCENT: "Porcentaje",
};

export const SCALE_HINTS: Record<ScaleMode, string> = {
  NORMAL: "El precio tal cual. Lo normal para mirar una operación.",
  LOG: "La misma distancia para el mismo porcentaje. Para rangos largos.",
  PERCENT: "Cuánto se ha movido desde la primera vela que se ve, en tanto por ciento.",
};

/** Si el modo es uno de los tres; lo guardado puede traer cualquier cosa. */
export function isScaleMode(value: unknown): value is ScaleMode {
  return typeof value === "string" && (SCALE_MODES as readonly string[]).includes(value);
}

/**
 * Lo que la vista del gráfico recuerda de una operación a la siguiente vez.
 *
 * Temporalidad, escala y qué se enseña se perdían al salir: volver a una
 * operación te devolvía a la vista de fábrica y no a aquella desde la que
 * sacaste la conclusión. Se guarda por operación porque es lo que es: una
 * conclusión sobre *esa* operación, no una preferencia global.
 */
export interface ChartViewState {
  granularity: string;
  scaleMode: ScaleMode;
  autoScale: boolean;
  showVolume: boolean;
  showDrawings: boolean;
  showPlan: boolean;
  magnet: boolean;
  indicators: string[];
}

export const DEFAULT_VIEW: ChartViewState = {
  granularity: "ONE_HOUR",
  scaleMode: "NORMAL",
  autoScale: true,
  showVolume: false,
  showDrawings: true,
  showPlan: true,
  magnet: true,
  indicators: [],
};

/**
 * Lee una vista guardada sin fiarse.
 *
 * Campo a campo, como el estilo de los dibujos y por el mismo motivo: un
 * `showVolume` con la palabra «sí» dentro no puede tumbar el gráfico entero,
 * tiene que caer al valor de siempre y dejar pasar el resto.
 */
export function parseView(raw: unknown, fallbackGranularity: string): ChartViewState {
  const base = { ...DEFAULT_VIEW, granularity: fallbackGranularity };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;

  const o = raw as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

  return {
    granularity: typeof o.granularity === "string" ? o.granularity : base.granularity,
    scaleMode: isScaleMode(o.scaleMode) ? o.scaleMode : base.scaleMode,
    autoScale: bool(o.autoScale, base.autoScale),
    showVolume: bool(o.showVolume, base.showVolume),
    showDrawings: bool(o.showDrawings, base.showDrawings),
    showPlan: bool(o.showPlan, base.showPlan),
    magnet: bool(o.magnet, base.magnet),
    indicators: Array.isArray(o.indicators)
      ? o.indicators.filter((i): i is string => typeof i === "string").slice(0, 12)
      : base.indicators,
  };
}

/** Dónde vive la vista de una operación. Una clave por operación. */
export function viewStorageKey(tradeId: string): string {
  return `grafico:vista:${tradeId}`;
}
