import { DateTime } from "luxon";

/**
 * Whether what the app is showing can still be trusted as current.
 *
 * This exists because of a real failure: a position was closed on Coinbase
 * and the dashboard kept showing it open for days. Nothing was miscomputed
 * -- the reconstruction engine was faithfully reporting the only fills it
 * had ever been given, because no sync had run since. The defect was that
 * the app presented stale state with the same confidence as fresh state.
 *
 * An open position is the case where this matters most: a closed trade's
 * figures are final and being a day behind changes nothing, but an "open"
 * position that is actually closed is a lie about the present.
 */
export type SyncFreshness = "FRESH" | "LATE" | "STALE" | "NEVER";

export interface SyncHealth {
  freshness: SyncFreshness;
  /** Whole minutes since the last successful sync, or null if there has never been one. */
  minutesSince: number | null;
  /** Ready to render, e.g. "hace 5 días". */
  ago: string | null;
  message: string;
}

/**
 * Late at 3 intervals, stale at 12.
 *
 * Multiples of the user's configured interval rather than fixed clock
 * times: someone syncing every 5 minutes and someone syncing hourly have
 * very different ideas of "late", and hardcoding either would cry wolf for
 * one of them. The floor keeps a 1-minute interval from flagging as late
 * after 3 minutes, which would be noise.
 */
const LATE_MULTIPLE = 3;
const STALE_MULTIPLE = 12;
const MIN_LATE_MINUTES = 15;

export function evaluateSyncHealth(params: {
  lastSuccessAt: string | null;
  intervalMinutes: number;
  autoSyncEnabled: boolean;
  now?: Date;
}): SyncHealth {
  const { lastSuccessAt, intervalMinutes, autoSyncEnabled } = params;
  const now = params.now ?? new Date();

  if (lastSuccessAt === null) {
    return {
      freshness: "NEVER",
      minutesSince: null,
      ago: null,
      message: "Nunca se ha sincronizado con Coinbase, así que esta página no refleja tu cuenta real todavía.",
    };
  }

  const then = DateTime.fromISO(lastSuccessAt, { zone: "utc" });
  if (!then.isValid) {
    return {
      freshness: "NEVER",
      minutesSince: null,
      ago: null,
      message: "No se puede determinar cuándo fue la última sincronización.",
    };
  }

  const minutesSince = Math.max(Math.floor(now.getTime() / 60000 - then.toMillis() / 60000), 0);
  const ago = then.toRelative({ base: DateTime.fromJSDate(now), locale: "es" });

  const lateAfter = Math.max(intervalMinutes * LATE_MULTIPLE, MIN_LATE_MINUTES);
  const staleAfter = Math.max(intervalMinutes * STALE_MULTIPLE, MIN_LATE_MINUTES * 2);

  // Auto-sync being off is not a malfunction, but it does mean nothing will
  // ever catch a close on its own -- so it is said plainly rather than
  // dressed up as a delay.
  const offNote = autoSyncEnabled
    ? ""
    : " La sincronización automática está desactivada, así que no se actualizará sola.";

  if (minutesSince >= staleAfter) {
    return {
      freshness: "STALE",
      minutesSince,
      ago,
      message: `La última sincronización con Coinbase fue ${ago}. Lo que ves aquí es de ese momento: una posición cerrada desde entonces seguirá apareciendo como abierta.${offNote}`,
    };
  }

  if (minutesSince >= lateAfter) {
    return {
      freshness: "LATE",
      minutesSince,
      ago,
      message: `La última sincronización fue ${ago}, más tarde de lo previsto.${offNote}`,
    };
  }

  return {
    freshness: "FRESH",
    minutesSince,
    ago,
    message: `Sincronizado ${ago}.`,
  };
}
