import { Decimal } from "decimal.js";

import type { PnlInput, PnlResult } from "./types";

/**
 * Implements exactly the formula documented in docs/PNL_METHODOLOGY.md --
 * read that file before changing this one; it explains *why* this is the
 * right formula for futures (not spot) and is the source of truth this
 * code must match, not the other way around.
 *
 *   grossPnl = (exitWap - entryWap) * closedQty * contractSize   [LONG]
 *   grossPnl = (entryWap - exitWap) * closedQty * contractSize   [SHORT]
 *   netPnl   = grossPnl - (entryCommissions + exitCommissions)
 *   notional = entryWap * totalEntryQty * contractSize
 *   returnPct = netPnl / notional * 100
 *
 * Pure function, decimal.js throughout -- never native JS float math on
 * money. Returns null (not 0) for grossPnl/netPnl/returnPct when nothing
 * has been closed yet (totalExitQty === 0): an open position with no
 * exits has no realized P&L, and reporting 0 would misrepresent that as
 * "closed at breakeven".
 */
export function calculatePnl(input: PnlInput): PnlResult {
  const entryWap = new Decimal(input.entryWap);
  const totalEntryQty = new Decimal(input.totalEntryQty);
  const totalExitQty = new Decimal(input.totalExitQty);
  const contractSize = new Decimal(input.contractSize);
  const entryCommissions = new Decimal(input.entryCommissions);
  const exitCommissions = new Decimal(input.exitCommissions);

  const notionalValue = entryWap.times(totalEntryQty).times(contractSize);

  if (totalExitQty.isZero() || input.exitWap === null) {
    return {
      grossPnl: null,
      netPnl: null,
      notionalValue: notionalValue.toString(),
      returnPct: null,
    };
  }

  const exitWap = new Decimal(input.exitWap);
  const priceDelta = input.direction === "LONG" ? exitWap.minus(entryWap) : entryWap.minus(exitWap);
  const grossPnl = priceDelta.times(totalExitQty).times(contractSize);
  const netPnl = grossPnl.minus(entryCommissions).minus(exitCommissions);
  const returnPct = notionalValue.isZero() ? null : netPnl.dividedBy(notionalValue).times(100);

  return {
    grossPnl: grossPnl.toString(),
    netPnl: netPnl.toString(),
    notionalValue: notionalValue.toString(),
    returnPct: returnPct ? returnPct.toString() : null,
  };
}
