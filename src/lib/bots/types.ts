/**
 * El vocabulario del módulo de bots.
 *
 * Todo lo que aquí hay sale del método de portfolio de bots que sigue la
 * plataforma (ver docs/BOTS.md): tres bloques, siete fases con puertas,
 * un semáforo de tres colores por bot, una escalera de emergencia de cuatro
 * niveles y un diario de impulsos. Los nombres son los del método para que
 * lo que se lee aquí y lo que se lee en la formación sea lo mismo.
 *
 * Puro: sólo tipos, etiquetas y valores de fábrica.
 */

/**
 * Los tres bloques macro del portfolio.
 *
 * Convexo: tendencia y momentum. Ganan poco a menudo y a lo grande de vez en
 * cuando; protegen en las crisis. Cóncavo: reversión a la media y rejillas.
 * Ganan poco y casi siempre; dan flujo de caja. Híbrido: lo que no se parece
 * a nada de lo anterior y por eso descorrelaciona.
 */
export type BotBlock = "CONVEXO" | "CONCAVO" | "HIBRIDO";

export const BLOCKS: BotBlock[] = ["CONVEXO", "CONCAVO", "HIBRIDO"];

export const BLOCK_LABELS: Record<BotBlock, string> = {
  CONVEXO: "Convexo",
  CONCAVO: "Cóncavo",
  HIBRIDO: "Híbrido",
};

export const BLOCK_HINTS: Record<BotBlock, string> = {
  CONVEXO:
    "Tendencia y momentum. Como pescadores de atún: semanas sin captura y de repente una pieza enorme. Protegen en las crisis.",
  CONCAVO:
    "Reversión a la media y rejillas. Como la panadería del barrio: venta pequeña, diaria y constante. Dan flujo de caja.",
  HIBRIDO: "Order flow, inteligencia artificial y lo que no se parece a nada. Suman descorrelación.",
};

/** La familia de la estrategia. Decide el bloque por defecto. */
export type BotStyle =
  | "TENDENCIA"
  | "MOMENTUM"
  | "REVERSION"
  | "GRID"
  | "SCALPING"
  | "RUPTURA"
  | "ORDERFLOW"
  | "IA";

export const STYLES: BotStyle[] = [
  "TENDENCIA",
  "MOMENTUM",
  "REVERSION",
  "GRID",
  "SCALPING",
  "RUPTURA",
  "ORDERFLOW",
  "IA",
];

export const STYLE_LABELS: Record<BotStyle, string> = {
  TENDENCIA: "Seguimiento de tendencia",
  MOMENTUM: "Momentum",
  REVERSION: "Reversión a la media",
  GRID: "Rejilla (grid)",
  SCALPING: "Scalping",
  RUPTURA: "Ruptura",
  ORDERFLOW: "Order flow",
  IA: "Inteligencia artificial",
};

/**
 * El bloque que le toca a cada familia si no se dice otra cosa.
 *
 * Es una propuesta y no una regla: un scalper puede estar construido de forma
 * cóncava o híbrida, y eso lo sabe quien lo construyó.
 */
export const STYLE_BLOCK: Record<BotStyle, BotBlock> = {
  TENDENCIA: "CONVEXO",
  MOMENTUM: "CONVEXO",
  RUPTURA: "CONVEXO",
  REVERSION: "CONCAVO",
  GRID: "CONCAVO",
  SCALPING: "CONCAVO",
  ORDERFLOW: "HIBRIDO",
  IA: "HIBRIDO",
};

/**
 * Las siete fases de la cantera, y el cementerio.
 *
 * Nadie debuta en el primer equipo por caerle bien al entrenador: se sube
 * categoría a categoría demostrando números. A partir de F4 los ascensos no
 * los decide nadie: los deciden las puertas.
 */
export type BotPhase = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "RETIRADO";

export const PIPELINE_PHASES: Exclude<BotPhase, "RETIRADO">[] = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
];

export const PHASE_LABELS: Record<BotPhase, string> = {
  F1: "Ideación y prototipado",
  F2: "Filtrado de robustez",
  F3: "Validación estadística",
  F4: "Forward testing",
  F5: "Incubación fuera de muestra",
  F6: "Staging (10% del tamaño)",
  F7: "Producción",
  RETIRADO: "Retirado",
};

