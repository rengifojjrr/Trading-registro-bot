import { describe, expect, it } from "vitest";

import { MOCK_FILLS, MOCK_PRODUCT, MockAdapter } from "./mock";

describe("MockAdapter", () => {
  it("returns every fixture fill when called with no filters", async () => {
    const adapter = new MockAdapter();
    const fills = await adapter.listFills({});
    expect(fills).toHaveLength(MOCK_FILLS.length);
  });

  it("filters by product_ids", async () => {
    const adapter = new MockAdapter();
    const fills = await adapter.listFills({ product_ids: [MOCK_PRODUCT.product_id] });
    expect(fills.every((f) => f.product_id === MOCK_PRODUCT.product_id)).toBe(true);

    const none = await adapter.listFills({ product_ids: ["NONEXISTENT"] });
    expect(none).toHaveLength(0);
  });

  it("filters by sequence timestamp window", async () => {
    const adapter = new MockAdapter();
    const all = await adapter.listFills({});
    const sorted = [...all].sort((a, b) =>
      a.sequence_timestamp.localeCompare(b.sequence_timestamp),
    );
    const midpoint = sorted[Math.floor(sorted.length / 2)].sequence_timestamp;

    const recent = await adapter.listFills({ start_sequence_timestamp: midpoint });
    expect(recent.every((f) => f.sequence_timestamp >= midpoint)).toBe(true);
    expect(recent.length).toBeLessThan(all.length);
  });

  it("every fixture fill references the mock product", () => {
    expect(MOCK_FILLS.every((f) => f.product_id === MOCK_PRODUCT.product_id)).toBe(true);
  });

  it("getProduct resolves the mock product and rejects unknown ids", async () => {
    const adapter = new MockAdapter();
    await expect(adapter.getProduct(MOCK_PRODUCT.product_id)).resolves.toEqual(MOCK_PRODUCT);
    await expect(adapter.getProduct("unknown")).rejects.toThrow();
  });

  it("scenario 4 (reversal) has an entry fill smaller than its closing fill, so a split is required", () => {
    // demo-entry-9 opens a 2-contract long; demo-entry-10 is a 5-contract
    // SELL that must close those 2 AND open a new 3-contract short.
    const opening = MOCK_FILLS.find((f) => f.entry_id === "demo-entry-9")!;
    const crossing = MOCK_FILLS.find((f) => f.entry_id === "demo-entry-10")!;
    expect(Number(crossing.size)).toBeGreaterThan(Number(opening.size));
    expect(opening.side).toBe("BUY");
    expect(crossing.side).toBe("SELL");
  });
});
