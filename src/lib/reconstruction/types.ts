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

/**
 * Un ajuste manual que el motor no aplicó, y por qué.
 *
 * `SPLIT` y `REASSIGN` no se rechazan por estar sin hacer: **no se pueden
 * hacer con rigor**. Partir una operación por la mitad exige cerrarla con la
 * posición abierta, y eso obliga a inventarse un precio de salida que nadie
 * pagó; reasignar un fill a otra operación rompe la única cosa que ata el
 * cálculo a la realidad, que es que la posición sale de sumar los fills en
 * orden. Un número inventado que parece calculado es peor que no tener el
 * número.
 *
 * Se rechazan diciéndolo, no en silencio: el esquema los acepta desde el
 * principio y alguien podría crear uno esperando que hiciera algo.
 */
export interface RejectedOverride {
  id: string;
  type: OverrideType;
  reason: string;
}

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
  /**
   * Ajustes que no se pudieron aplicar, con el motivo.
   *
   * Antes sólo se devolvía la lista de identificadores, así que la aplicación
   * podía decir «hay un ajuste sin aplicar» y no por qué. Un aviso que no dice
   * qué hacer es uno que se ignora.
   */
  rejectedOverrides: RejectedOverride[];
}