export const PHASE_HINTS: Record<BotPhase, string> = {
  F1: "Una hipótesis en una frase y un prototipo. Sin números todavía.",
  F2: "Backtests en varios mercados y temporalidades sin optimizar. Sobrevive quien no quiebra.",
  F3: "Fuera de muestra, sensibilidad ±5% y Monte Carlo. Aquí muere el 80%.",
  F4: "En papel sobre el mercado real. Se compara con la banda del Monte Carlo.",
  F5: "Solo, uno o dos meses, en papel. Se mira si las métricas de riesgo aguantan un cambio de régimen.",
  F6: "Dinero real con el 10% de su tamaño objetivo. Valida su ventaja contra liquidez real.",
  F7: "Capital real y tamaño completo. Vigilado por el semáforo y el contrato de drawdown.",
  RETIRADO: "Con su autopsia escrita. No vuelve sin pasar otra vez por la cantera desde F3.",
};

/** Desde qué fase las puertas deciden el ascenso en vez de la persona. */
export const GATED_FROM: BotPhase = "F4";

/** En F6 se opera con esta fracción del tamaño objetivo. */
export const STAGING_SIZING_FRACTION = 0.1;

export function nextPhase(phase: BotPhase): BotPhase | null {
  const i = PIPELINE_PHASES.indexOf(phase as Exclude<BotPhase, "RETIRADO">);
  if (i < 0 || i === PIPELINE_PHASES.length - 1) return null;
  return PIPELINE_PHASES[i + 1];
}

export function previousPhase(phase: BotPhase): BotPhase | null {
  const i = PIPELINE_PHASES.indexOf(phase as Exclude<BotPhase, "RETIRADO">);
  if (i <= 0) return null;
  return PIPELINE_PHASES[i - 1];
}

/** Las fases en las que el bot opera de verdad (y sus operaciones cuentan). */
export function isProduction(phase: BotPhase): boolean {
  return phase === "F6" || phase === "F7";
}

/** La regla de oro del cementerio: se vuelve a entrar por F3, nunca más arriba. */
export const REENTRY_PHASE: BotPhase = "F3";

/** Por qué se retira un bot. Cada lápida es una lección que el portfolio no repite. */
export type RetirementReason =
  | "ALPHA_DECAY"
  | "OVERFITTING"
  | "BROKER"
  | "CAMBIO_REGIMEN"
  | "SUPERADO"
  | "NO_SUPERIOR"
  | "OTRO";

export const RETIREMENT_REASONS: RetirementReason[] = [
  "ALPHA_DECAY",
  "OVERFITTING",
  "BROKER",
  "CAMBIO_REGIMEN",
  "SUPERADO",
  "NO_SUPERIOR",
  "OTRO",
];

export const RETIREMENT_LABELS: Record<RetirementReason, string> = {
  ALPHA_DECAY: "Alpha decay",
  OVERFITTING: "Sobreajuste",
  BROKER: "Broker desfavorable",
  CAMBIO_REGIMEN: "Cambio de régimen",
  SUPERADO: "Superado por un challenger",
  NO_SUPERIOR: "Competitivo pero no superior",
  OTRO: "Otro motivo",
};

export const RETIREMENT_HINTS: Record<RetirementReason, string> = {
  ALPHA_DECAY: "Toda estrategia pierde su ventaja tarde o temprano. Ésta la perdió y el semáforo lo vio.",
  OVERFITTING: "Memorizó su ventana de entrenamiento y murió al salir de ella.",
  BROKER: "Los costes reales -- spread nocturno, deslizamiento -- se comieron su expectativa.",
  CAMBIO_REGIMEN: "El mercado cambió bajo sus pies: una intervención, un régimen nuevo.",
  SUPERADO: "Un challenger de la cantera lo batió en Sharpe y recuperación.",
  NO_SUPERIOR: "Rentable, pero no mejor que lo que ya había. Nunca salió del staging.",
  OTRO: "",
};

/**
 * Lo que el bot prometió.
 *
 * Contra esto se compara lo que hace en vivo. Sale del backtest, de su
 * histórico o se escribe a mano si el bot viene de fuera. Todos los campos
 * pueden faltar: un bot en F1 no tiene nada que prometer todavía.
 */
export interface Baseline {
  profitFactor: number | null;
  /** Expectativa por operación, en múltiplos del riesgo. */
  expectancyR: number | null;
  /** Porcentaje 0-100. */
  winRate: number | null;
  sharpe: number | null;
  /** Porcentaje 0-100 sobre el capital. */
  maxDrawdownPct: number | null;
  tradesPerMonth: number | null;
  /** Cuántas operaciones respaldan estas cifras. */
  trades: number | null;
  source: "BACKTEST" | "HISTORICO" | "MANUAL";
  note: string | null;
}

export const EMPTY_BASELINE: Baseline = {
  profitFactor: null,
  expectancyR: null,
  winRate: null,
  sharpe: null,
  maxDrawdownPct: null,
  tradesPerMonth: null,
  trades: null,
  source: "MANUAL",
  note: null,
};

