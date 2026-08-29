import { Decimal } from "decimal.js";

import type { SimulatedTrade } from "./engine";

/**
 * La estrategia contra lo que hiciste tú.
 *
 * Es la pregunta que ninguna plataforma de fuera puede contestar, porque no
 * tiene tus operaciones: **en los mismos días, ¿qué habría hecho la regla y
 * qué hiciste tú?**
 *
 * Se compara por día y no operación a operación a propósito. Emparejar
 * operaciones simuladas con reales sería inventarse una correspondencia --
 * ¿es la mía de las 10:14 «la misma» que la suya de las 10:30? -- y de esa
 * correspondencia inventada saldrían todas las conclusiones. El día es una
 * unidad que existe de verdad en los dos lados.
 *
 * Puro.
 */

export interface RealTradeDay {
  /** Fecha local, YYYY-MM-DD. */
  date: string;
  /** P&L neto realizado ese día, como cadena decimal. */
  netPnl: string;
  trades: number;
}

export interface DayComparison {
  date: string;
  realNet: string;
  realTrades: number;
  strategyNet: string;
  strategyTrades: number;
  /** Estrategia menos realidad: positivo, la regla lo habría hecho mejor. */
  difference: string;
}

export interface ComparisonSummary {
  days: DayComparison[];
  /** Días en que la estrategia habría ganado más que tú. */
  daysStrategyBetter: number;
  daysYouBetter: number;
  daysEqual: number;
  totalReal: string;
  totalStrategy: string;
  totalDifference: string;
  /**
   * Días en que tú operaste y la regla no.
   *
   * Es la cifra que más dice de un diario con FOMO: operaciones que no
   * estaban en ningún plan.
   */
  daysYouTradedAndRuleDidNot: number;
  /** Y al revés: oportunidades de la regla que te saltaste. */
  daysRuleTradedAndYouDidNot: number;
}

/** Del instante de cierre al día local, para poder agrupar. */
export function dayOf(unixSeconds: number, timeZone: string): string {
  // `en-CA` da directamente YYYY-MM-DD, que es lo que hace falta para
  // agrupar y ordenar sin volver a formatear.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

export function compareToReal(
  simuladas: SimulatedTrade[],
  netPorSimulada: string[],
  real: RealTradeDay[],
  timeZone: string,
): ComparisonSummary {
  const porDiaEstrategia = new Map<string, { net: Decimal; trades: number }>();

  simuladas.forEach((simulada, i) => {
    const neto = netPorSimulada[i];
    if (neto === undefined) return;
    // Sin cierre no hay día al que asignarla.
    if (simulada.exitTime === 0) return;

    const dia = dayOf(simulada.exitTime, timeZone);
    const actual = porDiaEstrategia.get(dia) ?? { net: new Decimal(0), trades: 0 };
    porDiaEstrategia.set(dia, {
      net: actual.net.plus(neto),
      trades: actual.trades + 1,
    });
  });

  const porDiaReal = new Map(real.map((d) => [d.date, d]));

  // La unión de los dos: un día en que sólo operó uno de los dos es
  // justamente el caso interesante, y quedarse con la intersección lo
  // escondería.
  const todosLosDias = [...new Set([...porDiaEstrategia.keys(), ...porDiaReal.keys()])].sort();

  const days: DayComparison[] = todosLosDias.map((date) => {
    const est = porDiaEstrategia.get(date);
    const rl = porDiaReal.get(date);
    const estNet = est?.net ?? new Decimal(0);
    const realNet = new Decimal(rl?.netPnl ?? 0);

    return {
      date,
      realNet: realNet.toFixed(2),
      realTrades: rl?.trades ?? 0,
      strategyNet: estNet.toFixed(2),
      strategyTrades: est?.trades ?? 0,
      difference: estNet.minus(realNet).toFixed(2),
    };
  });

  const cuenta = (predicado: (d: DayComparison) => boolean) => days.filter(predicado).length;

  return {
    days,
    daysStrategyBetter: cuenta((d) => Number(d.difference) > 0),
    daysYouBetter: cuenta((d) => Number(d.difference) < 0),
    daysEqual: cuenta((d) => Number(d.difference) === 0),
    totalReal: days.reduce((a, d) => a.plus(d.realNet), new Decimal(0)).toFixed(2),
    totalStrategy: days.reduce((a, d) => a.plus(d.strategyNet), new Decimal(0)).toFixed(2),
    totalDifference: days.reduce((a, d) => a.plus(d.difference), new Decimal(0)).toFixed(2),
    daysYouTradedAndRuleDidNot: cuenta((d) => d.realTrades > 0 && d.strategyTrades === 0),
    daysRuleTradedAndYouDidNot: cuenta((d) => d.strategyTrades > 0 && d.realTrades === 0),
  };
}
