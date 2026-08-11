import { describe, expect, it } from "vitest";

import { reconstructTrades } from "./engine";
import type { GroupingOverrideInput, ReconstructionFillInput } from "./types";

const PRODUCT = "BIT-TEST-CDE";

let seq = 0;
function fill(partial: {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  commission?: number;
  productId?: string;
  tradeType?: ReconstructionFillInput["tradeType"];
  hasFutureLegs?: boolean;
  minutesOffset?: number;
}): ReconstructionFillInput {
  const minute = partial.minutesOffset ?? seq++;
  const ts = new Date(2026, 0, 1, 0, minute, 0).toISOString();
  return {
    entryId: partial.id,
    productId: partial.productId ?? PRODUCT,
    side: partial.side,
    price: String(partial.price),
    size: String(partial.size),
    commission: String(partial.commission ?? 0),
    sequenceTimestamp: ts,
    tradeTime: ts,
    tradeType: partial.tradeType ?? "FILL",
    hasFutureLegs: partial.hasFutureLegs ?? false,
  };
}

describe("reconstructTrades -- simple cases", () => {
  it("simple long, full close: one ENTRY, one EXIT", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 2, commission: 1 }),
      fill({ id: "e2", side: "SELL", price: 110, size: 2, commission: 1 }),
    ];
    const { trades, unclassifiedFillIds } = reconstructTrades(fills);

    expect(unclassifiedFillIds).toEqual([]);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.direction).toBe("LONG");
    expect(t.status).toBe("CLOSED");
    expect(t.openingFillId).toBe("e1");
    expect(t.entryWap).toBe("100");
    expect(t.exitWap).toBe("110");
    expect(t.totalEntryQty).toBe("2");
    expect(t.totalExitQty).toBe("2");
    expect(t.maxSize).toBe("2");
    expect(t.entriesCount).toBe(1);
    expect(t.exitsCount).toBe(1);
    expect(t.entryCommissions).toBe("1");
    expect(t.exitCommissions).toBe("1");
  });

  it("simple short, full close", () => {
    const fills = [
      fill({ id: "e1", side: "SELL", price: 100, size: 3 }),
      fill({ id: "e2", side: "BUY", price: 90, size: 3 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe("SHORT");
    expect(trades[0].status).toBe("CLOSED");
    expect(trades[0].entryWap).toBe("100");
    expect(trades[0].exitWap).toBe("90");
  });

  it("a trade that never returns to zero stays OPEN with null exitWap", () => {
    const fills = [fill({ id: "e1", side: "BUY", price: 100, size: 1 })];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("OPEN");
    expect(trades[0].closedAt).toBeNull();
    expect(trades[0].exitWap).toBeNull();
    expect(trades[0].totalExitQty).toBe("0");
  });
});

describe("reconstructTrades -- partial entries and exits", () => {
  it("multiple partial entries before any exit: WAP is size-weighted", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 2 }),
      fill({ id: "e2", side: "BUY", price: 200, size: 2 }),
      fill({ id: "e3", side: "SELL", price: 300, size: 4 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    // (100*2 + 200*2) / 4 = 150
    expect(trades[0].entryWap).toBe("150");
    expect(trades[0].entriesCount).toBe(2);
    expect(trades[0].exitsCount).toBe(1);
  });

  it("multiple partial exits after one entry: WAP is size-weighted", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 4 }),
      fill({ id: "e2", side: "SELL", price: 100, size: 2 }),
      fill({ id: "e3", side: "SELL", price: 120, size: 2 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    // (100*2 + 120*2) / 4 = 110
    expect(trades[0].exitWap).toBe("110");
    expect(trades[0].entriesCount).toBe(1);
    expect(trades[0].exitsCount).toBe(2);
  });

  it("increase then reduce without closing stays open with correct maxSize", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 5 }),
      fill({ id: "e2", side: "BUY", price: 110, size: 3 }), // position now 8, maxSize should be 8
      fill({ id: "e3", side: "SELL", price: 120, size: 2 }), // position now 6, still open
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("OPEN");
    expect(trades[0].maxSize).toBe("8");
    expect(trades[0].totalEntryQty).toBe("8");
    expect(trades[0].totalExitQty).toBe("2");
  });
});

