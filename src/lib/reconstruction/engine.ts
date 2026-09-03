import { Decimal } from "decimal.js";

import type {
  FillRole,
  RejectedOverride,
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
  const rejectedOverrides: RejectedOverride[] = [];
  const excludedFillIds = new Set<string>();
  /** entryId del fill que abre una operación que hay que fundir con la anterior. */
  const mergeAnchors = new Map<string, string>();

  for (const override of overrides) {
    if (!override.isActive) continue;

    if (override.overrideType === "EXCLUDE_FILL") {
      excludedFillIds.add(override.anchorFillId);
      continue;
    }

    if (override.overrideType === "MERGE") {
      mergeAnchors.set(override.anchorFillId, override.id);
      continue;
    }

    // SPLIT y REASSIGN no están sin hacer: no se pueden hacer con rigor.
    //
    // Partir una operación por la mitad exige cerrarla con la posición
    // abierta, y eso obliga a inventarse un precio de salida que nadie pagó.
    // Reasignar un fill a otra operación rompe lo único que ata el cálculo a
    // la realidad -- que la posición sale de sumar los fills en orden.
    //
    // Se rechazan diciendo por qué, no en silencio: el esquema los acepta y
    // alguien podría crear uno esperando que hiciera algo.
    unsupportedOverrideIds.push(override.id);
    rejectedOverrides.push({
      id: override.id,
      type: override.overrideType,
      reason:
        override.overrideType === "SPLIT"
          ? "Partir una operación en dos exigiría cerrarla con la posición todavía abierta, y eso obliga a inventarse un precio de salida que nadie pagó. Para separar dos operaciones, excluye el fill que las une."
          : "Mover un fill a otra operación rompe lo único que ata el cálculo a la realidad: que la posición sale de sumar los fills en orden. Para quitar un fill del cálculo, exclúyelo.",
    });
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

  // Cada producto recibe solo los ajustes de sus propios fills.
  //
  // Con el mapa entero, un ajuste del producto A lo rechazaría el barrido
  // final del producto B por «no está en el cálculo». La posición se lleva por
  // producto, así que los ajustes también.
  for (const [productId, fills] of byProduct) {
    fills.sort(compareFills);

    const delProducto = new Map<string, string>();
    const suyos = new Set(fills.map((f) => f.entryId));
    for (const [anchorFillId, overrideId] of mergeAnchors) {
      if (suyos.has(anchorFillId)) delProducto.set(anchorFillId, overrideId);
    }

    const result = reconstructProductTrades(productId, fills, delProducto);
    trades.push(...result.trades);
    rejectedOverrides.push(...result.rejected);
    unsupportedOverrideIds.push(...result.rejected.map((r) => r.id));
  }

  // Los que no son de ningún producto: el fill no existe, o quedó excluido por
  // otro ajuste, o es de los que no se clasifican. Se dice una sola vez, aquí,
  // en lugar de una vez por producto.
  const enAlgunProducto = new Set<string>();
  for (const fills of byProduct.values()) {
    for (const f of fills) enAlgunProducto.add(f.entryId);
  }
  for (const [anchorFillId, overrideId] of mergeAnchors) {
    if (enAlgunProducto.has(anchorFillId)) continue;
    unsupportedOverrideIds.push(overrideId);
    rejectedOverrides.push({
      id: overrideId,
      type: "MERGE",
      reason:
        "El fill al que apunta no está en el cálculo: o no existe, o se excluyó con otro ajuste, o es de los que el motor no clasifica.",
    });
  }

  return { trades, unclassifiedFillIds, unsupportedOverrideIds, rejectedOverrides };
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
  /**
   * Lotes de entrada que siguen abiertos, en orden de llegada.
   *
   * Es la contabilidad que hace Coinbase: cada salida cierra primero lo más
   * antiguo (FIFO), y el «precio de entrada de la posición» es el de lo que
   * queda. Se separa del WAP de todas las entradas en cuanto vuelves a
   * comprar después de un cierre parcial -- y ahí es donde la aplicación
   * decía verde y Coinbase rojo sobre la misma posición. Confirmado contra
   * `/cfm/positions` el 2026-09-02: `avg_entry_price` y `daily_realized_pnl`
   * salen de aquí, no del WAP. Ver docs/PNL_METHODOLOGY.md.
   */
  openLots: Array<{ price: Decimal; qty: Decimal }>;
  /**
   * Σ (precio de salida − precio del lote que cierra) × contratos, con el
   * signo de la dirección. En precio × contratos: sin multiplicador y sin
   * comisiones, que se aplican después.
   */
  fifoRealizedPoints: Decimal;
}

/**
 * Fundir dos operaciones que el motor separó, cuando de verdad fueron una.
 *
 * Pasa de verdad: cierras a cero por error o por un parcial que se llevó todo,
 * y vuelves a entrar a los diez segundos con la misma idea. Financieramente
 * son dos viajes de cero a cero y el motor tiene razón en separarlas; para
 * quien operaba fue una sola decisión, y las estadísticas de racha, de
 * duración y de tamaño medio salen mal contadas.
 *
 * **Sólo se funde hacia atrás y en la misma dirección.** Si el ajuste apunta a
 * un fill que no reabre justo después de un cierre, o que reabre al revés, no
 * se aplica y se dice por qué: fundir un largo con un corto daría un precio de
 * entrada que promedia compras de los dos extremos, que no significa nada.
 *
 * Que sea el mismo producto está garantizado por construcción -- esta función
 * ya recibe los fills de uno solo.
 */
function reconstructProductTrades(
  productId: string,
  fills: ReconstructionFillInput[],
  mergeAnchors: Map<string, string>,
): { trades: ReconstructedTrade[]; rejected: RejectedOverride[] } {
  const closedTrades: ReconstructedTrade[] = [];
  const rejected: RejectedOverride[] = [];
  let position = new Decimal(0);
  let current: OpenTradeAccumulator | null = null;

  /**
   * El cierre se aplaza un fill.
   *
   * Cuando la posición llega a cero no se cierra la operación de inmediato:
   * se marca la fecha y se espera al fill siguiente, porque puede traer un
   * ajuste que diga que en realidad no había que cerrarla. Cerrar y luego
   * deshacerlo obligaría a desmontar una operación ya construida.
   */
  let pendingCloseAt: string | null = null;

  /**
   * Ajustes que llegaron a mirarse.
   *
   * Sin esto, un ajuste que apunta a un fill que existe pero nunca abre una
   * operación -- porque suma a una posición ya abierta, por ejemplo -- no se
   * consultaba nunca y se ignoraba en silencio, que es exactamente lo que este
   * rechazo explícito existía para evitar. Lo encontró una prueba.
   */
  const consultados = new Set<string>();

  const flushPendingClose = () => {
    if (pendingCloseAt !== null && current) {
      closedTrades.push(finalizeTrade(current, pendingCloseAt, "CLOSED"));
      current = null;
      pendingCloseAt = null;
    }
  };

  for (const fill of fills) {
    const size = new Decimal(fill.size);
    const price = new Decimal(fill.price);
    const commission = new Decimal(fill.commission);
    const signedDelta = fill.side === "BUY" ? size : size.negated();

    if (position.isZero()) {
      const direction: TradeDirectionInternal = signedDelta.gt(0) ? "LONG" : "SHORT";
      const overrideId = mergeAnchors.get(fill.entryId);

      if (overrideId !== undefined) {
        consultados.add(overrideId);

        // Sólo se funde si hay una operación recién cerrada y va en el mismo
        // sentido. Fundir un largo con un corto daría un precio de entrada que
        // promedia compras de los dos extremos, y eso no significa nada.
        if (pendingCloseAt !== null && current && current.direction === direction) {
          pendingCloseAt = null;
          allocate(current, fill.entryId, "ENTRY", size, price, commission, current.sequenceCounter++);
          position = position.plus(signedDelta);
          continue;
        }

        rejected.push({
          id: overrideId,
          type: "MERGE",
          reason:
            pendingCloseAt === null
              ? "Este fill no reabre justo después de un cierre, así que no hay ninguna operación anterior con la que fundirlo."
              : "La operación anterior iba en el sentido contrario. Fundirlas daría un precio de entrada que promedia compras de los dos extremos, y eso no significa nada.",
        });
      }

      flushPendingClose();

      // Case A: flat -> this fill opens a brand-new trade.
      current = openTrade(productId, fill, direction);
      allocate(current, fill.entryId, "ENTRY", size, price, commission, current.sequenceCounter++);
      position = position.plus(signedDelta);
      continue;
    }

    // Cualquier fill que no abra desde cero confirma el cierre que estaba
    // esperando: ya no puede haber una fusión, porque la posición no está
    // plana. En la práctica no ocurre -- si la posición no es cero, no había
    // cierre pendiente -- pero dejarlo explícito evita que un cambio futuro
    // arrastre un cierre aplazado sin darse cuenta.
    flushPendingClose();

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
      // Cierre exacto: se aplaza un fill por si el siguiente lo funde.
      pendingCloseAt = fill.tradeTime;
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

  // Si quedó un cierre aplazado al acabarse los fills, ya no va a fundirse con
  // nada: se cierra.
  flushPendingClose();

  const trades = closedTrades;
  if (current) {
    trades.push(finalizeTrade(current, null, "OPEN"));
  }

  // Un ajuste que apunta a un fill que no existe, o que quedó excluido, no se
  // aplicó y nadie lo habría sabido.
  // Aquí solo llegan ajustes cuyo fill sí está en este producto: el caso de
  // «no está en el cálculo» lo resuelve quien llama, una sola vez.
  for (const overrideId of mergeAnchors.values()) {
    if (consultados.has(overrideId)) continue;

    rejected.push({
      id: overrideId,
      type: "MERGE",
      reason:
        "Este fill no reabre justo después de un cierre -- suma a una posición que ya estaba abierta -- así que no hay nada que fundir.",
    });
  }

  return { trades, rejected };
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
    openLots: [],
    fifoRealizedPoints: new Decimal(0),
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
    acc.openLots.push({ price, qty: size });
  } else {
    acc.exitQty = acc.exitQty.plus(size);
    acc.exitCommissions = acc.exitCommissions.plus(commission);
    acc.exitPriceWeighted = acc.exitPriceWeighted.plus(price.times(size));
    acc.localPosition = acc.localPosition.minus(size);
    consumeLotsFifo(acc, size, price);
  }
  acc.maxAbsLocalPosition = Decimal.max(acc.maxAbsLocalPosition, acc.localPosition.abs());
}

/**
 * Una salida cierra lotes empezando por el más antiguo, y lo realizado es la
 * diferencia entre el precio al que sale y el precio al que entró **ese**
 * lote -- no la media de todos.
 *
 * Dentro de una operación la posición nunca baja de cero (quien llama ya
 * partió el fill si cruzaba), así que siempre hay lote que consumir; el
 * `break` es sólo para no colgarse si alguna vez no lo hubiera.
 */
function consumeLotsFifo(acc: OpenTradeAccumulator, size: Decimal, exitPrice: Decimal) {
  let restante = size;
  while (restante.gt(0)) {
    const lote = acc.openLots[0];
    if (!lote) break;
    const consumido = Decimal.min(lote.qty, restante);
    const delta = acc.direction === "LONG" ? exitPrice.minus(lote.price) : lote.price.minus(exitPrice);
    acc.fifoRealizedPoints = acc.fifoRealizedPoints.plus(delta.times(consumido));
    lote.qty = lote.qty.minus(consumido);
    restante = restante.minus(consumido);
    if (lote.qty.isZero()) acc.openLots.shift();
  }
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

  // El precio medio de lo que sigue abierto, ponderado por lote. Null cuando
  // no queda nada: una operación cerrada no tiene «posición».
  const openLotsQty = acc.openLots.reduce((sum, lote) => sum.plus(lote.qty), new Decimal(0));
  const openLotsWap = openLotsQty.isZero()
    ? null
    : acc.openLots
        .reduce((sum, lote) => sum.plus(lote.price.times(lote.qty)), new Decimal(0))
        .dividedBy(openLotsQty);

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
    openLotsWap: openLotsWap ? openLotsWap.toString() : null,
    fifoRealizedPoints: acc.fifoRealizedPoints.toString(),
    entryCommissions: acc.entryCommissions.toString(),
    exitCommissions: acc.exitCommissions.toString(),
    entriesCount: acc.allocations.filter((a) => a.role === "ENTRY").length,
    exitsCount: acc.allocations.filter((a) => a.role === "EXIT").length,
    fillAllocations: acc.allocations,
  };
}
