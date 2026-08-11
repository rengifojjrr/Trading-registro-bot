import { DateTime } from "luxon";

import { SESSION_WINDOWS, type SessionLabel } from "./config";

/**
 * Classifies a UTC instant into one of the eight session labels, anchored
 * only to that single instant (a trade's opened_at) -- a swing trade held
 * across sessions still gets one label, by design (see docs/DATABASE.md).
 *
 * Deliberately uses Luxon over manual UTC-offset math specifically because
 * of this function: converting the same instant into each city's local
 * time via its IANA zone (Australia/Sydney, Asia/Tokyo, Europe/London,
 * America/New_York) makes DST correctness automatic, including that
 * Sydney's DST (AEDT, Southern Hemisphere) is INVERTED relative to London
 * and New York's -- Sydney is on daylight time in the northern winter and
 * standard time in the northern summer. See classify.test.ts.
 */
export function classifySession(utcInstant: Date | string): SessionLabel {
  const instant =
    typeof utcInstant === "string"
      ? DateTime.fromISO(utcInstant, { zone: "utc" })
      : DateTime.fromJSDate(utcInstant, { zone: "utc" });

  if (!instant.isValid) {
    throw new Error(`classifySession received an invalid timestamp: ${utcInstant}`);
  }

  const sydney = isWithinLocalWindow(instant, SESSION_WINDOWS.SYDNEY);
  const tokyo = isWithinLocalWindow(instant, SESSION_WINDOWS.TOKYO);
  const london = isWithinLocalWindow(instant, SESSION_WINDOWS.LONDON);
  const newYork = isWithinLocalWindow(instant, SESSION_WINDOWS.NEW_YORK);

  // Order matters: check the named 2-session overlaps before falling back
  // to a single session, and check London/New York (the highest-volume
  // overlap) first among the overlaps. The Sydney+NewYork pair is checked
  // but not given its own named label -- with the SESSION_WINDOWS above
  // these two sessions only ever touch at their boundary, never
  // meaningfully overlap, and retail convention doesn't name this pair the
  // way it names the other three.
  if (london && newYork) return "LONDON_NEW_YORK_OVERLAP";
  if (tokyo && london) return "TOKYO_LONDON_OVERLAP";
  if (sydney && tokyo) return "SYDNEY_TOKYO_OVERLAP";
  if (sydney && newYork) return "SYDNEY";

  if (sydney) return "SYDNEY";
  if (tokyo) return "TOKYO";
  if (london) return "LONDON";
  if (newYork) return "NEW_YORK";

  return "OFF_SESSION";
}

function isWithinLocalWindow(
  instantUtc: DateTime,
  window: { zone: string; startHour: number; endHour: number },
): boolean {
  const local = instantUtc.setZone(window.zone);
  const minutesSinceMidnight = local.hour * 60 + local.minute;
  return (
    minutesSinceMidnight >= window.startHour * 60 && minutesSinceMidnight < window.endHour * 60
  );
}
