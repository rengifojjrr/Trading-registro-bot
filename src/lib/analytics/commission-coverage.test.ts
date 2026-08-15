import { describe, expect, it } from "vitest";

import { evaluateCommissionCoverage } from "./commission-coverage";

describe("evaluateCommissionCoverage", () => {
  it("accepts an exact match", () => {
    const r = evaluateCommissionCoverage({ recorded: "128.40", statement: "128.40" });
    expect(r.status).toBe("MATCH");
    expect(r.impactOnNetPnl).toBe("0");
  });

  it("treats a sub-cent difference as rounding", () => {
    const r = evaluateCommissionCoverage({ recorded: "128.401", statement: "128.40" });
    expect(r.status).toBe("MATCH");
  });

  it("detects missing commissions and says the P&L is overstated", () => {
    // This is the failure mode worth catching: nothing on screen looks
    // wrong, every month just reads slightly better than it was.
    const r = evaluateCommissionCoverage({ recorded: "120.00", statement: "128.40" });
    expect(r.status).toBe("UNDER_RECORDED");
    expect(r.difference).toBe("-8.4");
    // The overstatement equals exactly what wasn't recorded.
    expect(r.impactOnNetPnl).toBe("8.4");
    expect(r.message).toContain("más ganancia de la real");
  });

  it("detects the opposite case too", () => {
    const r = evaluateCommissionCoverage({ recorded: "135.00", statement: "128.40" });
    expect(r.status).toBe("OVER_RECORDED");
    expect(r.impactOnNetPnl).toBe("-6.6");
    expect(r.message).toContain("menos ganancia de la real");
  });

  it("reports the difference as a percentage of the statement", () => {
    const r = evaluateCommissionCoverage({ recorded: "90", statement: "100" });
    expect(r.differencePct).toBeCloseTo(10, 6);
  });

  it("does not divide by a zero statement", () => {
    const r = evaluateCommissionCoverage({ recorded: "5", statement: "0" });
    expect(r.differencePct).toBeNull();
    expect(r.status).toBe("OVER_RECORDED");
  });

  it("keeps decimal precision rather than going through floats", () => {
    // 0.1 + 0.2 arithmetic in binary floats would produce 0.30000000000000004
    // here; the whole app avoids that and this must too.
    const r = evaluateCommissionCoverage({ recorded: "0.1", statement: "0.3" });
    expect(r.difference).toBe("-0.2");
  });
});
