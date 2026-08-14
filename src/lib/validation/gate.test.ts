import { describe, expect, it } from "vitest";

import { evaluateValidationGate, REQUIRED_VERIFICATIONS } from "./gate";

describe("evaluateValidationGate", () => {
  it("opens once enough trades match with no mismatches", () => {
    const result = evaluateValidationGate({
      matching: REQUIRED_VERIFICATIONS,
      mismatching: 0,
      available: 50,
    });

    expect(result.canEnable).toBe(true);
    expect(result.blockedReason).toBeNull();
    expect(result.progressPct).toBe(100);
    expect(result.remaining).toBe(0);
  });

  it("stays closed while fewer than the required trades have been checked", () => {
    const result = evaluateValidationGate({ matching: 5, mismatching: 0, available: 50 });
    expect(result.canEnable).toBe(false);
    expect(result.remaining).toBe(REQUIRED_VERIFICATIONS - 5);
    expect(result.blockedReason).toContain("5");
  });

  it("a single recorded mismatch blocks the gate even with the quota met", () => {
    // The whole point of the check is catching a systematic error, so
    // "20 right, 1 wrong" must not pass.
    const result = evaluateValidationGate({
      matching: REQUIRED_VERIFICATIONS,
      mismatching: 1,
      available: 50,
    });

    expect(result.canEnable).toBe(false);
    expect(result.blockedReason).toContain("diferentes");
  });

  it("a mismatch blocks even when there are far more matches than required", () => {
    const result = evaluateValidationGate({ matching: 200, mismatching: 1, available: 300 });
    expect(result.canEnable).toBe(false);
  });

  it("explains that the account lacks history, rather than implying the user is behind", () => {
    const result = evaluateValidationGate({ matching: 3, mismatching: 0, available: 3 });
    expect(result.canEnable).toBe(false);
    expect(result.blockedReason).toContain("solo tienes 3");
  });

  it("never reports more than 100% progress", () => {
    const result = evaluateValidationGate({ matching: 999, mismatching: 0, available: 999 });
    expect(result.progressPct).toBe(100);
  });

  it("is closed for a brand-new account with nothing to check", () => {
    const result = evaluateValidationGate({ matching: 0, mismatching: 0, available: 0 });
    expect(result.canEnable).toBe(false);
    expect(result.progressPct).toBe(0);
  });
});
