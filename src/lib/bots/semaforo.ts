import type { BotMetrics } from "./metrics";
import { MIN_ROLLING_TRADES, type Baseline, type Semaforo } from "./types";

/**
 * El semáforo de un bot: su ventana móvil contra su línea base.
 *
 * Funciona como una analítica de sangre. No se decide si un bot está sano por
 * sensaciones: se miran sus marcadores contra sus valores de referencia. La
 * referencia es lo que prometió -- el backtest -- o, si no hay backtest, lo
 * que hizo antes de la ventana. Y el protocolo está escrito en piedra: verde
 * no se toca, amarillo se reduce a la mitad, naranja se va a papel.
 *
 * Los bots no se rompen de golpe: se apagan poco a poco como una pila. Esto
 * existe para verlo antes de que cueste el dinero.
 *
 * Puro.
 */

/** Por debajo de esta fracción de la línea base, el bot está en amarillo. */
export const YELLOW_RATIO = 0.85;
/** Y por debajo de ésta, en naranja. */
export const ORANGE_RATIO = 0.6;

export interface HealthReading {
  state: Semaforo;
  /** Cada motivo, para que la instrucción no salga de la nada. */
  reasons: string[];
  /** Qué línea base se usó, para decirlo. */
  baselineSource: "BACKTEST" | "HISTORICO" | "MANUAL" | "NINGUNA";
  comparisons: HealthComparison[];
}

export interface HealthComparison {
  label: string;
  rolling: string;
  baseline: string;
  /** Ventana entre base: 1 es igual, 0,5 la mitad. `null` si no se pudo. */
  ratio: number | null;
}

export function evaluateHealth(params: {
  rolling: BotMetrics;
  /** Lo que prometió. Puede venir vacío. */
  declared: Baseline;
  /** Lo que hizo antes de la ventana, si hay bastante. */
  historical: BotMetrics | null;
  contractDrawdownPct: number | null;
}): HealthReading {
  const { rolling, declared, historical, contractDrawdownPct } = params;

  if (rolling.trades < MIN_ROLLING_TRADES) {
    return {
      state: "SIN_DATOS",
      reasons: [`Sólo ${rolling.trades} operaciones en la ventana; hacen falta ${MIN_ROLLING_TRADES}.`],
      baselineSource: "NINGUNA",
      comparisons: [],
    };
  }

  // La línea base declarada manda; si falta, el propio histórico del bot.
  const base = pickBaseline(declared, historical);
  if (!base) {
    return {
      state: "SIN_DATOS",
      reasons: ["Sin línea base: ni backtest declarado ni histórico suficiente fuera de la ventana."],
      baselineSource: "NINGUNA",
      comparisons: [],
    };
  }

  const comparisons: HealthComparison[] = [];
  const reasons: string[] = [];
  let peor: Semaforo = "VERDE";
  const bajar = (a: Semaforo) => {
    const orden: Semaforo[] = ["VERDE", "AMARILLO", "NARANJA"];
    if (orden.indexOf(a) > orden.indexOf(peor)) peor = a;
  };

  const pf = compare("Profit factor", rolling.profitFactor, base.values.profitFactor);
  if (pf) {
    comparisons.push(pf.comparison);
    if (pf.ratio !== null && pf.ratio < ORANGE_RATIO) {
      bajar("NARANJA");
      reasons.push(`Profit factor rodante ${pf.comparison.rolling} contra ${pf.comparison.baseline} de línea base.`);
    } else if (pf.ratio !== null && pf.ratio < YELLOW_RATIO) {
      bajar("AMARILLO");
      reasons.push(`Profit factor rodante ${pf.comparison.rolling}, por debajo del ${Math.round(YELLOW_RATIO * 100)}% de su línea base.`);
    }
  }

  const exp = compare("Expectativa (R)", rolling.expectancyR, base.values.expectancyR);
  if (exp) {
    comparisons.push(exp.comparison);
    if (exp.ratio !== null && exp.ratio < ORANGE_RATIO) {
      bajar("NARANJA");
      reasons.push(`Expectativa rodante ${exp.comparison.rolling} R contra ${exp.comparison.baseline} R.`);
    } else if (exp.ratio !== null && exp.ratio < YELLOW_RATIO) {
      bajar("AMARILLO");
      reasons.push(`Expectativa rodante ${exp.comparison.rolling} R, por debajo de su línea base.`);
    }
  }

  const wr = compare("Win rate", rolling.winRate, base.values.winRate);
  if (wr) comparisons.push(wr.comparison);

  const sh = compare("Sharpe", rolling.sharpe, base.values.sharpe);
  if (sh) comparisons.push(sh.comparison);

  // El contrato de drawdown pesa por encima de todo: superarlo no es mala
  // suerte, es incumplir contrato.
  if (contractDrawdownPct !== null && rolling.maxDrawdownPct !== null) {
    comparisons.push({
      label: "Drawdown (contrato)",
      rolling: `${rolling.maxDrawdownPct.toFixed(1)}%`,
      baseline: `${contractDrawdownPct.toFixed(1)}%`,
      ratio: contractDrawdownPct > 0 ? rolling.maxDrawdownPct / contractDrawdownPct : null,
    });
    if (rolling.maxDrawdownPct > contractDrawdownPct) {
      bajar("NARANJA");
      reasons.push(
        `Drawdown del ${rolling.maxDrawdownPct.toFixed(1)}% con un contrato firmado de ${contractDrawdownPct.toFixed(1)}%.`,
      );
    }
  }

  if (comparisons.length === 0) {
    return {
      state: "SIN_DATOS",
      reasons: ["La línea base no tiene ninguna cifra comparable."],
      baselineSource: base.source,
      comparisons,
    };
  }

  if (reasons.length === 0) reasons.push("Todos los marcadores dentro de su línea base.");

  return { state: peor, reasons, baselineSource: base.source, comparisons };
}

