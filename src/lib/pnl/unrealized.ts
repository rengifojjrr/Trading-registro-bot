import { Decimal } from "decimal.js";

export interface UnrealizedPnlInput {
  direction: "LONG" | "SHORT";
  entryWap: string;
  currentPrice: string;
  openQty: string; // totalEntryQty - totalExitQty -- what's still open right now
  contractSize: string;
  entryCommissions: string;
}

export interface UnrealizedPnlResult {
  grossPnl: string;
  netPnl: string;
  returnPct: string | null;
}

/**
 * Mark-to-market estimate for an OPEN position using Coinbase's current
 * quoted price -- NOT the audited realized P&L in lib/pnl/calculate.ts,
 * which only exists once a position actually closes and is what trades.net_pnl
 * always holds. This is never persisted, always recomputed fresh from a live
 * price poll, and deliberately excludes exit commissions -- none have been
 * paid yet, since the position hasn't closed.
 */
export function calculateUnrealizedPnl(input: UnrealizedPnlInput): UnrealizedPnlResult {
  const entryWap = new Decimal(input.entryWap);
  const currentPrice = new Decimal(input.currentPrice);
  const openQty = new Decimal(input.openQty);
  const contractSize = new Decimal(input.contractSize);
  const entryCommissions = new Decimal(input.entryCommissions);

  const priceDelta = input.direction === "LONG" ? currentPrice.minus(entryWap) : entryWap.minus(currentPrice);
  const grossPnl = priceDelta.times(openQty).times(contractSize);
  const netPnl = grossPnl.minus(entryCommissions);
  const notionalValue = entryWap.times(openQty).times(contractSize);
  const returnPct = notionalValue.isZero() ? null : netPnl.dividedBy(notionalValue).times(100);

  return {
    grossPnl: grossPnl.toString(),
    netPnl: netPnl.toString(),
    returnPct: returnPct ? returnPct.toString() : null,
  };
}
