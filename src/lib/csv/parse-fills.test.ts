import { describe, expect, it } from "vitest";

import { guessMapping, parseFillRows, type ColumnMapping } from "./parse-fills";

const MAPPING: ColumnMapping = {
  entryId: "entry_id",
  tradeTime: "trade_time",
  side: "side",
  price: "price",
  size: "size",
  commission: "commission",
};

const DEFAULTS = { productId: "BIT-27MAR26-CDE" };

function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    entry_id: "fill-1",
    trade_time: "2026-03-02T14:30:00Z",
    side: "BUY",
    price: "68000.50",
    size: "2",
    commission: "1.25",
    ...overrides,
  };
}

describe("parseFillRows", () => {
  it("parses a well-formed row into the raw_fills shape", () => {
    const result = parseFillRows([row()], MAPPING, DEFAULTS);

    expect(result.errors).toEqual([]);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toEqual({
      entryId: "fill-1",
      productId: "BIT-27MAR26-CDE",
      orderId: null,
      tradeTime: "2026-03-02T14:30:00.000Z",
      side: "BUY",
      price: "68000.5",
      size: "2",
      commission: "1.25",
    });
  });

  it("accepts the side aliases real exports use", () => {
    const rows = [
      row({ entry_id: "a", side: "b" }),
      row({ entry_id: "b", side: "Compra" }),
      row({ entry_id: "c", side: "LONG" }),
      row({ entry_id: "d", side: "s" }),
      row({ entry_id: "e", side: "Venta" }),
      row({ entry_id: "f", side: "SHORT" }),
    ];

    const result = parseFillRows(rows, MAPPING, DEFAULTS);

    expect(result.errors).toEqual([]);
    expect(result.fills.map((f) => f.side)).toEqual(["BUY", "BUY", "BUY", "SELL", "SELL", "SELL"]);
  });

  it("reports an unrecognised side instead of guessing a direction", () => {
    // Guessing here would silently invert a trade's P&L, which is the worst
    // possible failure mode for this app.
    const result = parseFillRows([row({ side: "cerrar" })], MAPPING, DEFAULTS);

    expect(result.fills).toEqual([]);
    expect(result.errors).toEqual([{ row: 1, reason: 'Lado no reconocido: "cerrar"' }]);
  });

  it("strips currency and thousands separators from amounts", () => {
    const result = parseFillRows([row({ price: "$1,234.56", commission: " 2.50 " })], MAPPING, DEFAULTS);

    expect(result.errors).toEqual([]);
    expect(result.fills[0].price).toBe("1234.56");
    expect(result.fills[0].commission).toBe("2.5");
  });

  it("rejects non-positive and unparseable prices and sizes", () => {
    const rows = [
      row({ entry_id: "a", price: "0" }),
      row({ entry_id: "b", price: "n/a" }),
      row({ entry_id: "c", size: "-1" }),
      row({ entry_id: "d", size: "" }),
    ];

    const result = parseFillRows(rows, MAPPING, DEFAULTS);

    expect(result.fills).toEqual([]);
    expect(result.errors.map((e) => e.row)).toEqual([1, 2, 3, 4]);
    expect(result.errors[0].reason).toContain("Precio inválido");
    expect(result.errors[2].reason).toContain("Cantidad inválida");
  });

  it("rejects a row whose timestamp cannot be parsed", () => {
    const result = parseFillRows([row({ trade_time: "ayer por la tarde" })], MAPPING, DEFAULTS);

    expect(result.fills).toEqual([]);
    expect(result.errors[0].reason).toContain("Fecha inválida");
  });

  it("treats a repeated entry_id as an error and lists it as a duplicate", () => {
    const result = parseFillRows([row(), row({ price: "69000" })], MAPPING, DEFAULTS);

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].price).toBe("68000.5");
    expect(result.duplicateEntryIds).toEqual(["fill-1"]);
    expect(result.errors[0].row).toBe(2);
  });

  it("rejects a row with no identifier at all", () => {
    const result = parseFillRows([row({ entry_id: "   " })], MAPPING, DEFAULTS);

    expect(result.fills).toEqual([]);
    expect(result.errors[0].reason).toBe("Sin identificador de fill.");
  });

  it("defaults commission to zero only when the column is unmapped", () => {
    const withoutColumn: ColumnMapping = { ...MAPPING, commission: undefined };

    const result = parseFillRows([row({ commission: "garbage" })], withoutColumn, DEFAULTS);

    expect(result.errors).toEqual([]);
    expect(result.fills[0].commission).toBe("0");
  });

  it("errors on a mapped-but-unparseable commission rather than assuming zero", () => {
    // Assuming zero would overstate net P&L, and the user would have no way
    // of knowing the number is wrong.
    const result = parseFillRows([row({ commission: "garbage" })], MAPPING, DEFAULTS);

    expect(result.fills).toEqual([]);
    expect(result.errors[0].reason).toBe('Comisión inválida: "garbage"');
  });

  it("accepts an empty commission cell as zero when the column is mapped", () => {
    const result = parseFillRows([row({ commission: "" })], MAPPING, DEFAULTS);

    expect(result.errors).toEqual([]);
    expect(result.fills[0].commission).toBe("0");
  });

  it("normalises a rebate (negative commission) to a positive cost", () => {
    const result = parseFillRows([row({ commission: "-1.25" })], MAPPING, DEFAULTS);

    expect(result.fills[0].commission).toBe("1.25");
  });

  it("prefers a per-row product over the default when the column is mapped", () => {
    const mapping: ColumnMapping = { ...MAPPING, productId: "product", orderId: "order" };
    const rows = [
      { ...row({ entry_id: "a" }), product: "BIT-26JUN26-CDE", order: "order-9" },
      { ...row({ entry_id: "b" }), product: "", order: "" },
    ];

    const result = parseFillRows(rows, mapping, DEFAULTS);

    expect(result.fills[0].productId).toBe("BIT-26JUN26-CDE");
    expect(result.fills[0].orderId).toBe("order-9");
    expect(result.fills[1].productId).toBe("BIT-27MAR26-CDE");
    expect(result.fills[1].orderId).toBeNull();
  });

  it("keeps importing after a bad row instead of aborting the file", () => {
    const rows = [row({ entry_id: "a" }), row({ entry_id: "b", price: "x" }), row({ entry_id: "c" })];

    const result = parseFillRows(rows, MAPPING, DEFAULTS);

    expect(result.fills.map((f) => f.entryId)).toEqual(["a", "c"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
  });

  it("numbers rows the way a spreadsheet does, excluding the header", () => {
    const rows = [row({ entry_id: "a" }), row({ entry_id: "b" }), row({ entry_id: "c", side: "?" })];

    const result = parseFillRows(rows, MAPPING, DEFAULTS);

    expect(result.errors[0].row).toBe(3);
  });
});

