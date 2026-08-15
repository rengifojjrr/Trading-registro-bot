import { Decimal } from "decimal.js";

/**
 * Checks the commissions this app recorded for a month against the total on
 * the broker's own statement.
 *
 * Commissions are the quietest way for a P&L to be wrong. A missing fill
 * shows up as a missing trade and gets noticed; a commission that was never
 * recorded just makes every result look slightly better than it was, month
 * after month, with nothing on screen to suggest anything is off.
 *
 * The statement total is something only the user can supply, so this is a
 * comparison, not a fetch. Pure and testable.
 */

/** Under a cent of difference is rounding, not a missing charge. */
const TOLERANCE = new Decimal("0.01");

export type CoverageStatus = "MATCH" | "UNDER_RECORDED" | "OVER_RECORDED";

export interface CoverageResult {
  status: CoverageStatus;
  /** Recorded minus statement. Negative means the app is missing charges. */
  difference: string;
  differencePct: number | null;
  /** How much the missing (or excess) commission moves the month's net result. */
  impactOnNetPnl: string;
  message: string;
}

export function evaluateCommissionCoverage(params: {
  /** Sum of total_commissions over the month's trades. */
  recorded: string | number;
  /** What the broker's statement says was actually charged. */
  statement: string | number;
}): CoverageResult {
  const recorded = new Decimal(params.recorded);
  const statement = new Decimal(params.statement);
  const difference = recorded.minus(statement);
  const absDifference = difference.abs();

  const differencePct = statement.isZero()
    ? null
    : absDifference.dividedBy(statement.abs()).times(100).toNumber();

  // Under-recording inflates net P&L by exactly the amount missing, which
  // is the number the user actually cares about.
  const impactOnNetPnl = difference.negated().toString();

  if (absDifference.lte(TOLERANCE)) {
    return {
      status: "MATCH",
      difference: difference.toString(),
      differencePct,
      impactOnNetPnl: "0",
      message: "Las comisiones registradas cuadran con el estado de cuenta.",
    };
  }

  if (difference.isNegative()) {
    return {
      status: "UNDER_RECORDED",
      difference: difference.toString(),
      differencePct,
      impactOnNetPnl,
      message:
        "Faltan comisiones por registrar: tu P&L neto de ese mes está mostrando más ganancia de la real.",
    };
  }

  return {
    status: "OVER_RECORDED",
    difference: difference.toString(),
    differencePct,
    impactOnNetPnl,
    message:
      "Hay más comisiones registradas que en el estado de cuenta: tu P&L neto está mostrando menos ganancia de la real.",
  };
}
