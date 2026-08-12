import { Decimal } from "decimal.js";

/**
 * Margin/risk sizing math for Coinbase CFM nano BTC futures (BIP), ported
 * from a standalone HTML calculator the user validated by hand (worked
 * example: capital 5,800, reserve 1,000, entry 63,710, risk price 49,000,
 * MMR 10%, target margin ratio 75% -> 22 contracts, 0.22 BTC, notional
 * 14,016.20, leverage 2.42x, loss at risk 3,236.20 -- see margin.test.ts).
 * Generalized from that LONG-only prototype to also cover SHORT, and
 * ported to Decimal instead of plain floats for the same reason every
 * other money calculation in this app uses it (see lib/pnl/*).
 *
 * "Risk price" is NOT a liquidation price. It's the price level at which
 * the position's estimated Margin Ratio (maintenance margin / equity)
 * reaches the user's own configured targetMarginRatio -- a survivability
 * threshold the user chooses, not a guarantee from Coinbase. Real
 * liquidation depends on Coinbase's live margin requirements, funding,
 * other balances/positions, and rule changes -- none of which this model
 * has access to. Coinbase's own Margin Ratio and liquidation estimate are
 * always the operative source of truth.
 */

export type Direction = "LONG" | "SHORT";

export interface MarginConstants {
  /** Fraction, e.g. "0.10" for 10%. No live Coinbase endpoint exposes this -- user-entered, see app_settings.maintenance_margin_rate. */
  maintenanceMarginRate: string;
  /** Fraction, e.g. "0.75" for 75%. The survivability cushion at the risk price -- see app_settings.target_margin_ratio. */
  targetMarginRatio: string;
  /** Fraction per hour, e.g. Coinbase's products.raw_metadata funding_rate, or a user override. */
  fundingRatePerHour: string;
  /** Fraction, e.g. "0.0002" for 0.02% per side. */
  tradingFeePct: string;
  /** USD floor per contract per side. */
  minFeePerContract: string;
  /** BTC per contract -- products.contract_size, e.g. "0.01". */
  contractSize: string;
}

/**
 * The slow-changing, user-configured subset of MarginConstants (see
 * app_settings' maintenance_margin_rate/target_margin_ratio/trading_fee_pct/
 * min_fee_per_contract columns) -- excludes fundingRatePerHour and
 * contractSize, which come from live per-product Coinbase data
 * (lib/risk/product-margin.ts, products.contract_size) rather than a
 * setting, and so vary per call site rather than being loaded once.
 */
export type RiskConstants = Pick<
  MarginConstants,
  "maintenanceMarginRate" | "targetMarginRatio" | "tradingFeePct" | "minFeePerContract"
>;

export interface SizingInput extends MarginConstants {
  direction: Direction;
  /** Total account capital being considered, USD. */
  capital: string;
  /** Portion of capital excluded from what's risked, USD. */
  reserveCash: string;
  entryPrice: string;
  /** Price level to survive with margin ratio still under target -- must be on the adverse side of entryPrice for `direction`. */
  riskPrice: string;
  hoursOpen: string;
}

export interface SizingResult {
  contracts: number;
  btcExposure: string;
  notional: string;
  /** notional / capital. Null when capital is zero. */
  leverage: string | null;
  lossAtRisk: string;
  equityAtRisk: string;
  maintenanceAtRisk: string;
  /** Null represents "infinite" (equity at risk has already hit zero or below). */
  marginRatioAtRisk: string | null;
  roundtripFees: string;
  /** Signed: negative means an estimated funding credit, not a cost. */
  fundingCost: string;
  totalCost: string;
}

function roundTripCost(notional: Decimal, contracts: number, feePct: Decimal, minFee: Decimal): Decimal {
  const perSide = Decimal.max(notional.times(feePct), minFee.times(contracts));
  return perSide.times(2);
}

/**
 * Direction-agnostic "how far against you" price distance -- positive
 * when riskPrice is on the losing side of entryPrice for `direction`,
 * matching the (entry - risk) term the original LONG-only model used.
 */
function adverseDelta(direction: Direction, entry: Decimal, risk: Decimal): Decimal {
  return direction === "LONG" ? entry.minus(risk) : risk.minus(entry);
}

/**
 * Maximum whole contracts such that, if price reaches riskPrice, the
 * estimated Margin Ratio stays at or under targetMarginRatio. Iterates
 * because per-contract minimum fees and funding cost both scale with the
 * position size being solved for (same approach as the original model:
 * resolve at a candidate size, recompute fixed costs, repeat until the
 * candidate stops changing).
 */
