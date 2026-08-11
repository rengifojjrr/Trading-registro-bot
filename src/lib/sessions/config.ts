/**
 * Session window definitions. These are a *convention*, not a fact Coinbase
 * or any exchange publishes -- they mirror the widely-used retail-trading
 * definition of the four major FX financial-center sessions (the same
 * framework commonly taught for forex, applied here to Bitcoin futures as
 * a liquidity/volatility-regime proxy, since crypto itself trades 24/7).
 * If you use different boundary hours, change them here; nothing else in
 * the app should hardcode a session hour.
 *
 * Hours are LOCAL to each city's IANA zone and checked against Luxon after
 * converting the trade's UTC instant into that zone -- this is what makes
 * DST handling correct without any manual UTC-offset math or fixed UTC
 * ranges baked in for the whole year.
 */

export type SessionLabel =
  | "SYDNEY"
  | "SYDNEY_TOKYO_OVERLAP"
  | "TOKYO"
  | "TOKYO_LONDON_OVERLAP"
  | "LONDON"
  | "LONDON_NEW_YORK_OVERLAP"
  | "NEW_YORK"
  | "OFF_SESSION";

export interface SessionWindow {
  zone: string; // IANA timezone
  startHour: number; // local time, 0-23, inclusive
  endHour: number; // local time, 0-23, exclusive
}

export const SESSION_WINDOWS: Record<"SYDNEY" | "TOKYO" | "LONDON" | "NEW_YORK", SessionWindow> = {
  SYDNEY: { zone: "Australia/Sydney", startHour: 8, endHour: 17 },
  TOKYO: { zone: "Asia/Tokyo", startHour: 9, endHour: 18 },
  LONDON: { zone: "Europe/London", startHour: 8, endHour: 17 },
  NEW_YORK: { zone: "America/New_York", startHour: 8, endHour: 17 },
};
