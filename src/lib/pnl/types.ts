export type PnlDirection = "LONG" | "SHORT";

export interface PnlInput {
  direction: PnlDirection;
  entryWap: string;
  /** Weighted-average exit price over whatever has been closed so far. Null if nothing has been exited yet. */
  exitWap: string | null;
  totalEntryQty: string;
  /** The realized/closed quantity -- gross P&L is computed on this, not totalEntryQty. */
  totalExitQty: string;
  entryCommissions: string;
  exitCommissions: string;
  /** products.contract_size for this trade's product -- never hardcode this. */
  contractSize: string;
}

export interface PnlResult {
  /** Null when totalExitQty is 0 -- nothing realized yet, not zero. */
  grossPnl: string | null;
  netPnl: string | null;
  notionalValue: string;
  returnPct: string | null;
}
