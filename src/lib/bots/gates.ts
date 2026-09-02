import type { BotMetrics } from "./metrics";
import type { PortfolioSettings } from "./types";

/**
 * Las puertas automáticas de la cantera.
 *
 * A partir de F4 los ascensos no los decide nadie: los deciden estos cinco
 * criterios. Cuatro son de calidad -- profit factor, expectativa en R, Sharpe
 * y drawdown -- y el quinto es el que casi todos ignoran: la muestra. Un bot
 * con un profit factor de 32 y nueve operaciones no demuestra nada; nueve
 * operaciones pueden ser pura suerte. Por eso la muestra no es un criterio
 * más: sin ella, los otros cuatro ni se miran.
 *
 * Puro.
 */

export type GateCriterionId = "SAMPLE" | "PROFIT_FACTOR" | "EXPECTANCY_R" | "SHARPE" | "DRAWDOWN";

export interface GateCriterion {
  id: GateCriterionId;
  label: string;
  /** Lo que se pide, escrito para leerlo. */
  required: string;
  /** Lo que hay, escrito para leerlo. */
  observed: string;
  /** `null` cuando no se puede medir: sin tamaño de cuenta no hay drawdown en porcentaje. */
  pass: boolean | null;
}

export type GateVerdict = "GO" | "RETENIDO" | "SIN_DATOS";

export interface GateResult {
  criteria: GateCriterion[];
  passed: number;
  total: number;
  verdict: GateVerdict;
  /** La frase de una línea. */
  summary: string;
}

export function evaluateGate(m: BotMetrics, gates: PortfolioSettings["gates"]): GateResult {
  const muestra = m.trades >= gates.minTrades;

  const criteria: GateCriterion[] = [
    {
      id: "SAMPLE",
      label: "Muestra suficiente",
      required: `≥ ${gates.minTrades} operaciones`,
      observed: `${m.trades} operaciones`,
      pass: muestra,
    },
    {
      id: "PROFIT_FACTOR",
      label: "Profit factor",
      required: `> ${gates.profitFactor}`,
      observed: m.profitFactor === null ? "sin pérdidas aún" : m.profitFactor.toFixed(2),
      pass: m.profitFactor === null ? null : m.profitFactor > gates.profitFactor,
    },
    {
      id: "EXPECTANCY_R",
      label: "Expectativa por operación",
      required: `> ${gates.expectancyR} R`,
      observed: m.expectancyR === null ? "sin unidad de riesgo" : `${m.expectancyR.toFixed(2)} R`,
      pass: m.expectancyR === null ? null : m.expectancyR > gates.expectancyR,
    },
    {
      id: "SHARPE",
      label: "Sharpe",
      required: `> ${gates.sharpe}`,
      observed: m.sharpe === null ? "pocos días" : m.sharpe.toFixed(2),
      pass: m.sharpe === null ? null : m.sharpe > gates.sharpe,
    },
    {
      id: "DRAWDOWN",
      label: "Drawdown máximo",
      required: `< ${gates.maxDrawdownPct}%`,
      observed:
        m.maxDrawdownPct === null ? "falta el tamaño de la cuenta" : `${m.maxDrawdownPct.toFixed(1)}%`,
      pass: m.maxDrawdownPct === null ? null : m.maxDrawdownPct < gates.maxDrawdownPct,
    },
  ];

  const passed = criteria.filter((c) => c.pass === true).length;
  const unknown = criteria.filter((c) => c.pass === null).length;

  let verdict: GateVerdict;
  if (m.trades === 0) verdict = "SIN_DATOS";
  else if (!muestra) verdict = "RETENIDO";
  else if (unknown > 0) verdict = "SIN_DATOS";
  else verdict = passed === criteria.length ? "GO" : "RETENIDO";

  return { criteria, passed, total: criteria.length, verdict, summary: resumen(verdict, m, gates, passed, criteria.length) };
}

function resumen(
  verdict: GateVerdict,
  m: BotMetrics,
  gates: PortfolioSettings["gates"],
  passed: number,
  total: number,
): string {
  if (m.trades === 0) return "Sin operaciones todavía: la puerta no tiene nada que mirar.";
  if (m.trades < gates.minTrades) {
    return `Retenido: ${m.trades} operaciones no demuestran nada, hacen falta ${gates.minTrades}. Puede haber sido suerte.`;
  }
  if (verdict === "SIN_DATOS") return `Faltan datos para ${total - passed} criterio(s). Ver cuáles.`;
  if (verdict === "GO") return `Puerta superada: ${passed}/${total}. Puede ascender.`;
  return `Retenido: ${passed}/${total} criterios.`;
}
