import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

import type { SessionLabel } from "@/types/database";

/**
 * Shared formatting helpers for money/percent/duration/dates -- every
 * dashboard tile, the trades table, and the trade detail page go through
 * these same functions so a given number is never rendered two different
 * ways in two different places. Money/quantity values always arrive here as
 * the `string` (numeric-over-the-wire) or `null` shapes lib/pnl and
 * lib/analytics already use -- never a raw float.
 */

export function formatMoney(
  value: string | number | null | undefined,
  options: { currency?: string; compact?: boolean } = {},
): string {
  if (value === null || value === undefined) return "--";
  const { currency = "USD", compact = false } = options;
  const n = new Decimal(value).toNumber();
  if (!Number.isFinite(n)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(n);
}

/** Same as formatMoney, but with an explicit +/- sign -- for P&L figures. */
export function formatSignedMoney(
  value: string | number | null | undefined,
  options: { currency?: string; compact?: boolean } = {},
): string {
  if (value === null || value === undefined) return "--";
  const d = new Decimal(value);
  const formatted = formatMoney(d.abs().toString(), options);
  if (d.isZero()) return formatted;
  return `${d.isNegative() ? "-" : "+"}${formatted}`;
}

export function formatPercent(value: string | number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "--";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function formatNumber(value: string | number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "--";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** e.g. 45s, 12m, 2h 15m, 3d 4h. Null-safe for open trades with no duration yet. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && (minutes > 0 || parts.length === 0)) parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function formatDateTime(iso: string | null | undefined, timezone = "UTC"): string {
  if (!iso) return "--";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone);
  if (!dt.isValid) return "--";
  return dt.toFormat("dd LLL yyyy, HH:mm");
}

export function formatDate(iso: string | null | undefined, timezone = "UTC"): string {
  if (!iso) return "--";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone);
  if (!dt.isValid) return "--";
  return dt.toFormat("dd LLL yyyy");
}

export type PnlTone = "positive" | "negative" | "neutral";

export function pnlTone(value: string | number | null | undefined): PnlTone {
  if (value === null || value === undefined) return "neutral";
  const d = new Decimal(value);
  if (d.gt(0)) return "positive";
  if (d.lt(0)) return "negative";
  return "neutral";
}

export function pnlColorClass(value: string | number | null | undefined): string {
  const tone = pnlTone(value);
  if (tone === "positive") return "text-positive";
  if (tone === "negative") return "text-negative";
  return "text-foreground";
}

export const SESSION_LABELS_ES: Record<SessionLabel, string> = {
  SYDNEY: "Sídney",
  SYDNEY_TOKYO_OVERLAP: "Sídney / Tokio",
  TOKYO: "Tokio",
  TOKYO_LONDON_OVERLAP: "Tokio / Londres",
  LONDON: "Londres",
  LONDON_NEW_YORK_OVERLAP: "Londres / Nueva York",
  NEW_YORK: "Nueva York",
  OFF_SESSION: "Fuera de sesión",
};

export function formatSessionLabel(session: SessionLabel | null | undefined): string {
  if (!session) return "--";
  return SESSION_LABELS_ES[session];
}
