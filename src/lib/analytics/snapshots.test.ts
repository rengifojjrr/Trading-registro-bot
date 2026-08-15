import { describe, expect, it } from "vitest";

import { computeDailyBalances, computeSnapshots } from "./snapshots";
import type { TradeForStats } from "./stats";

function trade(overrides: Partial<TradeForStats> & { id: string }): TradeForStats {
  return {
    status: "CLOSED",
    openedAt: "2026-03-02T10:00:00Z",
    closedAt: "2026-03-02T14:00:00Z",
    netPnl: "10",
    grossPnl: "12",
    totalCommissions: "2",
    ...overrides,
  };
}

describe("computeSnapshots", () => {
  it("buckets a trade by the day it closed, not the day it opened", () => {
    // An overnight position's result hits the account on the closing day.
    // Bucketing by open would put it on a day whose realised P&L doesn't
    // include it, and the daily rows would stop adding up to the month.
    const overnight = trade({
      id: "a",
      openedAt: "2026-03-02T22:00:00Z",
      closedAt: "2026-03-03T05:00:00Z",
    });

    const days = computeSnapshots([overnight], "UTC", ["DAY"]);

    expect(days).toHaveLength(1);
    expect(days[0].periodStart).toBe("2026-03-03");
  });

  it("buckets in the user's timezone, not UTC", () => {
    // 02:00 UTC on the 3rd is still the 2nd in Bogotá. Getting this wrong
    // shifts a trade to the wrong day for every user west of Greenwich.
    const t = trade({ id: "a", closedAt: "2026-03-03T02:00:00Z" });

    expect(computeSnapshots([t], "UTC", ["DAY"])[0].periodStart).toBe("2026-03-03");
    expect(computeSnapshots([t], "America/Bogota", ["DAY"])[0].periodStart).toBe("2026-03-02");
  });

  it("aggregates several trades in one day", () => {
    const rows = computeSnapshots(
      [
        trade({ id: "a", netPnl: "10", grossPnl: "12", totalCommissions: "2" }),
        trade({ id: "b", netPnl: "-4", grossPnl: "-2", totalCommissions: "2" }),
      ],
      "UTC",
      ["DAY"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].tradesCount).toBe(2);
    expect(rows[0].wins).toBe(1);
    expect(rows[0].losses).toBe(1);
    expect(rows[0].netPnl).toBe("6");
    expect(rows[0].commissions).toBe("4");
  });

  it("rolls the same trades up into week and month buckets", () => {
    const rows = computeSnapshots(
      [
        trade({ id: "a", closedAt: "2026-03-02T14:00:00Z", netPnl: "10" }),
        trade({ id: "b", closedAt: "2026-03-05T14:00:00Z", netPnl: "5" }),
        trade({ id: "c", closedAt: "2026-03-20T14:00:00Z", netPnl: "-3" }),
      ],
      "UTC",
    );

    const days = rows.filter((r) => r.periodType === "DAY");
    const weeks = rows.filter((r) => r.periodType === "WEEK");
    const months = rows.filter((r) => r.periodType === "MONTH");

    expect(days).toHaveLength(3);
    expect(weeks).toHaveLength(2); // 2 y 5 de marzo caen en la misma semana ISO
    expect(months).toHaveLength(1);
    expect(months[0].netPnl).toBe("12");
    expect(months[0].periodStart).toBe("2026-03-01");
  });

  it("ignores open trades entirely", () => {
    const open = trade({ id: "open", status: "OPEN", closedAt: null, netPnl: null });
    expect(computeSnapshots([open], "UTC")).toEqual([]);
  });

  it("records which trade was best and worst that day", () => {
    const rows = computeSnapshots(
      [trade({ id: "good", netPnl: "20" }), trade({ id: "bad", netPnl: "-8" })],
      "UTC",
      ["DAY"],
    );

    expect(rows[0].bestTradeId).toBe("good");
    expect(rows[0].worstTradeId).toBe("bad");
  });
});

describe("computeDailyBalances", () => {
  it("accumulates realised P&L into a running equity", () => {
    const rows = computeDailyBalances(
      [
        trade({ id: "a", closedAt: "2026-03-02T14:00:00Z", netPnl: "10" }),
        trade({ id: "b", closedAt: "2026-03-03T14:00:00Z", netPnl: "-4" }),
        trade({ id: "c", closedAt: "2026-03-04T14:00:00Z", netPnl: "7" }),
      ],
      "UTC",
    );

    expect(rows.map((r) => [r.balanceDate, r.realizedPnl, r.equity])).toEqual([
      ["2026-03-02", "10", "10"],
      ["2026-03-03", "-4", "6"],
      ["2026-03-04", "7", "13"],
    ]);
  });

  it("returns nothing when there is nothing closed", () => {
    expect(computeDailyBalances([], "UTC")).toEqual([]);
  });
});
