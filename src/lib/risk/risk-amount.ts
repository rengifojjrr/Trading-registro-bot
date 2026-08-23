/**
 * Qué significa el riesgo que apuntas, en porcentaje y en erres.
 *
 * El campo «Riesgo» se guardaba en la moneda de la cuenta y no se usaba para
 * nada más: ni salía en ninguna cifra, ni se comparaba con el límite que
 * tienes configurado, ni servía para leer el resultado. Un número suelto en
 * dólares no dice si arriesgaste mucho -- cien dólares es prudente con diez
 * mil de capital y temerario con quinientos -- y por eso hay que traducirlo.
 *
 * Las dos traducciones que valen:
 *
 * - **Porcentaje del capital**: pone el número en escala. Es la forma en que
 *   se piensa el riesgo de verdad, y la única que se puede comparar entre una
 *   operación de enero y una de agosto con la cuenta en otro tamaño.
 * - **Erres**: el resultado dividido entre lo que arriesgaste. Es lo que hace
 *   comparables dos operaciones de tamaños distintos: ganar 300 arriesgando
 *   100 y ganar 30 arriesgando 10 son la misma operación (3R), y en dólares
 *   parecen una diez veces mejor que la otra.
 *
 * Puro y sin base de datos: recibe los números ya leídos.
 */

export interface RiskReading {
  /** Qué parte del capital pusiste en juego, en tanto por ciento. */
  percentOfCapital: number | null;
  /** Si eso pasa del límite que tienes configurado. */
  overLimit: boolean;
  /** El resultado en múltiplos de lo arriesgado. Negativo si perdiste. */
  rMultiple: number | null;
}

export function readRisk(params: {
  /** Lo que apuntaste que arriesgabas, en moneda de cuenta. */
  riskAmount: number | null | undefined;
  /** El capital de la cuenta, de Configuración. */
  accountSize: number | null | undefined;
  /** El tope por operación que te pusiste, en tanto por ciento. */
  maxRiskPct: number | null | undefined;
  /** El resultado neto de la operación, si ya cerró. */
  netPnl: number | null | undefined;
}): RiskReading {
  const risk = toPositive(params.riskAmount);
  const capital = toPositive(params.accountSize);

  const percentOfCapital =
    risk !== null && capital !== null ? round((risk / capital) * 100, 2) : null;

  const limit = toPositive(params.maxRiskPct);
  const overLimit = percentOfCapital !== null && limit !== null && percentOfCapital > limit;

  // Sin riesgo apuntado no hay erres. Cero tampoco vale: dividir entre cero
  // daría infinito, y «infinitas erres» no significa nada.
  const pnl = toFinite(params.netPnl);
  const rMultiple = risk !== null && pnl !== null ? round(pnl / risk, 2) : null;

  return { percentOfCapital, overLimit, rMultiple };
}

/** «0,8 % del capital» -- o nada, si falta el capital para poder decirlo. */
export function formatPercentOfCapital(percent: number | null): string | null {
  if (percent === null) return null;
  return `${percent.toString().replace(".", ",")} % del capital`;
}

/** «+2,4R», «−1R». El signo va delante porque es lo primero que se mira. */
export function formatRMultiple(r: number | null): string | null {
  if (r === null) return null;
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${Math.abs(r).toString().replace(".", ",")}R`;
}

function toPositive(value: number | null | undefined): number | null {
  const parsed = toFinite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function toFinite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Lo que arriesgabas de verdad, deducido del stop en vez de tecleado.
 *
 * El importe de riesgo era un campo que había que rellenar a mano, así que
 * casi nunca estaba, y sin él no hay ni porcentaje ni erres. Pero el dato ya
 * existe en otra forma: si apuntaste dónde ponías el stop, lo que arriesgabas
 * es la distancia del precio de entrada al stop, por los contratos, por el
 * tamaño de contrato. No hay nada que estimar.
 *
 * Se calcula sobre el tamaño máximo alcanzado, no sobre lo que quedó abierto:
 * el riesgo lo corriste con toda la posición puesta.
 *
 * Devuelve `null` cuando el stop está al otro lado de la entrada -- un stop
 * por encima del precio en una compra no es un stop, es un objetivo mal
 * apuntado, y tratarlo como riesgo daría una cifra con el signo cambiado.
 */
export function riskFromStop(params: {
  direction: "LONG" | "SHORT";
  entryWap: number | null | undefined;
  stopLossPrice: number | null | undefined;
  size: number | null | undefined;
  contractSize: number | null | undefined;
}): number | null {
  const entry = toPositive(params.entryWap);
  const stop = toPositive(params.stopLossPrice);
  const size = toPositive(params.size);
  const contract = toPositive(params.contractSize);

  if (entry === null || stop === null || size === null || contract === null) return null;

  const distance = params.direction === "LONG" ? entry - stop : stop - entry;
  if (!(distance > 0)) return null;

  return distance * size * contract;
}
