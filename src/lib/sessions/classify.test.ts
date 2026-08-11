import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { classifySession } from "./classify";

/**
 * All expected values below were hand-computed from each zone's UTC offset
 * (Sydney AEDT +11 / AEST +10, Tokyo JST +9 always, London GMT +0 / BST +1,
 * New York EST -5 / EDT -4) against the local session windows in
 * lib/sessions/config.ts, then cross-checked with Luxon's own .isInDST so
 * the test doesn't silently rely on a wrong assumption about which regime
 * a given date falls in.
 */

describe("classifySession -- January 2026 (Northern winter / Southern summer)", () => {
  const jan = (hourUtc: number) => DateTime.fromISO(`2026-01-15T${String(hourUtc).padStart(2, "0")}:00:00Z`, { zone: "utc" });

  it("sanity-checks the DST regimes assumed by this block", () => {
    expect(jan(12).setZone("Australia/Sydney").isInDST).toBe(true); // AEDT
    expect(jan(12).setZone("Europe/London").isInDST).toBe(false); // GMT
    expect(jan(12).setZone("America/New_York").isInDST).toBe(false); // EST
    expect(jan(12).setZone("Asia/Tokyo").isInDST).toBe(false); // never DST
  });

  it("03:00 UTC is Sydney+Tokyo overlap (Sydney on AEDT)", () => {
    expect(classifySession(jan(3).toJSDate())).toBe("SYDNEY_TOKYO_OVERLAP");
  });

  it("06:30 UTC is pure Tokyo", () => {
    expect(classifySession(jan(6).plus({ minutes: 30 }).toJSDate())).toBe("TOKYO");
  });

  it("12:00 UTC is pure London (GMT, no BST)", () => {
    expect(classifySession(jan(12).toJSDate())).toBe("LONDON");
  });

  it("14:00 UTC is London+New York overlap", () => {
    expect(classifySession(jan(14).toJSDate())).toBe("LONDON_NEW_YORK_OVERLAP");
  });

  it("20:00 UTC is pure New York", () => {
    expect(classifySession(jan(20).toJSDate())).toBe("NEW_YORK");
  });

  it("22:00 UTC is pure Sydney (AEDT has already opened for the next local day)", () => {
    expect(classifySession(jan(22).toJSDate())).toBe("SYDNEY");
  });

  it("21:30 UTC is the Sydney/New York boundary case (both active, not individually named -- resolves to SYDNEY)", () => {
    expect(classifySession(jan(21).plus({ minutes: 30 }).toJSDate())).toBe("SYDNEY");
  });
});

describe("classifySession -- July 2026 (Northern summer / Southern winter)", () => {
  const jul = (hourUtc: number) => DateTime.fromISO(`2026-07-15T${String(hourUtc).padStart(2, "0")}:00:00Z`, { zone: "utc" });

  it("sanity-checks the DST regimes assumed by this block (inverted vs January)", () => {
    expect(jul(12).setZone("Australia/Sydney").isInDST).toBe(false); // AEST
    expect(jul(12).setZone("Europe/London").isInDST).toBe(true); // BST
    expect(jul(12).setZone("America/New_York").isInDST).toBe(true); // EDT
    expect(jul(12).setZone("Asia/Tokyo").isInDST).toBe(false);
  });

  it("21:30 UTC falls in the gap between New York close and Sydney open -- OFF_SESSION", () => {
    // This gap only exists in the Southern-hemisphere-winter / Northern-
    // summer half of the year (Sydney AEST widens the distance to NY's
    // EDT close); the equivalent January instant is NOT a gap (see above).
    // A classifier using a fixed year-round UTC range would get exactly
    // this case wrong.
    expect(classifySession(jul(21).plus({ minutes: 30 }).toJSDate())).toBe("OFF_SESSION");
  });

  it("12:00 UTC is London+New York overlap (London now on BST, shifted from January's pure-London hour)", () => {
    expect(classifySession(jul(12).toJSDate())).toBe("LONDON_NEW_YORK_OVERLAP");
  });
});

describe("classifySession -- Sydney's inverted-hemisphere DST, same UTC clock time", () => {
  it("21:30 UTC (prev-day-relative) is inside the Sydney session in January but outside it in July", () => {
    // Same nominal UTC hour, six months apart: Sydney's local session
    // window (08:00-17:00 local) maps to a UTC window that is exactly one
    // hour earlier in January (AEDT, +11) than in July (AEST, +10). A
    // fixed-UTC-offset classifier -- exactly what the project spec warns
    // against -- would necessarily get one of these two cases wrong.
    const januaryInstant = DateTime.fromISO("2026-01-15T21:30:00Z", { zone: "utc" });
    const julyInstant = DateTime.fromISO("2026-07-15T21:30:00Z", { zone: "utc" });

    expect(januaryInstant.setZone("Australia/Sydney").hour).toBe(8); // just opened, AEDT
    expect(julyInstant.setZone("Australia/Sydney").hour).toBe(7); // not open yet, AEST

    expect(classifySession(januaryInstant.toJSDate())).toBe("SYDNEY");
    expect(classifySession(julyInstant.toJSDate())).toBe("OFF_SESSION");
  });
});

describe("classifySession -- input handling", () => {
  it("accepts an ISO string identically to a Date", () => {
    expect(classifySession("2026-01-15T12:00:00Z")).toBe(
      classifySession(new Date("2026-01-15T12:00:00Z")),
    );
  });

  it("throws on an invalid timestamp instead of silently returning a default", () => {
    expect(() => classifySession("not-a-date")).toThrow(/invalid timestamp/);
  });

  it("is a pure function of the instant -- identical input always yields identical output", () => {
    const results = new Set(
      Array.from({ length: 5 }, () => classifySession("2026-03-03T09:15:00Z")),
    );
    expect(results.size).toBe(1);
  });
});
