import { Decimal } from "decimal.js";
import { z } from "zod";

import type { Direction } from "./margin";

/**
 * Reads the REAL initial-margin and funding data Coinbase already returns
 * from GET /products/{id} (synced into products.raw_metadata by
 * refreshProductSpec, see lib/sync/orchestrator.ts) -- never a guess or a
 * user-entered value. Only future_product_details carries these fields;
 * spot products, Notion-imported synthetic products, and any row that
 * hasn't synced this shape yet all safely parse to null so callers fall
 * back to asking the user instead of computing on invented numbers.
 */

const marginRateSchema = z.object({
  long_margin_rate: z.string(),
  short_margin_rate: z.string(),
});

const futureProductDetailsSchema = z.object({
  intraday_margin_rate: marginRateSchema.optional(),
  overnight_margin_rate: marginRateSchema.optional(),
  funding_rate: z.string().optional(),
  // e.g. "3600s" -- Coinbase's own duration-string format for this field.
  funding_interval: z.string().optional(),
});

const productMetadataSchema = z.object({
  future_product_details: futureProductDetailsSchema.optional(),
});

export interface LiveMarginRates {
  /** Fraction, e.g. "0.1000185" for ~10%. */
  intradayMarginRate: string;
  overnightMarginRate: string;
  fundingRatePerHour: string;
}

function parseIntervalSeconds(interval: string | undefined): number | null {
  if (!interval) return null;
  const match = /^(\d+)s$/.exec(interval);
  return match ? Number(match[1]) : null;
}

export function extractLiveMarginRates(rawMetadata: unknown, direction: Direction): LiveMarginRates | null {
  const parsed = productMetadataSchema.safeParse(rawMetadata);
  if (!parsed.success) return null;

  const fpd = parsed.data.future_product_details;
  if (!fpd?.intraday_margin_rate || !fpd.overnight_margin_rate || !fpd.funding_rate) return null;

  const intervalSeconds = parseIntervalSeconds(fpd.funding_interval) ?? 3600;
  // Skip the divide/multiply round-trip in the (default, and by far most
  // common) exactly-hourly case -- Decimal division isn't always exact, so
  // dividing then multiplying back by the same 3600 can lose precision in
  // the last digit even though the math is a no-op.
  const fundingRatePerHour =
    intervalSeconds === 3600
      ? fpd.funding_rate
      : new Decimal(fpd.funding_rate).dividedBy(intervalSeconds).times(3600).toString();

  return {
    intradayMarginRate:
      direction === "LONG" ? fpd.intraday_margin_rate.long_margin_rate : fpd.intraday_margin_rate.short_margin_rate,
    overnightMarginRate:
      direction === "LONG" ? fpd.overnight_margin_rate.long_margin_rate : fpd.overnight_margin_rate.short_margin_rate,
    fundingRatePerHour,
  };
}

export interface MarginCheckInput {
  notional: string;
  /** capital - reserve, the same "usable" figure margin.ts's sizing functions use. */
  usableCapital: string;
  intradayMarginRate: string;
  overnightMarginRate: string;
}

export interface MarginCheckResult {
  intradayMargin: string;
  overnightMargin: string;
  passesIntraday: boolean;
  passesOvernight: boolean;
}

/**
 * Direct port of the uploaded prototype's "Chequeo de margen" check:
 * does the position's REAL Coinbase initial-margin requirement (day and
 * night) actually fit inside the usable capital -- independent of, and a
 * stricter/more immediate constraint than, the survivability risk-price
 * model in margin.ts. Overnight IM is typically far higher than intraday
 * (funding/risk-managed venues charge more to hold futures across
 * sessions), so a position sized fine for intraday can still fail this
 * check for overnight.
 */
export function checkInitialMarginRequirement(input: MarginCheckInput): MarginCheckResult {
  const notional = new Decimal(input.notional);
  const usable = new Decimal(input.usableCapital);
  const intradayMargin = notional.times(input.intradayMarginRate);
  const overnightMargin = notional.times(input.overnightMarginRate);

  return {
    intradayMargin: intradayMargin.toString(),
    overnightMargin: overnightMargin.toString(),
    passesIntraday: intradayMargin.lte(usable),
    passesOvernight: overnightMargin.lte(usable),
  };
}