describe("reconstructTrades -- long/short reversal", () => {
  it("long -> short reversal splits the crossing fill into two trades with pro-rated commission", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 2, commission: 1 }), // opens LONG 2
      fill({ id: "e2", side: "SELL", price: 110, size: 5, commission: 5 }), // closes LONG(2) + opens SHORT(3)
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(2);
    const [closedLong, openShort] = trades;

    expect(closedLong.direction).toBe("LONG");
    expect(closedLong.status).toBe("CLOSED");
    expect(closedLong.openingFillId).toBe("e1");
    expect(closedLong.totalExitQty).toBe("2");
    // commission prorated 2/5 of 5 = 2
    expect(closedLong.exitCommissions).toBe("2");

    expect(openShort.direction).toBe("SHORT");
    expect(openShort.status).toBe("OPEN");
    expect(openShort.openingFillId).toBe("e2");
    expect(openShort.totalEntryQty).toBe("3");
    // commission prorated 3/5 of 5 = 3
    expect(openShort.entryCommissions).toBe("3");

    // Commission conservation: the two prorated portions must sum back to
    // the original fill's total commission exactly.
    const totalProrated = Number(closedLong.exitCommissions) + Number(openShort.entryCommissions);
    expect(totalProrated).toBe(5);

    // The reversal-split DB invariant: e2 appears once as EXIT (on the
    // closed trade) and once as ENTRY (on the new trade) -- never twice
    // with the same role.
    const e2InClosed = closedLong.fillAllocations.find((a) => a.rawFillId === "e2");
    const e2InOpen = openShort.fillAllocations.find((a) => a.rawFillId === "e2");
    expect(e2InClosed?.role).toBe("EXIT");
    expect(e2InOpen?.role).toBe("ENTRY");
    expect(Number(e2InClosed!.allocatedSize) + Number(e2InOpen!.allocatedSize)).toBe(5);
  });

  it("short -> long reversal", () => {
    const fills = [
      fill({ id: "e1", side: "SELL", price: 100, size: 1 }),
      fill({ id: "e2", side: "BUY", price: 90, size: 4 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(2);
    expect(trades[0].direction).toBe("SHORT");
    expect(trades[0].status).toBe("CLOSED");
    expect(trades[1].direction).toBe("LONG");
    expect(trades[1].status).toBe("OPEN");
    expect(trades[1].totalEntryQty).toBe("3");
  });

  it("a fill that exactly flattens a position does NOT trigger a reversal (no new trade)", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 5 }),
      fill({ id: "e2", side: "SELL", price: 100, size: 5 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("CLOSED");
  });

  it("a chain of reversals (long -> short -> long) produces three independent trades", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1 }), // LONG 1
      fill({ id: "e2", side: "SELL", price: 100, size: 2 }), // close LONG, open SHORT 1
      fill({ id: "e3", side: "BUY", price: 100, size: 2 }), // close SHORT, open LONG 1
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(3);
    expect(trades.map((t) => t.direction)).toEqual(["LONG", "SHORT", "LONG"]);
    expect(trades.map((t) => t.status)).toEqual(["CLOSED", "CLOSED", "OPEN"]);
  });
});

describe("reconstructTrades -- unclassified fills", () => {
  it("excludes non-FILL trade_type fills and reports them, without treating them as ordinary fills", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1 }),
      fill({ id: "e2", side: "SELL", price: 110, size: 1, tradeType: "CORRECTION" }),
    ];
    const { trades, unclassifiedFillIds } = reconstructTrades(fills);

    expect(unclassifiedFillIds).toEqual(["e2"]);
    // e2 excluded -> position never returns to zero -> trade stays open.
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("OPEN");
  });

  it("excludes combo fills (non-empty future_legs) and reports them", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1 }),
      fill({ id: "e2", side: "SELL", price: 110, size: 1, hasFutureLegs: true }),
    ];
    const { trades, unclassifiedFillIds } = reconstructTrades(fills);

    expect(unclassifiedFillIds).toEqual(["e2"]);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("OPEN");
  });
});

