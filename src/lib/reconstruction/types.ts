/**
 * Types for the reconstruction engine. All numeric fields are decimal
 * strings (never `number`) -- see docs/DATABASE.md on why: Postgres
 * `numeric` columns arrive as strings over the Supabase client, and the
 * engine uses decimal.js internally for every computation, never native
 * JS float arithmetic.
 */

export type FillRole = "ENTRY" | "EXIT";
export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface ReconstructionFillInput {
  entryId: string;
  productId: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  commission: string;
  /** RFC3339. Primary sort key, per docs/RECONCILIATION_RULES.md #1. */
  sequenceTimestamp: string;
  tradeTime: string;
  tradeType: "FILL" | "REVERSAL" | "CORRECTION" | "SYNTHETIC";
  /** True when the fill's future_legs array is non-empty (combo fill). */
  hasFutureLegs: boolean;
}

export type OverrideType = "MERGE" | "SPLIT" | "REASSIGN" | "EXCLUDE_FILL";

export interface GroupingOverrideInput {
  id: string;
  overrideType: OverrideType;
  anchorFillId: string;
  payload: unknown;
  isActive: boolean;
}

export interface ReconstructedFillAllocation {
  rawFillId: string;
  role: FillRole;
  allocatedSize: string;
  allocatedCommission: string;
  sequenceNo: number;
}

export interface ReconstructedTrade {
  /** The stable diff-upsert key -- see docs/RECONCILIATION_RULES.md #4. */
  openingFillId: string;
  productId: string;
  direction: TradeDirection;
  status: TradeStatus;
  openedAt: string;
  closedAt: string | null;
  maxSize: string;
  totalEntryQty: string;
  totalExitQty: string;
  entryWap: string;
  exitWap: string | null;
  entryCommissions: string;
  exitCommissions: string;
  entriesCount: number;
  exitsCount: number;
  fillAllocations: ReconstructedFillAllocation[];
}

export interface ReconstructionResult {
  trades: ReconstructedTrade[];
  /**
   * Fills deliberately excluded from position-lifecycle processing because
   * their semantics are not confirmed (see docs/COINBASE_INTEGRATION.md
   * open questions #1 and #2): non-FILL trade_type, or future_legs
   * non-empty. Route these to a UNCLASSIFIED_FILL notification -- never
   * silently drop or silently process them as ordinary fills.
   */
  unclassifiedFillIds: string[];
  /** Active overrides whose type the engine does not implement yet. */
  unsupportedOverrideIds: string[];
}
