import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { calculatePnl } from "@/lib/pnl/calculate";
import { reconstructTrades } from "@/lib/reconstruction/engine";
import type { ReconstructionFillInput } from "@/lib/reconstruction/types";

import { guessMapping, parseFillRows, type ColumnMapping } from "./parse-fills";

/**
 * The whole CSV path, from file text to P&L, without a database.
 *
 * This is the test that actually backs the claim the importer is built on:
 * a CSV goes through the *same* reconstruction and P&L code as a Coinbase
 * sync, so both produce identical numbers. If someone later gives the
 * importer its own calculation shortcut, this fails.
 *
 * The database steps in between (writing raw_fills, upserting trades) are
 * covered separately -- what matters here is that no number is computed
 * anywhere except in the shared engine.
 */

const CONTRACT_SIZE = "0.01"; // Coinbase nano Bitcoin futures.

/** Mirrors what the server action does with the rows the browser parsed. */
function runPipeline(csv: string, defaults = { productId: "BIT-27MAR26-CDE" }) {
  const parsedFile = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: "greedy",
  });

  const mapping = guessMapping(parsedFile.meta.fields ?? []) as ColumnMapping;
  const parsed = parseFillRows(parsedFile.data, mapping, defaults);

  const engineFills: ReconstructionFillInput[] = parsed.fills.map((f) => ({
    entryId: f.entryId,
    productId: f.productId,
    side: f.side,
    price: f.price,
    size: f.size,
    commission: f.commission,
    // The importer stores trade_time in both columns: a CSV has no separate
    // exchange sequence timestamp.
    sequenceTimestamp: f.tradeTime,
    tradeTime: f.tradeTime,
    tradeType: "FILL",
    hasFutureLegs: false,
  }));

  const { trades, unclassifiedFillIds } = reconstructTrades(engineFills, []);
  return { mapping, parsed, trades, unclassifiedFillIds };
}

describe("CSV import pipeline", () => {
  it("turns a simple round trip into one closed LONG trade with correct P&L", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-02T14:30:00Z,BUY,68000,2,1.50
f2,2026-03-02T15:10:00Z,SELL,68500,2,1.50
`;

    const { trades, parsed } = runPipeline(csv);

    expect(parsed.errors).toEqual([]);
    expect(trades).toHaveLength(1);

    const trade = trades[0];
    expect(trade.direction).toBe("LONG");
    expect(trade.status).toBe("CLOSED");
    expect(trade.entryWap).toBe("68000");
    expect(trade.exitWap).toBe("68500");
    expect(trade.maxSize).toBe("2");

    const pnl = calculatePnl({
      direction: trade.direction,
      entryWap: trade.entryWap,
      exitWap: trade.exitWap,
      totalEntryQty: trade.totalEntryQty,
      totalExitQty: trade.totalExitQty,
      entryCommissions: trade.entryCommissions,
      exitCommissions: trade.exitCommissions,
      contractSize: CONTRACT_SIZE,
    });

    // 500 points * 2 contracts * 0.01 BTC = 10.00 gross, minus 3.00 fees.
    expect(pnl.grossPnl).toBe("10");
    expect(pnl.netPnl).toBe("7");
  });

  it("produces a SHORT trade when the position opens with a sell", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-03T10:00:00Z,SELL,70000,1,0.75
f2,2026-03-03T11:00:00Z,BUY,69000,1,0.75
`;

    const { trades } = runPipeline(csv);

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("SHORT");

    const pnl = calculatePnl({
      direction: trades[0].direction,
      entryWap: trades[0].entryWap,
      exitWap: trades[0].exitWap,
      totalEntryQty: trades[0].totalEntryQty,
      totalExitQty: trades[0].totalExitQty,
      entryCommissions: trades[0].entryCommissions,
      exitCommissions: trades[0].exitCommissions,
      contractSize: CONTRACT_SIZE,
    });

    // A short that fell 1000 points: 1000 * 1 * 0.01 = 10.00 gross.
    expect(pnl.grossPnl).toBe("10");
    expect(pnl.netPnl).toBe("8.5");
  });

  it("weights partial entries and exits instead of averaging prices naively", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-04T09:00:00Z,BUY,68000,1,0
f2,2026-03-04T09:30:00Z,BUY,69000,3,0
f3,2026-03-04T10:00:00Z,SELL,70000,4,0
`;

    const { trades } = runPipeline(csv);

    // 1@68000 + 3@69000 -> 68750, not the unweighted 68500.
    expect(trades[0].entryWap).toBe("68750");
    expect(trades[0].maxSize).toBe("4");
  });

  it("splits a reversal into a closed trade and a new opposite one", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-05T09:00:00Z,BUY,68000,1,0
f2,2026-03-05T10:00:00Z,SELL,68500,3,0
f3,2026-03-05T11:00:00Z,BUY,68200,2,0
`;

    const { trades } = runPipeline(csv);

    expect(trades).toHaveLength(2);
    expect(trades[0].direction).toBe("LONG");
    expect(trades[0].status).toBe("CLOSED");
    expect(trades[1].direction).toBe("SHORT");
    expect(trades[1].status).toBe("CLOSED");
    expect(trades[1].maxSize).toBe("2");
  });

  it("leaves a partially closed position open and prices only the closed part", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-06T09:00:00Z,BUY,68000,2,1
f2,2026-03-06T10:00:00Z,SELL,68500,1,1
`;

    const { trades } = runPipeline(csv);

    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("OPEN");
    expect(trades[0].totalEntryQty).toBe("2");
    expect(trades[0].totalExitQty).toBe("1");

    const pnl = calculatePnl({
      direction: trades[0].direction,
      entryWap: trades[0].entryWap,
      exitWap: trades[0].exitWap,
      totalEntryQty: trades[0].totalEntryQty,
      totalExitQty: trades[0].totalExitQty,
      entryCommissions: trades[0].entryCommissions,
      exitCommissions: trades[0].exitCommissions,
      contractSize: CONTRACT_SIZE,
    });

    // Realised on the 1 contract that closed (500 * 1 * 0.01 = 5.00), less
    // both commissions -- the contract still open contributes nothing.
    expect(pnl.grossPnl).toBe("5");
    expect(pnl.netPnl).toBe("3");
  });

  it("orders fills by timestamp, not by their order in the file", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f2,2026-03-07T15:00:00Z,SELL,68500,1,0
f1,2026-03-07T14:00:00Z,BUY,68000,1,0
`;

    const { trades } = runPipeline(csv);

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("LONG");
    expect(trades[0].openingFillId).toBe("f1");
  });

  it("skips broken rows without shifting the trades built from the good ones", () => {
    const csv = `
entry_id,trade_time,side,price,size,commission
f1,2026-03-08T09:00:00Z,BUY,68000,1,0
bad,2026-03-08T09:30:00Z,???,68200,1,0
f2,2026-03-08T10:00:00Z,SELL,68500,1,0
`;

    const { trades, parsed } = runPipeline(csv);

    expect(parsed.errors).toHaveLength(1);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("CLOSED");
    expect(trades[0].entryWap).toBe("68000");
    expect(trades[0].exitWap).toBe("68500");
  });

  it("handles a Spanish-headed export end to end", () => {
    const csv = `
id,fecha,lado,precio,cantidad,comisión
1,2026-03-09 09:00:00Z,Compra,68000,1,0.5
2,2026-03-09 10:00:00Z,Venta,68300,1,0.5
`;

    const { mapping, parsed, trades } = runPipeline(csv);

    expect(mapping.entryId).toBe("id");
    expect(mapping.side).toBe("lado");
    expect(parsed.errors).toEqual([]);
    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("LONG");
  });
});
