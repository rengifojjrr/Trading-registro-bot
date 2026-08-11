import type {
  CoinbaseCandle,
  CoinbaseFill,
  CoinbaseFuturesPosition,
  CoinbaseGetCandlesParams,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "./types";

/**
 * The seam the rest of the app depends on. lib/reconstruction and the sync
 * pipeline talk to this interface only -- never to a venue module or the
 * HTTP client directly. This is what lets CFM, INTX, and (whenever it
 * exists) the Deribit-powered gateway that replaces INTX be swapped without
 * touching reconstruction, the P&L engine, or the dashboard.
 *
 * Two capabilities (positions, balance) are optional because they are
 * confirmed CFM-only today -- see docs/COINBASE_INTEGRATION.md. A venue
 * adapter that doesn't support one simply omits it; callers must treat it
 * as "unavailable for this venue", never fall back to a guess.
 */
export interface MarketDataPort {
  readonly venue: "FCM" | "INTX";

  /** Paginates GET /orders/historical/fills to completion for the given window. */
  listFills(params: CoinbaseListFillsParams): Promise<CoinbaseFill[]>;

  listOrders(orderIds: string[]): Promise<CoinbaseOrder[]>;

  getProduct(productId: string): Promise<CoinbaseProduct>;
}

export interface PositionsPort {
  listOpenPositions(): Promise<CoinbaseFuturesPosition[]>;
}

/**
 * Optional like PositionsPort -- confirmed CFM-only for now (INTX's
 * retirement means it was never worth wiring up there; the mock adapter
 * has no need for it since demo trades are never shown against real
 * market data, in keeping with never fabricating a chart for a fake trade).
 */
export interface ChartDataPort {
  getCandles(productId: string, params: CoinbaseGetCandlesParams): Promise<CoinbaseCandle[]>;
}

/** Union type callers use when a venue's optional capabilities matter. */
export type CoinbaseAdapter = MarketDataPort & Partial<PositionsPort> & Partial<ChartDataPort>;
