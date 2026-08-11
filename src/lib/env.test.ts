import { describe, expect, it } from "vitest";

import { normalizePemKey } from "./env";

describe("normalizePemKey", () => {
  it("leaves a PEM with real newlines and no extra whitespace unchanged", () => {
    const real = "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----";
    expect(normalizePemKey(real)).toBe(real);
  });

  it("converts literal backslash-n sequences (from a copied JSON key file) to real newlines", () => {
    const escaped = "-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEE...\\n-----END EC PRIVATE KEY-----\\n";
    expect(normalizePemKey(escaped)).toBe(
      "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----\n",
    );
  });

  it("strips a single layer of surrounding double or single quotes", () => {
    expect(normalizePemKey('"-----BEGIN KEY-----\\nabc\\n-----END KEY-----"')).toBe(
      "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    );
    expect(normalizePemKey("'-----BEGIN KEY-----\\nabc\\n-----END KEY-----'")).toBe(
      "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePemKey("  -----BEGIN KEY-----\nabc\n-----END KEY-----  \n")).toBe(
      "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    );
  });
});
