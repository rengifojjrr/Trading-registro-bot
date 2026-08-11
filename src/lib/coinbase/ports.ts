import type {
  CoinbaseFill,
  CoinbaseFuturesPosition,
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

/** Union type callers use when a venue's optional capabilities matter. */
export type CoinbaseAdapter = MarketDataPort & Partial<PositionsPort>;
