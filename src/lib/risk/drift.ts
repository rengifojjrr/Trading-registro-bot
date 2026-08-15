import { Decimal } from "decimal.js";

/**
 * Compares the unrealised P&L this app computes against the figure Coinbase
 * reports for the same open position.
 *
 * This is the check that matters most, and the one that started this whole
 * project: the user's original complaint was that the shown profit "no es
 * ni cercana a la que está en tiempo real en Coinbase". A number being
 * slightly behind is normal -- prices move between two API calls. A number
 * being structurally wrong (bad multiplier, wrong direction, a fill missed)
 * shows up as a difference that does not shrink.
 *
 * Pure, so the thresholds are testable without touching Coinbase.
 */

/** Below this, a difference is indistinguishable from two calls landing at different prices. */
const TOLERANCE_PCT = 1;
/** Never alarm over small change on a small position -- percentages get loud near zero. */
const TOLERANCE_ABSOLUTE = 1;

export type DriftSeverity = "OK" | "WATCH" | "ALARM";

export interface DriftResult {
  severity: DriftSeverity;
  /** Ours minus theirs. Positive means this app is reporting more profit than Coinbase. */
  difference: string;
  /** Absolute difference as a percentage of Coinbase's figure. Null when theirs is zero. */
  differencePct: number | null;
  message: string;
}

export function evaluateUnrealizedDrift(params: {
  /** What this app computed. */
  ours: string | number;
  /** What Coinbase reports for the same position. */
  theirs: string | number;
}): DriftResult {
  const ours = new Decimal(params.ours);
  const theirs = new Decimal(params.theirs);
  const difference = ours.minus(theirs);
  const absDifference = difference.abs();

  const differencePct = theirs.isZero()
    ? null
    : absDifference.dividedBy(theirs.abs()).times(100).toNumber();

  if (absDifference.lte(TOLERANCE_ABSOLUTE)) {
    return {
      severity: "OK",
      difference: difference.toString(),
      differencePct,
      message: "Coincide con Coinbase.",
    };
  }

  if (differencePct !== null && differencePct <= TOLERANCE_PCT) {
    return {
      severity: "OK",
      difference: difference.toString(),
      differencePct,
      message: "Coincide con Coinbase dentro del margen normal entre dos consultas.",
    };
  }

  // A difference that is a clean multiple of the reported figure almost
  // always means the contract multiplier is wrong -- worth naming, because
  // it's the single most likely cause and the easiest to fix.
  const ratio = theirs.isZero() ? null : ours.dividedBy(theirs).toNumber();
  const looksLikeMultiplier =
    ratio !== null && Number.isFinite(ratio) && ratio > 0 && isNearWholeMultiple(ratio);

  const severity: DriftSeverity =
    differencePct !== null && differencePct > 10 ? "ALARM" : "WATCH";

  return {
    severity,
    difference: difference.toString(),
    differencePct,
    message: looksLikeMultiplier
      ? `La cifra calculada es ${ratio!.toFixed(2)}× la de Coinbase. Suele significar que el tamaño de contrato del producto está mal.`
      : "La cifra calculada no coincide con la de Coinbase. Revisa que no falte ningún fill.",
  };
}

/** True for something close to 2x, 10x, 100x… and their reciprocals. */
function isNearWholeMultiple(ratio: number): boolean {
  const candidates = [2, 5, 10, 100, 1000];
  return candidates.some(
    (c) => Math.abs(ratio - c) / c < 0.02 || Math.abs(ratio - 1 / c) * c < 0.02,
  );
}
