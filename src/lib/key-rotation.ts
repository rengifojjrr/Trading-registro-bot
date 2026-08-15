/**
 * How long the Coinbase key has been in use, in whole days.
 *
 * Lives in its own module rather than inline in the settings component:
 * reading the clock during a React render is impure, and the value is
 * plain domain logic rather than anything to do with rendering.
 */
export function keyAgeInDays(rotatedAt: string | null, now: Date = new Date()): number | null {
  if (rotatedAt === null) return null;
  const then = new Date(rotatedAt).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24));
}

/** Past this, the settings page starts asking for a rotation. */
export const STALE_AFTER_DAYS = 180;
