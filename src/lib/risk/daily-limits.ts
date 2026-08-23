import { Decimal } from "decimal.js";

/**
 * Si el día de hoy ya se pasó de los límites que te pusiste.
 *
 * `max_daily_loss` y `max_trades_per_day` se podían configurar desde el
 * principio y no disparaban absolutamente nada. Un límite que no avisa no es
 * un límite: es una nota. Y son justo los dos números que existen para el
 * momento en que peor se piensa -- después de perder, cuando la tentación es
 * seguir operando para recuperarlo.
 *
 * Se avisa **al alcanzarlo, no al pasarse**: pasarse ya es tarde. El aviso
 * llega en cuanto la pérdida del día iguala el tope, que es el último momento
 * en que la decisión de parar todavía sirve de algo.
 *
 * Puro para poder probar los bordes -- justo en el límite, un día sin
 * operaciones, un tope sin configurar -- sin montar una jornada entera.
 */

export type LimitBreach = "PERDIDA_DIARIA" | "OPERACIONES_DIARIAS";

export interface DailyLimitStatus {
  breaches: LimitBreach[];
  /** Pérdida del día en positivo; cero si el día va en verde. */
  lossToday: string;
  tradesClosedToday: number;
  /** Qué contarle a una persona, o null si no hay nada que contar. */
  message: string | null;
}

export function evaluateDailyLimits(params: {
  /** Resultado neto de cada operación cerrada hoy, en moneda de cuenta. */
  netPnlsToday: (string | number | null)[];
  /** El tope de pérdida diaria configurado, en positivo. Null si no hay. */
  maxDailyLoss: string | number | null;
  /** El tope de operaciones al día. Null si no hay. */
  maxTradesPerDay: number | null;
}): DailyLimitStatus {
  const cerradas = params.netPnlsToday.filter((p) => p !== null && p !== undefined);
  const total = cerradas.reduce((sum, p) => sum.plus(new Decimal(p ?? 0)), new Decimal(0));

  // La pérdida en positivo: comparar «-600 <= -500» se lee al revés que
  // «600 >= 500», y este es un sitio donde leer al revés cuesta dinero.
  const lossToday = total.isNegative() ? total.abs() : new Decimal(0);

  const breaches: LimitBreach[] = [];

  const topePerdida = parsePositive(params.maxDailyLoss);
  if (topePerdida !== null && lossToday.greaterThanOrEqualTo(topePerdida)) {
    breaches.push("PERDIDA_DIARIA");
  }

  const topeOperaciones = params.maxTradesPerDay;
  if (
    topeOperaciones !== null &&
    Number.isFinite(topeOperaciones) &&
    topeOperaciones > 0 &&
    cerradas.length >= topeOperaciones
  ) {
    breaches.push("OPERACIONES_DIARIAS");
  }

  return {
    breaches,
    lossToday: lossToday.toString(),
    tradesClosedToday: cerradas.length,
    message: describe(breaches, lossToday, topePerdida, cerradas.length, topeOperaciones),
  };
}

function describe(
  breaches: LimitBreach[],
  loss: Decimal,
  maxLoss: Decimal | null,
  trades: number,
  maxTrades: number | null,
): string | null {
  if (breaches.length === 0) return null;

  const partes: string[] = [];

  if (breaches.includes("PERDIDA_DIARIA") && maxLoss) {
    partes.push(
      `Llevas ${loss.toFixed(2)} de pérdida hoy y tu tope diario son ${maxLoss.toFixed(2)}.`,
    );
  }
  if (breaches.includes("OPERACIONES_DIARIAS") && maxTrades) {
    partes.push(`Llevas ${trades} operaciones cerradas hoy y tu tope son ${maxTrades}.`);
  }

  // Sin sermón: el límite lo pusiste tú, en frío, y esto sólo te lo recuerda
  // en el momento en el que cuesta acordarse.
  partes.push("Lo decidiste tú en frío; hoy sólo te lo recuerda.");

  return partes.join(" ");
}

function parsePositive(value: string | number | null): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = new Decimal(value).abs();
    return parsed.isFinite() && parsed.greaterThan(0) ? parsed : null;
  } catch {
    return null;
  }
}