describe("guessMapping", () => {
  it("maps a Coinbase-style export", () => {
    const guess = guessMapping(["entry_id", "trade_time", "side", "price", "size", "commission", "product_id"]);

    expect(guess).toEqual({
      entryId: "entry_id",
      tradeTime: "trade_time",
      side: "side",
      price: "price",
      size: "size",
      commission: "commission",
      productId: "product_id",
    });
  });

  it("prefers an exact header match over a substring one", () => {
    // "id" is a hint for entryId; without exact-match precedence a bare
    // "id" column appearing first would beat the real "entry_id".
    const guess = guessMapping(["id", "entry_id", "side", "price", "size", "date"]);

    expect(guess.entryId).toBe("entry_id");
  });

  it("normalises spaces and casing in headers", () => {
    const guess = guessMapping(["Entry ID", "Trade Time", "Side", "Price", "Size", "Fee"]);

    expect(guess).toEqual({
      entryId: "Entry ID",
      tradeTime: "Trade Time",
      side: "Side",
      price: "Price",
      size: "Size",
      commission: "Fee",
    });
  });

  it("maps Spanish headers", () => {
    const guess = guessMapping(["id", "fecha", "lado", "precio", "cantidad", "comisión", "producto"]);

    expect(guess).toEqual({
      entryId: "id",
      tradeTime: "fecha",
      side: "lado",
      price: "precio",
      size: "cantidad",
      commission: "comisión",
      productId: "producto",
    });
  });

  it("leaves fields unset when no header looks right", () => {
    const guess = guessMapping(["col1", "col2", "col3"]);

    expect(guess).toEqual({});
  });
});
