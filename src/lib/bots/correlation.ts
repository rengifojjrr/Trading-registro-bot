import { MIN_DAYS_FOR_CORRELATION, REDUNDANT_CORRELATION } from "./types";

/**
 * Cuánto se parecen dos bots por su P&L diario.
 *
 * Diez bots que ganan y pierden los mismos días no son diez bots: son uno con
 * diez veces el tamaño. La correlación es lo que dice si el portfolio está de
 * verdad repartido o sólo lo parece. Por encima de 0,5 dos bots son «medio
 * gemelos» y uno de los dos sobra, o se reparte el capital entre los dos como
 * si fueran uno.
 *
 * Se mide sobre el P&L por día natural, con los días sin operar a cero, y sólo
 * cuando hay bastantes días en común: veinte. Con menos, la cifra es una
 * anécdota y se deja a `null`.
 *
 * Puro.
 */

export interface CorrelationPair {
  a: string;
  b: string;
  /** Días naturales en los que los dos tenían histórico. */
  days: number;
  /** Pearson, -1 a 1. `null` sin días suficientes o sin variación. */
  rho: number | null;
  redundant: boolean;
}

export interface CorrelationMatrix {
  ids: string[];
  pairs: CorrelationPair[];
  /** La media de todas las correlaciones medidas. */
  mean: number | null;
  /** Los pares que se parecen demasiado. */
  redundant: CorrelationPair[];
}

export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  // Sin variación en alguna de las dos no hay correlación que medir: un bot
  // que no ganó ni perdió nada en el periodo no se parece ni deja de
  // parecerse a nadie.
  if (sxx === 0 || syy === 0) return null;

  const rho = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, rho));
}

/**
 * Las dos series sobre los mismos días.
 *
 * Sólo los días que están en las dos: comparar el enero de un bot con el
 * marzo de otro no dice nada de si se mueven juntos.
 */
export function alignDaily(
  a: Map<string, number>,
  b: Map<string, number>,
): { x: number[]; y: number[]; days: number } {
  const comunes = [...a.keys()].filter((dia) => b.has(dia)).sort();
  return {
    x: comunes.map((dia) => a.get(dia)!),
    y: comunes.map((dia) => b.get(dia)!),
    days: comunes.length,
  };
}

export function correlationMatrix(
  series: { id: string; daily: Map<string, number> }[],
): CorrelationMatrix {
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < series.length; i += 1) {
    for (let j = i + 1; j < series.length; j += 1) {
      const aligned = alignDaily(series[i].daily, series[j].daily);
      const rho = aligned.days >= MIN_DAYS_FOR_CORRELATION ? pearson(aligned.x, aligned.y) : null;
      pairs.push({
        a: series[i].id,
        b: series[j].id,
        days: aligned.days,
        rho,
        redundant: rho !== null && rho > REDUNDANT_CORRELATION,
      });
    }
  }

  const medidas = pairs.filter((p): p is CorrelationPair & { rho: number } => p.rho !== null);
  const mean =
    medidas.length > 0 ? medidas.reduce((acc, p) => acc + p.rho, 0) / medidas.length : null;

  return {
    ids: series.map((s) => s.id),
    pairs,
    mean,
    redundant: pairs.filter((p) => p.redundant),
  };
}

/** El par de dos bots, en el orden que sea. */
export function lookupPair(matrix: CorrelationMatrix, a: string, b: string): CorrelationPair | null {
  return (
    matrix.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) ?? null
  );
}
