/**
 * El Monte Carlo de un bot: su histórico barajado trescientas veces.
 *
 * El drawdown que un bot tuvo es uno de los muchos que podía haber tenido: si
 * las mismas operaciones hubieran llegado en otro orden, la caída habría sido
 * otra. Barajar el orden y medir la caída cada vez da la distribución de lo
 * que le puede pasar. El percentil 95 de esa distribución es el **contrato de
 * drawdown**: la cifra que se firma antes de darle dinero real. Si un día la
 * supera, no tiene mala suerte: está incumpliendo contrato.
 *
 * Determinista: la baraja usa un generador con semilla, así que dos personas
 * con el mismo histórico ven el mismo contrato, y el test también.
 *
 * Puro.
 */

export const MONTE_CARLO_RUNS = 300;
/** Con menos operaciones, barajar no da una distribución: da ruido. */
export const MIN_TRADES_FOR_MONTE_CARLO = 10;
/** El percentil que se firma. */
export const CONTRACT_PERCENTILE = 95;

export interface MonteCarloResult {
  runs: number;
  trades: number;
  /** El drawdown máximo en el orden real, en dinero. */
  observed: number;
  p50: number;
  p75: number;
  p95: number;
  worst: number;
  /** Los mismos, sobre el capital. `null` sin tamaño de cuenta. */
  observedPct: number | null;
  p50Pct: number | null;
  p75Pct: number | null;
  p95Pct: number | null;
  /** Qué parte de las barajadas cayó más que el orden real, 0-100. */
  worseThanObservedPct: number;
}

/** El mayor descenso desde un máximo de la curva acumulada, en positivo. */
export function maxDrawdown(sequence: number[]): number {
  let acumulado = 0;
  let pico = 0;
  let peor = 0;
  for (const v of sequence) {
    acumulado += v;
    if (acumulado > pico) pico = acumulado;
    const caida = pico - acumulado;
    if (caida > peor) peor = caida;
  }
  return peor;
}

/** mulberry32: pequeño, rápido y reproducible. Basta para barajar. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates sobre una copia. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Percentil por rango más cercano sobre una lista ya ordenada. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rango = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rango - 1))];
}

export function monteCarloDrawdown(
  netPnls: number[],
  accountSize: number | null,
  options: { runs?: number; seed?: number } = {},
): MonteCarloResult | null {
  if (netPnls.length < MIN_TRADES_FOR_MONTE_CARLO) return null;

  const runs = options.runs ?? MONTE_CARLO_RUNS;
  const random = mulberry32(options.seed ?? 20260902);

  const observed = maxDrawdown(netPnls);
  const caidas: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    caidas.push(maxDrawdown(shuffle(netPnls, random)));
  }
  caidas.sort((a, b) => a - b);

  const pct = (v: number) => (accountSize && accountSize > 0 ? (v / accountSize) * 100 : null);
  const p50 = percentile(caidas, 50);
  const p75 = percentile(caidas, 75);
  const p95 = percentile(caidas, CONTRACT_PERCENTILE);

  return {
    runs,
    trades: netPnls.length,
    observed,
    p50,
    p75,
    p95,
    worst: caidas[caidas.length - 1],
    observedPct: pct(observed),
    p50Pct: pct(p50),
    p75Pct: pct(p75),
    p95Pct: pct(p95),
    worseThanObservedPct: (caidas.filter((c) => c > observed).length / runs) * 100,
  };
}
