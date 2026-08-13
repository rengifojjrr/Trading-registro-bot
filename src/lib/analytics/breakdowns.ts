import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

import type { SessionLabel } from "@/types/database";

/**
 * Pure "slice my results by X" aggregations. The app already classified
 * every trade's session and stores each one's timestamps and R multiple;
 * none of that was ever surfaced as a comparison, which is where the
 * actionable answers live ("I lose consistently in the Asian session",
 * "my Mondays are red").
 *
 * Every function here takes an already-filtered list and returns buckets
 * with an explicit sample size, because a bucket holding two trades must
 * never be presented with the same confidence as one holding fifty.
 */

export interface TradeForBreakdown {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  netPnl: string | null;
  session: SessionLabel | null;
  /** journal_entries.result_r -- the trader's own R multiple, absent unless they filled it in. */
  resultR: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  trades: number;
  wins: number;
  netPnl: string;
  /** Percentage 0-100, null when the bucket has no closed trades. */
  winRate: number | null;
  /** Average net P&L per closed trade in this bucket. Null when empty. */
  average: string | null;
}

function closedWithPnl(trades: TradeForBreakdown[]) {
  return trades.filter(
    (t): t is TradeForBreakdown & { netPnl: string } => t.status === "CLOSED" && t.netPnl !== null,
  );
}

function buildBucket(key: string, label: string, rows: (TradeForBreakdown & { netPnl: string })[]): Bucket {
  const netPnl = rows.reduce((sum, t) => sum.plus(t.netPnl), new Decimal(0));
  const wins = rows.filter((t) => new Decimal(t.netPnl).gt(0)).length;
  return {
    key,
    label,
    trades: rows.length,
    wins,
    netPnl: netPnl.toString(),
    winRate: rows.length > 0 ? (wins / rows.length) * 100 : null,
    average: rows.length > 0 ? netPnl.dividedBy(rows.length).toString() : null,
  };
}

const SESSION_ORDER: SessionLabel[] = [
  "SYDNEY",
  "SYDNEY_TOKYO_OVERLAP",
  "TOKYO",
  "TOKYO_LONDON_OVERLAP",
  "LONDON",
  "LONDON_NEW_YORK_OVERLAP",
  "NEW_YORK",
  "OFF_SESSION",
];

const SESSION_LABELS: Record<SessionLabel, string> = {
  SYDNEY: "Sídney",
  SYDNEY_TOKYO_OVERLAP: "Sídney / Tokio",
  TOKYO: "Tokio",
  TOKYO_LONDON_OVERLAP: "Tokio / Londres",
  LONDON: "Londres",
  LONDON_NEW_YORK_OVERLAP: "Londres / N. York",
  NEW_YORK: "Nueva York",
  OFF_SESSION: "Fuera de sesión",
};

/** Results grouped by trading session. Sessions with no trades are omitted rather than shown as empty rows. */
export function computeSessionBreakdown(trades: TradeForBreakdown[]): Bucket[] {
  const closed = closedWithPnl(trades);
  return SESSION_ORDER.flatMap((session) => {
    const rows = closed.filter((t) => t.session === session);
    return rows.length === 0 ? [] : [buildBucket(session, SESSION_LABELS[session], rows)];
  });
}

const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * Results grouped by weekday, in the user's own timezone -- a trade opened
 * at 23:00 New York is a different weekday in UTC, so bucketing on the raw
 * timestamp would quietly misattribute it.
 */
export function computeWeekdayBreakdown(trades: TradeForBreakdown[], timezone: string): Bucket[] {
  const closed = closedWithPnl(trades);
  return WEEKDAY_LABELS.flatMap((label, index) => {
    const weekday = index + 1; // Luxon: 1 = Monday .. 7 = Sunday
    const rows = closed.filter((t) => DateTime.fromISO(t.openedAt, { zone: "utc" }).setZone(timezone).weekday === weekday);
    return rows.length === 0 ? [] : [buildBucket(String(weekday), label, rows)];
  });
}

/** Results grouped by hour of day (user's timezone), for spotting a consistently bad time to trade. */
export function computeHourBreakdown(trades: TradeForBreakdown[], timezone: string): Bucket[] {
  const closed = closedWithPnl(trades);
  const byHour = new Map<number, (TradeForBreakdown & { netPnl: string })[]>();

  for (const trade of closed) {
    const hour = DateTime.fromISO(trade.openedAt, { zone: "utc" }).setZone(timezone).hour;
    const existing = byHour.get(hour);
    if (existing) existing.push(trade);
    else byHour.set(hour, [trade]);
  }

  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, rows]) => buildBucket(String(hour), `${String(hour).padStart(2, "0")}:00`, rows));
}

export interface RDistributionBin {
  label: string;
  /** Inclusive lower bound; -Infinity for the leftmost bin. */
  min: number;
  /** Exclusive upper bound; Infinity for the rightmost bin. */
  max: number;
  count: number;
}