describe("reconstructTrades -- grouping overrides", () => {
  it("EXCLUDE_FILL removes a fill from processing entirely", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1 }),
      fill({ id: "e2", side: "BUY", price: 999999, size: 1 }), // a "bad" fill to exclude
      fill({ id: "e3", side: "SELL", price: 110, size: 1 }),
    ];
    const overrides: GroupingOverrideInput[] = [
      { id: "ov1", overrideType: "EXCLUDE_FILL", anchorFillId: "e2", payload: {}, isActive: true },
    ];

    const withOverride = reconstructTrades(fills, overrides);
    expect(withOverride.trades).toHaveLength(1);
    expect(withOverride.trades[0].status).toBe("CLOSED");
    expect(withOverride.trades[0].totalEntryQty).toBe("1");

    // Deactivating the override reverts exactly to the automatic result.
    const reverted = reconstructTrades(fills, [{ ...overrides[0], isActive: false }]);
    expect(reverted.trades).toHaveLength(1);
    expect(reverted.trades[0].status).toBe("OPEN"); // now e1+e2 open a 2-lot long, unclosed
    expect(reverted.trades[0].totalEntryQty).toBe("2");
  });

  it("reports MERGE/SPLIT/REASSIGN as unsupported instead of silently applying or ignoring them", () => {
    const fills = [fill({ id: "e1", side: "BUY", price: 100, size: 1 })];
    const overrides: GroupingOverrideInput[] = [
      { id: "ov1", overrideType: "MERGE", anchorFillId: "e1", payload: {}, isActive: true },
    ];

    const { unsupportedOverrideIds } = reconstructTrades(fills, overrides);
    expect(unsupportedOverrideIds).toEqual(["ov1"]);
  });

  it("ignores inactive overrides", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1 }),
      fill({ id: "e2", side: "SELL", price: 110, size: 1 }),
    ];
    const overrides: GroupingOverrideInput[] = [
      { id: "ov1", overrideType: "EXCLUDE_FILL", anchorFillId: "e1", payload: {}, isActive: false },
    ];

    const { trades } = reconstructTrades(fills, overrides);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("CLOSED");
  });
});

describe("reconstructTrades -- idempotency and isolation", () => {
  it("is deterministic: identical input always yields identical output", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 2 }),
      fill({ id: "e2", side: "SELL", price: 105, size: 1 }),
      fill({ id: "e3", side: "SELL", price: 108, size: 1 }),
    ];
    const first = reconstructTrades(fills);
    const second = reconstructTrades([...fills]);
    expect(second).toEqual(first);
  });

  it("processes fills out of input order by sorting on sequence_timestamp first", () => {
    const inOrder = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1, minutesOffset: 0 }),
      fill({ id: "e2", side: "SELL", price: 110, size: 1, minutesOffset: 1 }),
    ];
    const shuffled = [inOrder[1], inOrder[0]];

    expect(reconstructTrades(shuffled)).toEqual(reconstructTrades(inOrder));
  });

  it("tracks position independently per product_id", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1, productId: "A" }),
      fill({ id: "e2", side: "BUY", price: 200, size: 1, productId: "B" }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(2);
    expect(trades.find((t) => t.productId === "A")?.status).toBe("OPEN");
    expect(trades.find((t) => t.productId === "B")?.status).toBe("OPEN");
  });

  it("different commissions per fill are preserved individually, not averaged", () => {
    const fills = [
      fill({ id: "e1", side: "BUY", price: 100, size: 1, commission: 0.5 }),
      fill({ id: "e2", side: "BUY", price: 100, size: 1, commission: 1.5 }),
      fill({ id: "e3", side: "SELL", price: 110, size: 2, commission: 2.0 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades[0].entryCommissions).toBe("2"); // 0.5 + 1.5
    expect(trades[0].exitCommissions).toBe("2");
  });
});
