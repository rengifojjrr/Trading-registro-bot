import { Decimal } from "decimal.js";

/**
 * Closed vocabularies for the journal's planning fields.
 *
 * These were free text, which makes them impossible to group: "cerca de
 * resistencia", "en resistencia diaria" and "resistencia" are the same
 * observation typed three ways, and no analysis can tell that. A fixed list
 * is worth more than expressiveness here -- the point of writing it down is
 * to be able to ask later which setups actually made money.
 *
 * Anything already stored that is not on a list stays selectable in the
 * form rather than vanishing, so importing older free text loses nothing.
 */
export const HTF_BIAS_OPTIONS = [
  "Alcista",
  "Bajista",
  "Lateral",
  "Sin sesgo claro",
] as const;

export const SR_PROXIMITY_OPTIONS = [
  "En soporte",
  "En resistencia",
  "Entre niveles",
  "Rompiendo resistencia",
  "Perdiendo soporte",
  "Lejos de cualquier nivel",
] as const;

/**
 * 1-5 with words attached. A bare number invites drifting standards; a
 * label makes today's 4 mean the same as last month's 4.
 */
export const RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 -- Muy mal" },
  { value: 2, label: "2 -- Mal" },
  { value: 3, label: "3 -- Aceptable" },
  { value: 4, label: "4 -- Bien" },
  { value: 5, label: "5 -- Muy bien" },
];

export type PriceUnit = "PRICE" | "PERCENT";

/**
 * Turns a stop/target typed as a percentage into the actual price.
 *
 * Percentages are how most people think about a stop ("I'll risk 1%"), but
 * a price is what the rest of the app can compare against fills, so the
 * percentage is converted at entry and the price is what gets stored. The
 * direction matters: 1% below entry is a stop on a long and a target on a
 * short.
 *
 * Returns null when it cannot be computed rather than guessing -- an
 * imported trade with no entry price has nothing to take a percentage of.
 */
export function resolvePlannedPrice(params: {
  raw: string;
  unit: PriceUnit;
  entryPrice: string | number | null;
  direction: "LONG" | "SHORT";
  kind: "STOP" | "TARGET";
}): string | null {
  const { raw, unit, entryPrice, direction, kind } = params;
  if (raw.trim() === "") return null;

  const value = new Decimal(raw);
  if (unit === "PRICE") return value.toString();

  if (entryPrice === null || entryPrice === "") return null;
  const entry = new Decimal(entryPrice);
  if (entry.isZero()) return null;

  // A stop sits against the position and a target sits with it; on a short
  // both flip.
  const goesDown = kind === "STOP" ? direction === "LONG" : direction === "SHORT";
  const factor = goesDown ? new Decimal(1).minus(value.dividedBy(100)) : new Decimal(1).plus(value.dividedBy(100));

  return entry.times(factor).toDecimalPlaces(8).toString();
}
