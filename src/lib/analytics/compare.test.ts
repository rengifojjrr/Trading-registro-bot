import { describe, expect, it } from "vitest";

import { compareTrades } from "./compare";
import type { TradeTableRow } from "./queries";

function trade(over: Partial<TradeTableRow> = {}): TradeTableRow {
  return {
    id: "a",
    product_id: "BIT-31JAN26-CDE",
    account_id: "acc",
    direction: "LONG",
    status: "CLOSED",
    opened_at: "2026-01-01T00:00:00Z",
    closed_at: "2026-01-01T02:00:00Z",
    duration_seconds: 7200,
    max_size: "2",
    total_entry_qty: "2",
    total_exit_qty: "2",
    entry_wap: "60000",
    exit_wap: "61000",
    notional_value: "1200",
    total_commissions: "5",
    gross_pnl: "20",
    net_pnl: "15",
    return_pct: "1.25",
    entries_count: 1,
    exits_count: 1,
    session_effective: "NEW_YORK",
    source: "COINBASE_SYNC",
    is_manually_adjusted: false,
    ...over,
  } as TradeTableRow;
}

function row(rows: ReturnType<typeof compareTrades>, key: string) {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`fila ${key} no encontrada`);
  return found;
}

describe("compareTrades", () => {
  it("gana el P&L neto más alto", () => {
    const rows = compareTrades(trade({ net_pnl: "100" }), trade({ net_pnl: "50" }));
    expect(row(rows, "netPnl").better).toBe("A");
  });

  it("en comisiones gana la más baja, no la más alta", () => {
    const rows = compareTrades(trade({ total_commissions: "9" }), trade({ total_commissions: "3" }));
    expect(row(rows, "commissions").better).toBe("B");
  });

  it("marca empate cuando los números son iguales", () => {
    const rows = compareTrades(trade({ net_pnl: "10" }), trade({ net_pnl: "10" }));
    expect(row(rows, "netPnl").better).toBe("TIE");
  });

  it("compara numéricamente, no como texto", () => {
    // Postgres devuelve numeric como cadena, y "9" > "10" alfabéticamente.
    const rows = compareTrades(trade({ net_pnl: "9" }), trade({ net_pnl: "10" }));
    expect(row(rows, "netPnl").better).toBe("B");
  });

  it("no declara ganador si a una le falta el dato", () => {
    const rows = compareTrades(trade({ net_pnl: null }), trade({ net_pnl: "10" }));
    expect(row(rows, "netPnl").better).toBe("UNKNOWN");
  });

  it("no declara ganador en filas descriptivas", () => {
    const rows = compareTrades(trade({ duration_seconds: 60 }), trade({ duration_seconds: 9999 }));
    // Una operación más corta no es mejor por ser más corta.
    expect(row(rows, "duration").better).toBe("UNKNOWN");
    expect(row(rows, "product").better).toBe("UNKNOWN");
  });
});