export function calculateMaxContracts(input: SizingInput): SizingResult {
  const capital = new Decimal(input.capital);
  const reserve = new Decimal(input.reserveCash);
  const entry = new Decimal(input.entryPrice);
  const risk = new Decimal(input.riskPrice);
  const hours = new Decimal(input.hoursOpen);
  const mmr = new Decimal(input.maintenanceMarginRate);
  const targetMR = new Decimal(input.targetMarginRatio);
  const fundingRate = new Decimal(input.fundingRatePerHour);
  const feePct = new Decimal(input.tradingFeePct);
  const minFee = new Decimal(input.minFeePerContract);
  const contractSize = new Decimal(input.contractSize);

  const usable = Decimal.max(0, capital.minus(reserve));
  const delta = adverseDelta(input.direction, entry, risk);

  let contracts = 0;
  if (usable.gt(0) && delta.gt(0) && risk.gt(0) && targetMR.gt(0) && mmr.gt(0) && contractSize.gt(0)) {
    let n = 1;
    for (let i = 0; i < 25; i++) {
      const q = contractSize.times(n);
      const notional = entry.times(q);
      const roundtrip = roundTripCost(notional, n, feePct, minFee);
      const fundingCost = Decimal.max(0, fundingRate).times(hours).times(notional);
      const fixed = roundtrip.plus(fundingCost);
      const denom = delta.plus(mmr.times(risk).dividedBy(targetMR));
      const qMax = Decimal.max(0, usable.minus(fixed)).dividedBy(denom);
      const nCandidate = Math.max(0, Math.floor(qMax.dividedBy(contractSize).toNumber() + 1e-9));
      if (nCandidate === n) break;
      n = nCandidate;
    }
    contracts = n;
  }

  const q = contractSize.times(contracts);
  const notional = entry.times(q);
  const roundtrip = roundTripCost(notional, contracts, feePct, minFee);
  const fundingSigned = fundingRate.times(hours).times(notional);
  const costs = roundtrip.plus(fundingSigned);
  const pnlAtRisk = q.times(risk.minus(entry)).times(input.direction === "LONG" ? 1 : -1);
  const equityAtRisk = capital.minus(reserve).plus(pnlAtRisk).minus(costs);
  const maintenanceAtRisk = mmr.times(q).times(risk);
  const marginRatioAtRisk = equityAtRisk.gt(0) ? maintenanceAtRisk.dividedBy(equityAtRisk) : null;

  return {
    contracts,
    btcExposure: q.toString(),
    notional: notional.toString(),
    leverage: capital.gt(0) ? notional.dividedBy(capital).toString() : null,
    lossAtRisk: pnlAtRisk.abs().toString(),
    equityAtRisk: equityAtRisk.toString(),
    maintenanceAtRisk: maintenanceAtRisk.toString(),
    marginRatioAtRisk: marginRatioAtRisk ? marginRatioAtRisk.toString() : null,
    roundtripFees: roundtrip.toString(),
    fundingCost: fundingSigned.toString(),
    totalCost: costs.toString(),
  };
}

export interface LivePositionInput extends MarginConstants {
  direction: Direction;
  capital: string;
  reserveCash: string;
  entryPrice: string;
  /** Contracts currently open -- fixed, not solved for. */
  contracts: string;
  /** Commissions already paid on entry fills -- there's no hypothetical round-trip here, the position already exists. */
  entryCommissions: string;
}

export interface RiskPriceResult {
  /** Null when the position can't reach the target ratio at any finite adverse price under these inputs (e.g. capital <= 0). */
  riskPrice: string | null;
}

/**
 * Inverse of calculateMaxContracts: given an ALREADY-OPEN position's fixed
 * size, solves for the price at which the estimated Margin Ratio would
 * reach targetMarginRatio, instead of solving for size given a chosen
 * price. Derivation mirrors the same maintenance/equity = targetMR
 * constraint (see file docstring); solved algebraically for price here
 * rather than iterated, since contracts is fixed and price is the unknown.
 */
export function calculateRiskPriceForPosition(input: LivePositionInput): RiskPriceResult {
  const capital = new Decimal(input.capital);
  const reserve = new Decimal(input.reserveCash);
  const entry = new Decimal(input.entryPrice);
  const contracts = new Decimal(input.contracts);
  const mmr = new Decimal(input.maintenanceMarginRate);
  const targetMR = new Decimal(input.targetMarginRatio);
  const entryCommissions = new Decimal(input.entryCommissions);
  const contractSize = new Decimal(input.contractSize);

  const q = contractSize.times(contracts);
  const usable = Decimal.max(0, capital.minus(reserve)).minus(entryCommissions);
  const s = input.direction === "LONG" ? new Decimal(1) : new Decimal(-1);

  if (q.lte(0) || targetMR.lte(0) || mmr.lte(0)) return { riskPrice: null };

  const denom = q.times(mmr.minus(targetMR.times(s)));
  if (denom.isZero()) return { riskPrice: null };

  const numerator = targetMR.times(usable.minus(s.times(q).times(entry)));
  const price = numerator.dividedBy(denom);

  // A negative solution means the target ratio is never reached on the
  // adverse side at any positive price under these inputs (e.g. targetMR
  // is looser than what the position could ever reach) -- report
  // "unreachable" rather than a nonsensical negative price.
  return { riskPrice: price.gt(0) ? price.toString() : null };
}

export interface MarginRatioAtPriceResult {
  equity: string;
  maintenanceMargin: string;
  /** Null represents "infinite" -- equity has already hit zero or below at this price. */
  marginRatio: string | null;
}

/** Actual (not hypothetical) Margin Ratio for an open position at a given price -- e.g. the live-polled current price, no solving involved. */
export function calculateMarginRatioAtPrice(input: LivePositionInput, price: string): MarginRatioAtPriceResult {
  const capital = new Decimal(input.capital);
  const reserve = new Decimal(input.reserveCash);
  const entry = new Decimal(input.entryPrice);
  const contracts = new Decimal(input.contracts);
  const mmr = new Decimal(input.maintenanceMarginRate);
  const entryCommissions = new Decimal(input.entryCommissions);
  const contractSize = new Decimal(input.contractSize);
  const p = new Decimal(price);

  const q = contractSize.times(contracts);
  const s = input.direction === "LONG" ? 1 : -1;
  const pnl = q.times(p.minus(entry)).times(s);
  const equity = capital.minus(reserve).minus(entryCommissions).plus(pnl);
  const maintenanceMargin = mmr.times(q).times(p);
  const marginRatio = equity.gt(0) ? maintenanceMargin.dividedBy(equity) : null;

  return {
    equity: equity.toString(),
    maintenanceMargin: maintenanceMargin.toString(),
    marginRatio: marginRatio ? marginRatio.toString() : null,
  };
}
