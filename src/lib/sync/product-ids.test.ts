import { describe, expect, it } from "vitest";

import { parseProductIds } from "./product-ids";

describe("parseProductIds", () => {
  it("still accepts a single product, the pre-existing configuration shape", () => {
    expect(parseProductIds("BIP-20DEC30-CDE")).toEqual(["BIP-20DEC30-CDE"]);
  });

  it("splits a comma-separated list", () => {
    expect(parseProductIds("BIP-20DEC30-CDE,BIT-27MAR26-CDE")).toEqual([
      "BIP-20DEC30-CDE",
      "BIT-27MAR26-CDE",
    ]);
  });

  it("tolerates the whitespace and trailing commas hand-edited env vars pick up", () => {
    expect(parseProductIds("  BIP-20DEC30-CDE , BIT-27MAR26-CDE ,, ")).toEqual([
      "BIP-20DEC30-CDE",
      "BIT-27MAR26-CDE",
    ]);
  });

  it("deduplicates, so a repeated product isn't synced twice per run", () => {
    expect(parseProductIds("A,B,A")).toEqual(["A", "B"]);
  });

  it("returns an empty list for missing or empty input rather than a bogus entry", () => {
    expect(parseProductIds(undefined)).toEqual([]);
    expect(parseProductIds(null)).toEqual([]);
    expect(parseProductIds("")).toEqual([]);
    expect(parseProductIds("  ,  ")).toEqual([]);
  });
});
