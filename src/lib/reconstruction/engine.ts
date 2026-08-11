import { Decimal } from "decimal.js";

import type {
  FillRole,
  GroupingOverrideInput,
  ReconstructedFillAllocation,
  ReconstructedTrade,
  ReconstructionFillInput,
  ReconstructionResult,
} from "./types";

/**
 * Pure function: (raw fills, active grouping overrides) -> reconstructed
 * trades. No I/O, no randomness, no wall-clock reads -- calling this twice
 * with the same input always produces the same output, which is what makes
 * a full recompute safe (see docs/RECONCILIATION_RULES.md #4).
 *
 * Only fills for a single account should be passed in per call; the caller
 * (the sync/reconstruction orchestrator, Phase 2) is responsible for
 * scoping raw_fills by account_id first. Multiple products in one call are
 * still handled correctly -- position is tracked independently per
 * product_id -- since that's a cheap, harmless guarantee to provide.
 */
export function reconstructTrades(
  fillsInput: ReconstructionFillInput[],
  overrides: GroupingOverrideInput[] = [],
): ReconstructionResult {
  const unsupportedOverrideIds: string[] = [];
  const excludedFillIds = new Set<string>();

  for (const override of overrides) {
    if (!override.isActive) continue;
    if (override.overrideType === "EXCLUDE_FILL") {
      excludedFillIds.add(override.anchorFillId);
    } else {
      // MERGE/SPLIT/REASSIGN are recognized by the schema and type system
      // but not implemented by the engine yet -- surfaced explicitly so a
      // caller can raise a notification, never silently ignored.
      unsupportedOverrideIds.push(override.id);
    }
  }

  const unclassifiedFillIds: string[] = [];
  const byProduct = new Map<string, ReconstructionFillInput[]>();

  for (const fill of fillsInput) {
    if (excludedFillIds.has(fill.entryId)) continue;

    // Per docs/COINBASE_INTEGRATION.md open questions #1 and #2: neither
    // adjustment fills (trade_type != FILL) nor combo fills (future_legs
    // non-empty) have confirmed single-leg-equivalent semantics. Route to
    // "unclassified" rather than guess.
    if (fill.tradeType !== "FILL" || fill.hasFutureLegs) {
      unclassifiedFillIds.push(fill.entryId);
      continue;
    }

    const list = byProduct.get(fill.productId);
    if (list) {
      list.push(fill);
    } else {
      byProduct.set(fill.productId, [fill]);
    }
  }

  const trades: ReconstructedTrade[] = [];

  for (const [productId, fills] of byProduct) {
    fills.sort(compareFills);
    trades.push(...reconstructProductTrades(productId, fills));
  }

  return { trades, unclassifiedFillIds, unsupportedOverrideIds };
}

function compareFills(a: ReconstructionFillInput, b: ReconstructionFillInput): number {
  if (a.sequenceTimestamp !== b.sequenceTimestamp) {
    return a.sequenceTimestamp < b.sequenceTimestamp ? -1 : 1;
  }
  if (a.tradeTime !== b.tradeTime) {
    return a.tradeTime < b.tradeTime ? -1 : 1;
  }
  // Stable tiebreaker per docs/RECONCILIATION_RULES.md #1.
  return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
}

type TradeDirectionInternal = "LONG" | "SHORT";

/** Mutable in-progress accumulator for the trade currently being built. */
interface OpenTradeAccumulator {
  openingFillId: string;
  productId: string;
  direction: TradeDirectionInternal;
  openedAt: string;
  allocations: ReconstructedFillAllocation[];
  entryQty: Decimal;
  exitQty: Decimal;
  entryCommissions: Decimal;
  exitCommissions: Decimal;
  /** Sum(price * allocatedSize) for ENTRY / EXIT allocations, for WAP. */
  entryPriceWeighted: Decimal;
  exitPriceWeighted: Decimal;
  /** Trade-local signed position (starts at 0), used only to compute maxSize. */
  localPosition: Decimal;
  maxAbsLocalPosition: Decimal;
  sequenceCounter: number;
}

