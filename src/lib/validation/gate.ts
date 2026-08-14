/**
 * The rule that decides whether automatic syncing may be turned on.
 *
 * Kept as a pure function so the exact criterion is testable and stated in
 * one place: docs/VALIDATION_CHECKLIST.md requires 20-50 trades checked
 * by hand against Coinbase with *zero* material differences. A single
 * recorded mismatch blocks the gate -- the point of the check is to catch
 * a systematic reconstruction error, and "20 verified, 1 wrong" is
 * evidence of exactly that, not a rounding quibble.
 */

export const REQUIRED_VERIFICATIONS = 20;

export interface VerificationTally {
  /** Trades checked and confirmed to match Coinbase. */
  matching: number;
  /** Trades checked and found NOT to match. Any of these blocks the gate. */
  mismatching: number;
  /** Closed trades that exist and could still be checked. */
  available: number;
}

export interface GateResult {
  canEnable: boolean;
  /** Why not, in the user's language. Null when the gate is open. */
  blockedReason: string | null;
  /** 0-100, for a progress indicator. Capped at 100. */
  progressPct: number;
  remaining: number;
}

export function evaluateValidationGate(tally: VerificationTally): GateResult {
  const remaining = Math.max(0, REQUIRED_VERIFICATIONS - tally.matching);
  const progressPct = Math.min(100, (tally.matching / REQUIRED_VERIFICATIONS) * 100);

  if (tally.mismatching > 0) {
    return {
      canEnable: false,
      blockedReason: `Hay ${tally.mismatching} operación(es) marcadas como diferentes a Coinbase. Resuélvelas antes de activar la sincronización automática -- una diferencia sistemática es justo lo que esta revisión existe para detectar.`,
      progressPct,
      remaining,
    };
  }

  if (tally.matching < REQUIRED_VERIFICATIONS) {
    // Being honest about an account that simply doesn't have enough
    // history yet, rather than implying the user is being slow.
    const reason =
      tally.available < REQUIRED_VERIFICATIONS
        ? `Necesitas revisar ${REQUIRED_VERIFICATIONS} operaciones cerradas y por ahora solo tienes ${tally.available}. Sigue operando (o importa tu histórico) y vuelve aquí.`
        : `Llevas ${tally.matching} de ${REQUIRED_VERIFICATIONS} operaciones revisadas.`;
    return { canEnable: false, blockedReason: reason, progressPct, remaining };
  }

  return { canEnable: true, blockedReason: null, progressPct: 100, remaining: 0 };
}
