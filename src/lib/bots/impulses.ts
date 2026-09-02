import { Decimal } from "decimal.js";

import { IMPULSE_EVALUATION_DAYS, IMPULSE_LABELS, type ImpulseAction } from "./types";

/**
 * El diario de impulsos, evaluado.
 *
 * El componente más peligroso del sistema no es un bot: es quien lo vigila.
 * Cada vez que pica apagar el bot que va mal, cerrar la operación que no
 * gusta o subir el tamaño porque el mes va bien, se apunta. A los siete días
 * se mira qué hizo el bot mientras tanto y sale la cifra: cuánto habría
 * costado hacerse caso.
 *
 * La cuenta es sencilla y se explica: apagar o cerrar habría dejado fuera
 * todo lo que el bot cerró esa semana; reducir a la mitad, la mitad. Subir el
 * tamaño no tiene un contrafactual limpio -- no se sabe cuánto se habría
 * subido ni durante cuánto -- así que se apunta y no se cuantifica. Los que
 * se ejecutaron tampoco: ahí ya no hay contrafactual, hay lo que pasó.
 *
 * Puro.
 */

export interface ImpulseRecord {
  id: string;
  botId: string | null;
  botName: string | null;
  action: ImpulseAction;
  note: string | null;
  executed: boolean;
  createdAt: string;
}

export type ImpulseStatus = "PENDIENTE" | "EVALUADO" | "EJECUTADO" | "SIN_CIFRA";

export const IMPULSE_STATUS_LABELS: Record<ImpulseStatus, string> = {
  PENDIENTE: "En espera",
  EVALUADO: "Evaluado",
  EJECUTADO: "Lo hiciste",
  SIN_CIFRA: "Sin cifra",
};

export interface ImpulseEvaluation {
  impulse: ImpulseRecord;
  status: ImpulseStatus;
  /** Cuándo se puede mirar. */
  evaluableAt: string;
  daysLeft: number;
  /** Operaciones que el bot cerró en la semana siguiente. */
  tradesAfter: number;
  /** Lo que el bot hizo en esa semana, neto. */
  netAfter: string;
  /**
   * Lo que habría costado hacer caso. Positivo: dinero que se habría dejado
   * de ganar. Negativo: dinero que se habría ahorrado (tenías razón).
   */
  cost: string | null;
  verdict: string;
}

const QUANTIFIABLE: Partial<Record<ImpulseAction, number>> = {
  APAGAR: 1,
  CERRAR: 1,
  REDUCIR: 0.5,
};

export function evaluateImpulse(
  impulse: ImpulseRecord,
  trades: { status: string; closedAt: string | null; netPnl: string | null }[],
  now: Date,
): ImpulseEvaluation {
  const desde = Date.parse(impulse.createdAt);
  const hasta = desde + IMPULSE_EVALUATION_DAYS * 86_400_000;
  const evaluableAt = new Date(hasta).toISOString();
  const daysLeft = Math.max(0, Math.ceil((hasta - now.getTime()) / 86_400_000));

  const despues = trades.filter((t) => {
    if (t.status !== "CLOSED" || !t.closedAt || t.netPnl === null) return false;
    const cierre = Date.parse(t.closedAt);
    return cierre > desde && cierre <= hasta;
  });
  const netAfter = despues.reduce((acc, t) => acc.plus(t.netPnl!), new Decimal(0));

  const base = {
    impulse,
    evaluableAt,
    daysLeft,
    tradesAfter: despues.length,
    netAfter: netAfter.toString(),
  };

  if (impulse.executed) {
    return {
      ...base,
      status: "EJECUTADO",
      cost: null,
      verdict: "Lo hiciste, así que no hay contrafactual: lo que pasó después ya es con tu decisión dentro.",
    };
  }

  if (now.getTime() < hasta) {
    return {
      ...base,
      status: "PENDIENTE",
      cost: null,
      verdict:
        daysLeft === 1
          ? "Se evalúa mañana."
          : `Se evalúa en ${daysLeft} días. Hasta entonces, no se toca.`,
    };
  }

  const fraccion = QUANTIFIABLE[impulse.action];
  if (fraccion === undefined) {
    return {
      ...base,
      status: "SIN_CIFRA",
      cost: null,
      verdict: `«${IMPULSE_LABELS[impulse.action]}» no tiene un contrafactual limpio. Queda apuntado, que es lo que importa.`,
    };
  }

  const cost = netAfter.times(fraccion);

  return {
    ...base,
    status: "EVALUADO",
    cost: cost.toString(),
    verdict: veredicto(cost, despues.length, impulse.action),
  };
}

function veredicto(cost: Decimal, trades: number, action: ImpulseAction): string {
  if (trades === 0) return "El bot no cerró nada en esos siete días. Ni ganaste ni perdiste por no hacerle caso.";
  const cifra = cost.abs().toFixed(2);
  const que = action === "REDUCIR" ? "Reducir a la mitad" : IMPULSE_LABELS[action];
  if (cost.greaterThan(0)) return `${que} habría costado ${cifra}. Multa que no pagaste.`;
  if (cost.lessThan(0)) return `Tenías razón: ${que.toLowerCase()} habría ahorrado ${cifra}.`;
  return "Habría dado igual.";
}

export interface ImpulseReport {
  total: number;
  executed: number;
  pending: number;
  evaluated: number;
  /** Suma de lo que habría costado hacer caso cuando el bot tenía razón. */
  avoided: string;
  /** Suma de lo que se habría ahorrado cuando tenías razón tú. */
  missed: string;
  /** El balance de no hacerse caso: `avoided - missed`. */
  balance: string;
  /** Veces que el bot tenía razón. */
  botWasRight: number;
  /** Veces que la tenías tú. */
  youWereRight: number;
}

export function impulseReport(evaluations: ImpulseEvaluation[]): ImpulseReport {
  let avoided = new Decimal(0);
  let missed = new Decimal(0);
  let botWasRight = 0;
  let youWereRight = 0;

  for (const e of evaluations) {
    if (e.status !== "EVALUADO" || e.cost === null) continue;
    const cost = new Decimal(e.cost);
    if (cost.greaterThan(0)) {
      avoided = avoided.plus(cost);
      botWasRight += 1;
    } else if (cost.lessThan(0)) {
      missed = missed.plus(cost.abs());
      youWereRight += 1;
    }
  }

  return {
    total: evaluations.length,
    executed: evaluations.filter((e) => e.status === "EJECUTADO").length,
    pending: evaluations.filter((e) => e.status === "PENDIENTE").length,
    evaluated: evaluations.filter((e) => e.status === "EVALUADO").length,
    avoided: avoided.toString(),
    missed: missed.toString(),
    balance: avoided.minus(missed).toString(),
    botWasRight,
    youWereRight,
  };
}