function reconstructProductTrades(
  productId: string,
  fills: ReconstructionFillInput[],
): ReconstructedTrade[] {
  const closedTrades: ReconstructedTrade[] = [];
  let position = new Decimal(0);
  let current: OpenTradeAccumulator | null = null;

  for (const fill of fills) {
    const size = new Decimal(fill.size);
    const price = new Decimal(fill.price);
    const commission = new Decimal(fill.commission);
    const signedDelta = fill.side === "BUY" ? size : size.negated();

    if (position.isZero()) {
      // Case A: flat -> this fill opens a brand-new trade.
      current = openTrade(productId, fill, signedDelta.gt(0) ? "LONG" : "SHORT");
      allocate(current, fill.entryId, "ENTRY", size, price, commission, current.sequenceCounter++);
      position = position.plus(signedDelta);
      continue;
    }

    // From here on `current` must exist (position !== 0 implies an open trade).
    const acc = current!;
    const sameDirection = position.gt(0) === signedDelta.gt(0);

    if (sameDirection) {
      // Case B: adds to the existing position, same direction.
      allocate(acc, fill.entryId, "ENTRY", size, price, commission, acc.sequenceCounter++);
      position = position.plus(signedDelta);
      continue;
    }

    // Case C: opposes the existing position -- reduce, close, or reverse.
    const absPosition = position.abs();
    const absDelta = size; // size is already the magnitude of signedDelta
    const reduceAmount = Decimal.min(absDelta, absPosition);
    const remainderAmount = absDelta.minus(reduceAmount);

    const exitCommission = reduceAmount.isZero()
      ? new Decimal(0)
      : commission.times(reduceAmount).dividedBy(absDelta);
    allocate(acc, fill.entryId, "EXIT", reduceAmount, price, exitCommission, acc.sequenceCounter++);
    position = position.plus(signedDelta);

    if (position.isZero()) {
      // Exact close, no reversal.
      closedTrades.push(finalizeTrade(acc, fill.tradeTime, "CLOSED"));
      current = null;
      continue;
    }

    if (!remainderAmount.isZero()) {
      // Reversal: the old trade is fully closed by reduceAmount, and the
      // leftover (remainderAmount) of THE SAME FILL opens a brand-new,
      // independent trade in the opposite direction -- the DB invariant
      // trade_fills.unique(raw_fill_id, role) is exactly this: one EXIT
      // row (above) and one ENTRY row (below) for this same entryId, with
      // commission prorated between them so they sum back to the original.
      closedTrades.push(finalizeTrade(acc, fill.tradeTime, "CLOSED"));
      const entryCommission = commission.minus(exitCommission);
      const newDirection: TradeDirectionInternal = position.gt(0) ? "LONG" : "SHORT";
      current = openTrade(productId, fill, newDirection);
      allocate(
        current,
        fill.entryId,
        "ENTRY",
        remainderAmount,
        price,
        entryCommission,
        current.sequenceCounter++,
      );
    }
    // else: pure partial reduction; trade stays open, `current` unchanged.
  }

  const result = closedTrades;
  if (current) {
    result.push(finalizeTrade(current, null, "OPEN"));
  }
  return result;
}

function openTrade(
  productId: string,
  openingFill: ReconstructionFillInput,
  direction: TradeDirectionInternal,
): OpenTradeAccumulator {
  return {
    openingFillId: openingFill.entryId,
    productId,
    direction,
    openedAt: openingFill.tradeTime,
    allocations: [],
    entryQty: new Decimal(0),
    exitQty: new Decimal(0),
    entryCommissions: new Decimal(0),
    exitCommissions: new Decimal(0),
    entryPriceWeighted: new Decimal(0),
    exitPriceWeighted: new Decimal(0),
    localPosition: new Decimal(0),
    maxAbsLocalPosition: new Decimal(0),
    sequenceCounter: 0,
  };
}

function allocate(
  acc: OpenTradeAccumulator,
  rawFillId: string,
  role: FillRole,
  size: Decimal,
  price: Decimal,
  commission: Decimal,
  sequenceNo: number,
) {
  acc.allocations.push({
    rawFillId,
    role,
    allocatedSize: size.toString(),
    allocatedCommission: commission.toString(),
    sequenceNo,
  });

  if (role === "ENTRY") {
    acc.entryQty = acc.entryQty.plus(size);
    acc.entryCommissions = acc.entryCommissions.plus(commission);
    acc.entryPriceWeighted = acc.entryPriceWeighted.plus(price.times(size));
    acc.localPosition = acc.localPosition.plus(size);
  } else {
    acc.exitQty = acc.exitQty.plus(size);
    acc.exitCommissions = acc.exitCommissions.plus(commission);
    acc.exitPriceWeighted = acc.exitPriceWeighted.plus(price.times(size));
    acc.localPosition = acc.localPosition.minus(size);
  }
  acc.maxAbsLocalPosition = Decimal.max(acc.maxAbsLocalPosition, acc.localPosition.abs());
}

function finalizeTrade(
  acc: OpenTradeAccumulator,
  closedAt: string | null,
  status: "OPEN" | "CLOSED",
): ReconstructedTrade {
  const entryWap = acc.entryQty.isZero()
    ? new Decimal(0)
    : acc.entryPriceWeighted.dividedBy(acc.entryQty);
  const exitWap = acc.exitQty.isZero() ? null : acc.exitPriceWeighted.dividedBy(acc.exitQty);

  return {
    openingFillId: acc.openingFillId,
    productId: acc.productId,
    direction: acc.direction,
    status,
    openedAt: acc.openedAt,
    closedAt,
    maxSize: acc.maxAbsLocalPosition.toString(),
    totalEntryQty: acc.entryQty.toString(),
    totalExitQty: acc.exitQty.toString(),
    entryWap: entryWap.toString(),
    exitWap: exitWap ? exitWap.toString() : null,
    entryCommissions: acc.entryCommissions.toString(),
    exitCommissions: acc.exitCommissions.toString(),
    entriesCount: acc.allocations.filter((a) => a.role === "ENTRY").length,
    exitsCount: acc.allocations.filter((a) => a.role === "EXIT").length,
    fillAllocations: acc.allocations,
  };
}