const R_BINS: { label: string; min: number; max: number }[] = [
  { label: "≤ -3R", min: -Infinity, max: -3 },
  { label: "-3R a -2R", min: -3, max: -2 },
  { label: "-2R a -1R", min: -2, max: -1 },
  { label: "-1R a 0", min: -1, max: 0 },
  { label: "0 a 1R", min: 0, max: 1 },
  { label: "1R a 2R", min: 1, max: 2 },
  { label: "2R a 3R", min: 2, max: 3 },
  { label: "≥ 3R", min: 3, max: Infinity },
];

export interface RDistribution {
  bins: RDistributionBin[];
  /** How many trades actually carried an R value -- the rest simply weren't journalled. */
  sampleSize: number;
  /** Mean R across the sample. Null when nothing has an R value yet. */
  averageR: string | null;
}

/** Distribution of journalled R multiples. Only trades with a result_r are counted; the rest are reported as missing rather than treated as zero. */
export function computeRDistribution(trades: TradeForBreakdown[]): RDistribution {
  const values = trades
    .map((t) => t.resultR)
    .filter((r): r is string => r !== null && r.trim() !== "")
    .map((r) => new Decimal(r))
    .filter((d) => d.isFinite());

  const bins: RDistributionBin[] = R_BINS.map((bin) => ({
    ...bin,
    count: values.filter((v) => v.gte(bin.min) && v.lt(bin.max)).length,
  }));

  const total = values.reduce((sum, v) => sum.plus(v), new Decimal(0));

  return {
    bins,
    sampleSize: values.length,
    averageR: values.length > 0 ? total.dividedBy(values.length).toString() : null,
  };
}

export interface TradeExcursion {
  tradeId: string;
  /** Best unrealized gain reached during the trade, in account currency. */
  mfeAmount: string;
  /** Worst unrealized loss reached during the trade, as a positive magnitude. */
  maeAmount: string;
  /** Final realized result, for comparing "what it reached" vs "what you kept". */
  netPnl: string;
}

export interface ExcursionSummary {
  /** How many trades have a computed excursion -- never assume the rest are zero. */
  sampleSize: number;
  averageMfe: string | null;
  averageMae: string | null;
  /** Average of (mfe - netPnl) across winners: how much of the best move was handed back. */
  averageGiveBack: string | null;
  /** Share of winners (0-100) that gave back more than half their peak. Null with no winners. */
  gaveBackHalfPct: number | null;
}

/**
 * Aggregates per-trade excursions into the "do I exit too early / hold too
 * long?" answer. Give-back is only meaningful for trades that ended
 * positive -- for a loser, "peak minus result" mixes two different
 * stories -- so the give-back figures are computed over winners only and
 * the sample size is reported alongside.
 */
export function summarizeExcursions(excursions: TradeExcursion[]): ExcursionSummary {
  if (excursions.length === 0) {
    return { sampleSize: 0, averageMfe: null, averageMae: null, averageGiveBack: null, gaveBackHalfPct: null };
  }

  const mean = (values: Decimal[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, v) => sum.plus(v), new Decimal(0)).dividedBy(values.length).toString();

  const winners = excursions.filter((e) => new Decimal(e.netPnl).gt(0));
  const giveBacks = winners.map((e) => new Decimal(e.mfeAmount).minus(e.netPnl));
  const gaveBackHalf = winners.filter((e) => {
    const mfe = new Decimal(e.mfeAmount);
    return mfe.gt(0) && new Decimal(e.netPnl).lt(mfe.dividedBy(2));
  }).length;

  return {
    sampleSize: excursions.length,
    averageMfe: mean(excursions.map((e) => new Decimal(e.mfeAmount))),
    averageMae: mean(excursions.map((e) => new Decimal(e.maeAmount))),
    averageGiveBack: mean(giveBacks),
    gaveBackHalfPct: winners.length > 0 ? (gaveBackHalf / winners.length) * 100 : null,
  };
}

export interface PeriodComparison {
  netPnl: string;
  previousNetPnl: string;
  /** Absolute change. Positive means this period did better. */
  delta: string;
  /** Percentage change vs the previous period. Null when the previous period was flat (no meaningful denominator). */
  deltaPct: number | null;
  trades: number;
  previousTrades: number;
}

/**
 * This period vs the one immediately before it, of the same length.
 * Returns nulls rather than a fake 0% when the previous period had no
 * activity to compare against.
 */
export function comparePeriods(
  current: TradeForBreakdown[],
  previous: TradeForBreakdown[],
): PeriodComparison {
  const sum = (rows: TradeForBreakdown[]) =>
    closedWithPnl(rows).reduce((acc, t) => acc.plus(t.netPnl), new Decimal(0));

  const currentPnl = sum(current);
  const previousPnl = sum(previous);
  const delta = currentPnl.minus(previousPnl);

  return {
    netPnl: currentPnl.toString(),
    previousNetPnl: previousPnl.toString(),
    delta: delta.toString(),
    deltaPct: previousPnl.isZero() ? null : delta.dividedBy(previousPnl.abs()).times(100).toNumber(),
    trades: closedWithPnl(current).length,
    previousTrades: closedWithPnl(previous).length,
  };
}