export const BASELINE_SOURCE_LABELS: Record<Baseline["source"], string> = {
  BACKTEST: "Del backtest",
  HISTORICO: "De su propio histórico",
  MANUAL: "Escrita a mano",
};

/**
 * El semáforo de cada bot.
 *
 * Escrito en piedra: verde, no tocar nada, ni para bien ni para mal;
 * amarillo, reducir el tamaño al 50% y vigilar; naranja, a papel hasta que
 * demuestre con 30 operaciones limpias que se merece volver.
 */
export type Semaforo = "VERDE" | "AMARILLO" | "NARANJA" | "SIN_DATOS";

export const SEMAFORO_LABELS: Record<Semaforo, string> = {
  VERDE: "Verde",
  AMARILLO: "Amarillo",
  NARANJA: "Naranja",
  SIN_DATOS: "Sin datos",
};

export const SEMAFORO_INSTRUCTIONS: Record<Semaforo, string> = {
  VERDE: "Mantener. No tocar nada.",
  AMARILLO: "Reducir el tamaño al 50% y vigilar más de cerca.",
  NARANJA: "Pasar a papel: sin dinero real hasta demostrar 30 operaciones limpias.",
  SIN_DATOS: "Todavía no hay operaciones suficientes para juzgar.",
};

/** Operaciones limpias que un bot en naranja necesita para volver a real. */
export const CLEAN_TRADES_TO_RETURN = 30;

/** Lo que uno quiere hacer cuando le pica. */
export type ImpulseAction = "APAGAR" | "CERRAR" | "REDUCIR" | "SUBIR" | "OTRO";

export const IMPULSE_ACTIONS: ImpulseAction[] = ["APAGAR", "CERRAR", "REDUCIR", "SUBIR", "OTRO"];

export const IMPULSE_LABELS: Record<ImpulseAction, string> = {
  APAGAR: "Apagar el bot",
  CERRAR: "Cerrar la operación",
  REDUCIR: "Reducir el tamaño",
  SUBIR: "Subir el tamaño",
  OTRO: "Otra cosa",
};

/** Días que se esperan antes de mirar qué habría pasado. */
export const IMPULSE_EVALUATION_DAYS = 7;

/**
 * Los umbrales del portfolio.
 *
 * Los de fábrica son los del método. Se pueden cambiar, pero cambiarlos es una
 * decisión que se toma en la revisión anual, no un martes por la tarde.
 */
export interface PortfolioSettings {
  targets: Record<BotBlock, number>;
  /** La escalera de emergencia, en porcentaje de drawdown del portfolio. */
  killSwitch: { alert: number; reduce: number; close: number; off: number };
  gates: {
    profitFactor: number;
    expectancyR: number;
    sharpe: number;
    maxDrawdownPct: number;
    minTrades: number;
  };
}

export const DEFAULT_PORTFOLIO_SETTINGS: PortfolioSettings = {
  targets: { CONVEXO: 40, CONCAVO: 40, HIBRIDO: 20 },
  killSwitch: { alert: 8, reduce: 12, close: 15, off: 20 },
  gates: { profitFactor: 1.5, expectancyR: 0.15, sharpe: 1, maxDrawdownPct: 20, minTrades: 30 },
};

/** Cuánto puede desviarse un bloque de su objetivo antes de rebalancear. */
export const BLOCK_DEVIATION_ALERT_POINTS = 10;

/** A partir de qué correlación dos bots son «medio gemelos». */
export const REDUNDANT_CORRELATION = 0.5;

/** Con menos días en común, una correlación es una anécdota. */
export const MIN_DAYS_FOR_CORRELATION = 20;

/** El semáforo mira las últimas N operaciones o los últimos 30 días, lo que traiga más. */
export const ROLLING_WINDOW_DAYS = 30;
export const ROLLING_WINDOW_TRADES = 30;
/** Con menos que esto en la ventana, el semáforo no se pronuncia. */
export const MIN_ROLLING_TRADES = 10;

export function isBotBlock(value: unknown): value is BotBlock {
  return typeof value === "string" && (BLOCKS as string[]).includes(value);
}

export function isBotStyle(value: unknown): value is BotStyle {
  return typeof value === "string" && (STYLES as string[]).includes(value);
}

export function isBotPhase(value: unknown): value is BotPhase {
  return (
    typeof value === "string" &&
    ((PIPELINE_PHASES as string[]).includes(value) || value === "RETIRADO")
  );
}

export function isRetirementReason(value: unknown): value is RetirementReason {
  return typeof value === "string" && (RETIREMENT_REASONS as string[]).includes(value);
}

export function isImpulseAction(value: unknown): value is ImpulseAction {
  return typeof value === "string" && (IMPULSE_ACTIONS as string[]).includes(value);
}
