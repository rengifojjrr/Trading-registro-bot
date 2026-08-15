import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const options = { capacity: 5, windowSeconds: 10 };

  it("allows a burst up to capacity", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("user-a", options).allowed, `petición ${i + 1}`).toBe(true);
    }
  });

  it("blocks once the bucket is empty", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("user-a", options);
    const result = checkRateLimit("user-a", options);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("refills over time so an idle client recovers", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("user-a", options);
    expect(checkRateLimit("user-a", options).allowed).toBe(false);

    // Half the window returns roughly half the capacity.
    vi.advanceTimersByTime(5_000);
    expect(checkRateLimit("user-a", options).allowed).toBe(true);
  });

  it("keeps buckets separate per key", () => {
    // Otherwise one hot tab would throttle every other user of the same
    // deployment.
    for (let i = 0; i < 5; i++) checkRateLimit("user-a", options);
    expect(checkRateLimit("user-a", options).allowed).toBe(false);
    expect(checkRateLimit("user-b", options).allowed).toBe(true);
  });

  it("never refills past capacity", () => {
    checkRateLimit("user-a", options);
    // An hour idle must not bank an hour's worth of requests.
    vi.advanceTimersByTime(60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("user-a", options).allowed).toBe(true);
    }
    expect(checkRateLimit("user-a", options).allowed).toBe(false);
  });
});
