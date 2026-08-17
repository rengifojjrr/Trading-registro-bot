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

/**
 * NO_POSITION is the most serious of these, not the mildest: it means this
 * app is showing an open position that Coinbase says does not exist.
 */
export type DriftSeverity = "OK" | "WATCH" | "ALARM" | "NO_POSITION";

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

/**
 * The check for a position this app believes in and Coinbase does not.
 *
 * This was originally treated as "nothing to compare against" and the panel
 * hid itself. That was exactly backwards, and it cost a real user a real
 * confusion: the app showed a phantom short of 1 contract after a close,
 * and the one safety net built to catch that stayed silent because Coinbase
 * reported no position at all.
 *
 * A missing comparison is not the same as a missing position. If we claim
 * to be in the market and the exchange says we are flat, one of the two is
 * wrong -- and it is never the exchange.
 */
export function evaluateMissingPosition(params: {
  /** Size this app believes is still open. Zero or less means we agree there is nothing. */
  ourSize: string | number;
}): DriftResult | null {
  const ourSize = new Decimal(params.ourSize);
  if (!ourSize.abs().greaterThan(0)) return null;

  return {
    severity: "NO_POSITION",
    difference: "0",
    differencePct: null,
    message:
      "Coinbase no reporta ninguna posición abierta en este producto, pero esta aplicación sí. " +
      "Casi siempre significa que falta algún fill en el histórico y el motor dejó un resto sin cerrar. " +
      "Revisa la conciliación: la aplicación se equivoca, no el exchange.",
  };
}
