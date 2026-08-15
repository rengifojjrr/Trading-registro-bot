import { Decimal } from "decimal.js";

import type { TradeTableRow } from "@/lib/analytics/queries";

/**
 * Which of two trades did better on a given measure, and by how much.
 *
 * "Better" is not always "larger": a trade with lower commissions or a
 * shorter time in the market is the better one, so each row declares its
 * own direction rather than the UI guessing from the number.
 */
export type Better = "A" | "B" | "TIE" | "UNKNOWN";

export interface ComparisonRow {
  key: string;
  label: string;
  a: string | null;
  b: string | null;
  better: Better;
  /** How the value should be rendered -- the comparison layer stays free of formatting. */
  format: "money" | "signed-money" | "percent" | "number" | "duration" | "text";
}

/** Higher is better, lower is better, or the row is descriptive and has no winner. */
type Direction = "higher" | "lower" | "none";

function compareNumeric(a: string | null, b: string | null, direction: Direction): Better {
  if (direction === "none") return "UNKNOWN";
  if (a === null || b === null) return "UNKNOWN";

  const da = new Decimal(a);
  const db = new Decimal(b);
  if (da.equals(db)) return "TIE";
  const aWins = direction === "higher" ? da.greaterThan(db) : da.lessThan(db);
  return aWins ? "A" : "B";
}

/**
 * Builds the row-by-row comparison of two trades.
 *
 * Kept as a pure function over the same row shape the trades table already
 * uses, so the comparison can be tested without a database and can never
 * disagree with what the table showed.
 */
export function compareTrades(a: TradeTableRow, b: TradeTableRow): ComparisonRow[] {
  const rows: {
    key: string;
    label: string;
    a: string | null;
    b: string | null;
    direction: Direction;
    format: ComparisonRow["format"];
  }[] = [
    { key: "product", label: "Producto", a: a.product_id, b: b.product_id, direction: "none", format: "text" },
    { key: "direction", label: "Dirección", a: a.direction, b: b.direction, direction: "none", format: "text" },
    { key: "netPnl", label: "P&L neto", a: a.net_pnl, b: b.net_pnl, direction: "higher", format: "signed-money" },
    { key: "grossPnl", label: "P&L bruto", a: a.gross_pnl, b: b.gross_pnl, direction: "higher", format: "signed-money" },
    {
      key: "commissions",
      label: "Comisiones",
      a: a.total_commissions,
      b: b.total_commissions,
      // Paying less for the same trade is strictly better.
      direction: "lower",
      format: "money",
    },
    { key: "returnPct", label: "Rentabilidad", a: a.return_pct, b: b.return_pct, direction: "higher", format: "percent" },
    { key: "entryWap", label: "Precio medio de entrada", a: a.entry_wap, b: b.entry_wap, direction: "none", format: "money" },
    { key: "exitWap", label: "Precio medio de salida", a: a.exit_wap, b: b.exit_wap, direction: "none", format: "money" },
    { key: "size", label: "Tamaño máximo", a: a.max_size, b: b.max_size, direction: "none", format: "number" },
    { key: "notional", label: "Valor nocional", a: a.notional_value, b: b.notional_value, direction: "none", format: "money" },
    {
      key: "duration",
      label: "Tiempo en el mercado",
      a: a.duration_seconds === null ? null : String(a.duration_seconds),
      b: b.duration_seconds === null ? null : String(b.duration_seconds),
      // Descriptive on purpose: a shorter trade is not better in itself.
      direction: "none",
      format: "duration",
    },
    {
      key: "entries",
      label: "Entradas",
      a: String(a.entries_count),
      b: String(b.entries_count),
      direction: "none",
      format: "number",
    },
    {
      key: "exits",
      label: "Salidas",
      a: String(a.exits_count),
      b: String(b.exits_count),
      direction: "none",
      format: "number",
    },
  ];

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    a: r.a,
    b: r.b,
    format: r.format,
    better: r.format === "text" ? "UNKNOWN" : compareNumeric(r.a, r.b, r.direction),
  }));
}