interface PickedBaseline {
  source: "BACKTEST" | "HISTORICO" | "MANUAL";
  values: {
    profitFactor: number | null;
    expectancyR: number | null;
    winRate: number | null;
    sharpe: number | null;
  };
}

/**
 * La declarada si tiene alguna cifra; si no, el histórico del bot.
 *
 * El histórico sólo vale si es de verdad anterior a la ventana y tiene
 * muestra: comparar la ventana consigo misma daría siempre verde.
 */
function pickBaseline(declared: Baseline, historical: BotMetrics | null): PickedBaseline | null {
  const tieneAlgo =
    declared.profitFactor !== null ||
    declared.expectancyR !== null ||
    declared.winRate !== null ||
    declared.sharpe !== null;

  if (tieneAlgo) {
    return {
      source: declared.source,
      values: {
        profitFactor: declared.profitFactor,
        expectancyR: declared.expectancyR,
        winRate: declared.winRate,
        sharpe: declared.sharpe,
      },
    };
  }

  if (historical && historical.trades >= MIN_ROLLING_TRADES) {
    return {
      source: "HISTORICO",
      values: {
        profitFactor: historical.profitFactor,
        expectancyR: historical.expectancyR,
        winRate: historical.winRate,
        sharpe: historical.sharpe,
      },
    };
  }

  return null;
}

function compare(
  label: string,
  rolling: number | null,
  baseline: number | null,
): { comparison: HealthComparison; ratio: number | null } | null {
  if (baseline === null || rolling === null) return null;
  // Una base a cero o negativa no sirve de referencia: dividir por ella diría
  // que cualquier cosa es infinitamente mejor.
  const ratio = baseline > 0 ? rolling / baseline : null;
  return {
    comparison: {
      label,
      rolling: rolling.toFixed(2),
      baseline: baseline.toFixed(2),
      ratio,
    },
    ratio,
  };
}
