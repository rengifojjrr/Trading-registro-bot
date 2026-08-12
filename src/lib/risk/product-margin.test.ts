import { describe, expect, it } from "vitest";

import { checkInitialMarginRequirement, extractLiveMarginRates } from "./product-margin";

// Shape confirmed against the real, currently-synced products.raw_metadata
// row for BIP-20DEC30-CDE (see products table) -- trimmed to the fields
// extractLiveMarginRates actually reads.
const REAL_FUTURE_PRODUCT_DETAILS = {
  future_product_details: {
    funding_rate: "0.000007",
    funding_interval: "3600s",
    intraday_margin_rate: { long_margin_rate: "0.1000185", short_margin_rate: "0.1000008" },
    overnight_margin_rate: { long_margin_rate: "0.245625", short_margin_rate: "0.306375" },
  },
};

describe("extractLiveMarginRates", () => {
  it("picks the LONG side of each rate for a LONG position", () => {
    const result = extractLiveMarginRates(REAL_FUTURE_PRODUCT_DETAILS, "LONG");
    expect(result).not.toBeNull();
    expect(result!.intradayMarginRate).toBe("0.1000185");
    expect(result!.overnightMarginRate).toBe("0.245625");
    expect(result!.fundingRatePerHour).toBe("0.000007");
  });

  it("picks the SHORT side of each rate for a SHORT position", () => {
    const result = extractLiveMarginRates(REAL_FUTURE_PRODUCT_DETAILS, "SHORT");
    expect(result!.intradayMarginRate).toBe("0.1000008");
    expect(result!.overnightMarginRate).toBe("0.306375");
  });

  it("normalizes a funding_interval other than 1 hour to a per-hour rate", () => {
    const result = extractLiveMarginRates(
      {
        future_product_details: {
          ...REAL_FUTURE_PRODUCT_DETAILS.future_product_details,
          funding_rate: "0.00002", // per 8h in this fixture
          funding_interval: "28800s",
        },
      },
      "LONG",
    );
    // 0.00002 / 8h = 0.0000025 per hour
    expect(Number(result!.fundingRatePerHour)).toBeCloseTo(0.0000025, 10);
  });

  it("returns null for a product with no future_product_details (spot, or a stale/synthetic row)", () => {
    expect(extractLiveMarginRates({}, "LONG")).toBeNull();
    expect(extractLiveMarginRates({ verify_seed: true }, "LONG")).toBeNull();
    expect(extractLiveMarginRates(null, "LONG")).toBeNull();
    expect(extractLiveMarginRates({ source: "notion_import" }, "LONG")).toBeNull();
  });

  it("returns null when future_product_details is present but missing a margin-rate field", () => {
    expect(
      extractLiveMarginRates({ future_product_details: { funding_rate: "0.000007" } }, "LONG"),
    ).toBeNull();
  });
});

describe("checkInitialMarginRequirement", () => {
  it("passes intraday but fails overnight when night IM exceeds usable capital -- the exact scenario this check exists for", () => {
    // notional 14,016.20 (the PDF worked example's position): ~10% day =
    // ~1,401.88 (fits in usable 2,000), ~24.6% night = ~3,442.73 (does
    // not) -- picked to force the night check to fail while day passes.
    const notional = 14016.2;
    const expectedDayMargin = notional * 0.1000185;
    const expectedNightMargin = notional * 0.245625;

    const result = checkInitialMarginRequirement({
      notional: "14016.20",
      usableCapital: "2000",
      intradayMarginRate: "0.1000185",
      overnightMarginRate: "0.245625",
    });

    expect(result.passesIntraday).toBe(true); // ~1,401.88 <= 2,000
    expect(result.passesOvernight).toBe(false); // ~3,442.73 > 2,000
    expect(Number(result.intradayMargin)).toBeCloseTo(expectedDayMargin, 2);
    expect(Number(result.overnightMargin)).toBeCloseTo(expectedNightMargin, 2);
  });

  it("passes both when usable capital comfortably covers the overnight requirement", () => {
    const result = checkInitialMarginRequirement({
      notional: "14016.20",
      usableCapital: "10000",
      intradayMarginRate: "0.1000185",
      overnightMarginRate: "0.245625",
    });
    expect(result.passesIntraday).toBe(true);
    expect(result.passesOvernight).toBe(true);
  });
});
