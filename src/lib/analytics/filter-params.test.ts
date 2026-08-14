import { describe, expect, it } from "vitest";

import { parseTradePageParams, previousPeriodFilters } from "./filter-params";

describe("parseTradePageParams", () => {
  it("defaults to the newest trades first, page one", () => {
    const params = parseTradePageParams({});
    expect(params.page).toBe(0);
    expect(params.sortKey).toBe("opened_at");
    expect(params.sortDir).toBe("desc");
    expect(params.search).toBeUndefined();
  });

  it("reads a valid sort column and direction from the URL", () => {
    const params = parseTradePageParams({ sort: "net_pnl", dir: "asc", page: "2", q: "BIP" });
    expect(params.sortKey).toBe("net_pnl");
    expect(params.sortDir).toBe("asc");
    expect(params.page).toBe(2);
    expect(params.search).toBe("BIP");
  });

  it("rejects a sort column that isn't on the allowlist", () => {
    // The value is interpolated into an ORDER BY, so a crafted URL must
    // never be able to steer it -- it falls back to the default instead.
    const params = parseTradePageParams({ sort: "user_id; drop table trades" });
    expect(params.sortKey).toBe("opened_at");
  });

  it("rejects negative and non-integer pages, which would produce a bogus offset", () => {
    expect(parseTradePageParams({ page: "-5" }).page).toBe(0);
    expect(parseTradePageParams({ page: "1.5" }).page).toBe(0);
    expect(parseTradePageParams({ page: "abc" }).page).toBe(0);
  });

  it("treats any direction other than asc as desc", () => {
    expect(parseTradePageParams({ dir: "sideways" }).sortDir).toBe("desc");
  });
});

describe("previousPeriodFilters", () => {
  it("returns the window of equal length immediately before the current one", () => {
    const previous = previousPeriodFilters({
      dateFrom: "2026-08-08T00:00:00.000Z",
      dateTo: "2026-08-15T00:00:00.000Z",
    });

    expect(previous).not.toBeNull();
    expect(new Date(previous!.dateFrom!).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(new Date(previous!.dateTo!).toISOString()).toBe("2026-08-08T00:00:00.000Z");
  });

  it("returns null for an open-ended range, which has no defined predecessor", () => {
    expect(previousPeriodFilters({ dateFrom: "2026-08-01T00:00:00.000Z" })).toBeNull();
    expect(previousPeriodFilters({ dateTo: "2026-08-01T00:00:00.000Z" })).toBeNull();
    expect(previousPeriodFilters({})).toBeNull();
  });

  it("returns null when the range is inverted or empty", () => {
    expect(
      previousPeriodFilters({
        dateFrom: "2026-08-15T00:00:00.000Z",
        dateTo: "2026-08-08T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("carries the other filters through unchanged", () => {
    const previous = previousPeriodFilters({
      dateFrom: "2026-08-08T00:00:00.000Z",
      dateTo: "2026-08-15T00:00:00.000Z",
      direction: "LONG",
      productId: "BIP-20DEC30-CDE",
    });
    expect(previous!.direction).toBe("LONG");
    expect(previous!.productId).toBe("BIP-20DEC30-CDE");
  });
});
