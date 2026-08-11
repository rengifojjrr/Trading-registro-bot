import type { MarketDataPort } from "../ports";
import type {
  CoinbaseFill,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "../types";

/**
 * Fully functional (unlike CfmAdapter/IntxAdapter) implementation of
 * MarketDataPort backed by a fixed, hand-designed set of Coinbase-shaped
 * fills -- never live data. Used by scripts/seed-demo-data and, from Phase
 * 3 onward, as fixtures for the reconstruction engine's test suite, so the
 * same realistic scenarios (simple long, simple short, multi-entry,
 * multi-exit, a long->short reversal) stay in exactly one place instead of
 * drifting between demo data and tests.
 *
 * MOCK_PRODUCT deliberately mirrors a real CFM nano Bitcoin futures
 * contract's shape (contract_size 0.01, EXPIRING) -- see
 * docs/COINBASE_INTEGRATION.md -- but the product_id itself is fictional
 * so it can never be confused with a real Coinbase contract code.
 */

export const MOCK_PRODUCT: CoinbaseProduct = {
  product_id: "BIT-DEMO-CDE",
  product_type: "FUTURE",
  product_venue: "FCM",
  base_currency_id: "BTC",
  quote_currency_id: "USD",
  display_name: "Nano Bitcoin Futures (Demo)",
  future_product_details: {
    venue: "FCM",
    contract_code: "BIT",
    contract_size: "0.01",
    contract_root_unit: "BTC",
    contract_expiry_type: "EXPIRING",
    contract_expiry: "2026-12-26T21:00:00Z",
    contract_expiry_timezone: "America/Chicago",
    risk_managed_by: "MANAGED_BY_FCM",
  },
};

function iso(daysAgo: number, hour: number, minute: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function fill(partial: Omit<CoinbaseFill, "trade_type" | "size_in_quote">): CoinbaseFill {
  return { trade_type: "FILL", size_in_quote: false, ...partial };
}

/**
 * Five scenarios, chosen to exercise every reconstruction case the project
 * plan calls out: a simple full-close long, a simple full-close short, a
 * long built from multiple partial entries and closed in multiple partial
 * exits, and a long->short reversal (fill 5 crosses through zero: 2
 * contracts close the existing long, 1 leftover contract opens a new
 * short).
 */
export const MOCK_FILLS: CoinbaseFill[] = [
  // Scenario 1: simple long, one entry, one exit.
  fill({
    entry_id: "demo-entry-1",
    trade_id: "demo-trade-1",
    order_id: "demo-order-1",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(12, 14, 32),
    sequence_timestamp: iso(12, 14, 32),
    side: "BUY",
    price: "61200.00",
    size: "3",
    commission: "1.80",
    liquidity_indicator: "TAKER",
  }),
  fill({
    entry_id: "demo-entry-2",
    trade_id: "demo-trade-2",
    order_id: "demo-order-2",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(12, 16, 5),
    sequence_timestamp: iso(12, 16, 5),
    side: "SELL",
    price: "61850.00",
    size: "3",
    commission: "1.86",
    liquidity_indicator: "TAKER",
  }),

  // Scenario 2: simple short, one entry, one exit.
  fill({
    entry_id: "demo-entry-3",
    trade_id: "demo-trade-3",
    order_id: "demo-order-3",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(9, 9, 3),
    sequence_timestamp: iso(9, 9, 3),
    side: "SELL",
    price: "62400.00",
    size: "5",
    commission: "3.00",
    liquidity_indicator: "MAKER",
  }),
  fill({
    entry_id: "demo-entry-4",
    trade_id: "demo-trade-4",
    order_id: "demo-order-4",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(9, 9, 47),
    sequence_timestamp: iso(9, 9, 47),
    side: "BUY",
    price: "62050.00",
    size: "5",
    commission: "2.95",
    liquidity_indicator: "TAKER",
  }),

  // Scenario 3: long built from two partial entries, closed in two partial exits.
  fill({
    entry_id: "demo-entry-5",
    trade_id: "demo-trade-5",
    order_id: "demo-order-5",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(5, 15, 0),
    sequence_timestamp: iso(5, 15, 0),
    side: "BUY",
    price: "63000.00",
    size: "2",
    commission: "1.20",
    liquidity_indicator: "TAKER",
  }),
  fill({
    entry_id: "demo-entry-6",
    trade_id: "demo-trade-6",
    order_id: "demo-order-5",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(5, 15, 4),
    sequence_timestamp: iso(5, 15, 4),
    side: "BUY",
    price: "63040.00",
    size: "2",
    commission: "1.20",
    liquidity_indicator: "TAKER",
  }),
  fill({
    entry_id: "demo-entry-7",
    trade_id: "demo-trade-7",
    order_id: "demo-order-6",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(5, 17, 30),
    sequence_timestamp: iso(5, 17, 30),
    side: "SELL",
    price: "63500.00",
    size: "2",
    commission: "1.27",
    liquidity_indicator: "MAKER",
  }),
  fill({
    entry_id: "demo-entry-8",
    trade_id: "demo-trade-8",
    order_id: "demo-order-6",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(5, 18, 2),
    sequence_timestamp: iso(5, 18, 2),
    side: "SELL",
    price: "63420.00",
    size: "2",
    commission: "1.27",
    liquidity_indicator: "MAKER",
  }),

  // Scenario 4: long -> short reversal. Opens long with 2 contracts, then a
  // single 5-contract SELL fill both closes the long (2) and opens a new
  // short (3) -- the reconstruction engine (Phase 3) must split this one
  // fill across two trades. Left OPEN (no closing fill) so the demo also
  // shows what an open position looks like.
  fill({
    entry_id: "demo-entry-9",
    trade_id: "demo-trade-9",
    order_id: "demo-order-7",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(1, 10, 0),
    sequence_timestamp: iso(1, 10, 0),
    side: "BUY",
    price: "64100.00",
    size: "2",
    commission: "1.28",
    liquidity_indicator: "TAKER",
  }),
  fill({
    entry_id: "demo-entry-10",
    trade_id: "demo-trade-10",
    order_id: "demo-order-8",
    product_id: MOCK_PRODUCT.product_id,
    trade_time: iso(1, 11, 45),
    sequence_timestamp: iso(1, 11, 45),
    side: "SELL",
    price: "63780.00",
    size: "5",
    commission: "3.19",
    liquidity_indicator: "TAKER",
  }),
];

export class MockAdapter implements MarketDataPort {
  readonly venue = "FCM" as const;

  async listFills(params: CoinbaseListFillsParams): Promise<CoinbaseFill[]> {
    let fills = MOCK_FILLS;
    if (params.product_ids?.length) {
      fills = fills.filter((f) => params.product_ids!.includes(f.product_id));
    }
    if (params.start_sequence_timestamp) {
      fills = fills.filter((f) => f.sequence_timestamp >= params.start_sequence_timestamp!);
    }
    if (params.end_sequence_timestamp) {
      fills = fills.filter((f) => f.sequence_timestamp <= params.end_sequence_timestamp!);
    }
    return fills;
  }

  async listOrders(orderIds: string[]): Promise<CoinbaseOrder[]> {
    const ids = new Set(orderIds);
    const seen = new Set<string>();
    return MOCK_FILLS.filter((f) => ids.has(f.order_id) && !seen.has(f.order_id) && seen.add(f.order_id)).map(
      (f) => ({
        order_id: f.order_id,
        product_id: f.product_id,
        side: f.side,
        status: "FILLED" as const,
        created_time: f.trade_time,
      }),
    );
  }

  async getProduct(productId: string): Promise<CoinbaseProduct> {
    if (productId !== MOCK_PRODUCT.product_id) {
      throw new Error(`MockAdapter has no product "${productId}"`);
    }
    return MOCK_PRODUCT;
  }
}
