import { describe, expect, it } from "vitest";

import {
  changedFigures,
  describeChangedFigures,
  parseStoredFigures,
  snapshotFigures,
} from "./figures";

const BASE = {
  net_pnl: "7.00",
  entry_wap: "68000",
  exit_wap: "68500",
  max_size: "2",
  total_commissions: "3.00",
};

describe("snapshotFigures", () => {
  it("keeps numbers as strings, never as floats", () => {
    // Everything downstream compares with decimal.js; a float here would
    // reintroduce the rounding this whole app avoids.
    const snapshot = snapshotFigures({ ...BASE, net_pnl: 7 });
    expect(snapshot.netPnl).toBe("7");
    expect(typeof snapshot.netPnl).toBe("string");
  });

  it("preserves nulls for an open trade with no exit yet", () => {
    const snapshot = snapshotFigures({ ...BASE, exit_wap: null, net_pnl: null });
    expect(snapshot.exitWap).toBeNull();
    expect(snapshot.netPnl).toBeNull();
  });
});

describe("changedFigures", () => {
  it("reports nothing when a recomputation reproduces the same numbers", () => {
    expect(changedFigures(snapshotFigures(BASE), snapshotFigures(BASE))).toEqual([]);
  });

  it("ignores a difference that is only in formatting", () => {
    // The regression this guards: Postgres returns "7" or "7.00" for the
    // same numeric depending on the query. Textual comparison would fire on
    // every single reconstruction and the warning would stop being believed.
    const verified = snapshotFigures(BASE);
    const current = snapshotFigures({ ...BASE, net_pnl: "7", total_commissions: "3" });
    expect(changedFigures(verified, current)).toEqual([]);
  });

  it("names exactly the figures that moved", () => {
    const verified = snapshotFigures(BASE);
    const current = snapshotFigures({ ...BASE, net_pnl: "5.00", exit_wap: "68400" });
    expect(changedFigures(verified, current).sort()).toEqual(["exitWap", "netPnl"]);
  });

  it("treats a value appearing or disappearing as a change", () => {
    const verified = snapshotFigures({ ...BASE, exit_wap: null });
    const current = snapshotFigures(BASE);
    expect(changedFigures(verified, current)).toEqual(["exitWap"]);
  });

  it("reports nothing when there is no snapshot to compare against", () => {
    // Trades verified before this feature existed have no snapshot. They
    // must not all light up as changed the first time it runs.
    expect(changedFigures(null, snapshotFigures(BASE))).toEqual([]);
  });
});

describe("parseStoredFigures", () => {
  it("round-trips a stored snapshot", () => {
    const snapshot = snapshotFigures(BASE);
    expect(parseStoredFigures(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("returns null for anything that isn't a snapshot", () => {
    expect(parseStoredFigures(null)).toBeNull();
    expect(parseStoredFigures("nope")).toBeNull();
    expect(parseStoredFigures(42)).toBeNull();
  });
});

describe("describeChangedFigures", () => {
  it("reads as a sentence in Spanish", () => {
    expect(describeChangedFigures(["netPnl"])).toBe("P&L neto");
    expect(describeChangedFigures(["netPnl", "exitWap"])).toBe(
      "P&L neto y precio medio de salida",
    );
    expect(describeChangedFigures(["netPnl", "exitWap", "maxSize"])).toBe(
      "P&L neto, precio medio de salida y tamaño máximo",
    );
  });
});
