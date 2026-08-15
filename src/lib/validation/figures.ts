import { Decimal } from "decimal.js";

/**
 * The five numbers a person actually compares against Coinbase when they
 * verify a trade. Kept deliberately small: a snapshot of the whole row
 * would flag a difference every time an unrelated column changed, and the
 * point of this is to be believed when it fires.
 *
 * Pure and dependency-free so both the server (after a reconstruction) and
 * a test can use it.
 */
export interface TradeFigures {
  netPnl: string | null;
  entryWap: string | null;
  exitWap: string | null;
  maxSize: string | null;
  totalCommissions: string | null;
}

const FIGURE_KEYS = ["netPnl", "entryWap", "exitWap", "maxSize", "totalCommissions"] as const;

/** Spanish labels for the notification body, so it names what actually moved. */
export const FIGURE_LABELS: Record<keyof TradeFigures, string> = {
  netPnl: "P&L neto",
  entryWap: "precio medio de entrada",
  exitWap: "precio medio de salida",
  maxSize: "tamaño máximo",
  totalCommissions: "comisiones",
};

export function snapshotFigures(row: {
  net_pnl?: string | number | null;
  entry_wap?: string | number | null;
  exit_wap?: string | number | null;
  max_size?: string | number | null;
  total_commissions?: string | number | null;
}): TradeFigures {
  const asString = (v: string | number | null | undefined) =>
    v === null || v === undefined ? null : String(v);
  return {
    netPnl: asString(row.net_pnl),
    entryWap: asString(row.entry_wap),
    exitWap: asString(row.exit_wap),
    maxSize: asString(row.max_size),
    totalCommissions: asString(row.total_commissions),
  };
}

/**
 * Compares numerically, not textually. Postgres hands the same value back
 * as "7" or "7.00" depending on the query, and flagging that as a change
 * would cry wolf on every single reconstruction.
 */
function sameNumber(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  try {
    return new Decimal(a).equals(new Decimal(b));
  } catch {
    return a === b;
  }
}

/** Which of the verified figures a recomputation moved. Empty means nothing changed. */
export function changedFigures(
  verified: TradeFigures | null | undefined,
  current: TradeFigures,
): (keyof TradeFigures)[] {
  if (!verified) return [];
  return FIGURE_KEYS.filter((key) => !sameNumber(verified[key], current[key]));
}

/** Reads a stored jsonb snapshot back, tolerating anything that isn't one. */
export function parseStoredFigures(value: unknown): TradeFigures | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const read = (key: string) => {
    const v = record[key];
    return v === null || v === undefined ? null : String(v);
  };
  return {
    netPnl: read("netPnl"),
    entryWap: read("entryWap"),
    exitWap: read("exitWap"),
    maxSize: read("maxSize"),
    totalCommissions: read("totalCommissions"),
  };
}

/** One sentence naming what moved, for the notification body. */
export function describeChangedFigures(keys: (keyof TradeFigures)[]): string {
  const labels = keys.map((k) => FIGURE_LABELS[k]);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}
