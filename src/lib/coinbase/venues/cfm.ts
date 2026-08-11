import { CoinbaseRestClient, type CoinbaseClientConfig } from "../client";
import type { ChartDataPort, MarketDataPort, PositionsPort } from "../ports";
import type {
  CoinbaseCandle,
  CoinbaseFill,
  CoinbaseFuturesPosition,
  CoinbaseGetCandlesParams,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "../types";

/**
 * Coinbase Financial Markets (CFM): CFTC-regulated US futures, the
 * recommended default venue (see docs/COINBASE_INTEGRATION.md -- INTX is
 * being retired 2026-09-09). Implements MarketDataPort against
 * /orders/historical/fills, /products/{id}, plus the CFM-only
 * PositionsPort via /cfm/positions.
 *
 * UNVERIFIED AGAINST LIVE COINBASE -- see client.ts's file comment. Every
 * field mapping below traces to a confirmed field in
 * docs/COINBASE_INTEGRATION.md; nothing here was guessed.
 */
export class CfmAdapter implements MarketDataPort, PositionsPort, ChartDataPort {
  readonly venue = "FCM" as const;
  private readonly client: CoinbaseRestClient;

  constructor(config: CoinbaseClientConfig) {
    this.client = new CoinbaseRestClient(config);
  }

  async listFills(params: CoinbaseListFillsParams): Promise<CoinbaseFill[]> {
    const fills: CoinbaseFill[] = [];
    for await (const page of this.client.paginate<CoinbaseFill>(
      "/orders/historical/fills",
      "fills",
      {
        product_ids: params.product_ids,
        order_ids: params.order_ids,
        product_types: params.product_types,
        start_sequence_timestamp: params.start_sequence_timestamp,
        end_sequence_timestamp: params.end_sequence_timestamp,
        limit: params.limit ?? 100,
      },
    )) {
      fills.push(...page);
    }
    return fills;
  }

  async listOrders(orderIds: string[]): Promise<CoinbaseOrder[]> {
    // GET /orders/historical/batch's exact filter-by-order_ids query
    // parameter was not confirmed during research (see
    // docs/COINBASE_INTEGRATION.md), so this fetches orders individually
    // via the confirmed single-order endpoint instead of guessing a batch
    // param name. Fine for the sync engine's actual usage (looking up the
    // handful of orders behind a batch of new fills), not meant for bulk
    // order history backfill.
    const orders: CoinbaseOrder[] = [];
    for (const orderId of orderIds) {
      const response = await this.client.get<{ order: CoinbaseOrder }>(
        `/orders/historical/${encodeURIComponent(orderId)}`,
      );
      orders.push(response.order);
    }
    return orders;
  }

  async getProduct(productId: string): Promise<CoinbaseProduct> {
    return this.client.get<CoinbaseProduct>(`/products/${encodeURIComponent(productId)}`);
  }

  async listOpenPositions(): Promise<CoinbaseFuturesPosition[]> {
    const response = await this.client.get<{ positions: CoinbaseFuturesPosition[] }>(
      "/cfm/positions",
    );
    return response.positions;
  }

  async getCandles(productId: string, params: CoinbaseGetCandlesParams): Promise<CoinbaseCandle[]> {
    const response = await this.client.get<{ candles: CoinbaseCandle[] }>(
      `/products/${encodeURIComponent(productId)}/candles`,
      {
        start: params.start,
        end: params.end,
        granularity: params.granularity,
        limit: params.limit,
      },
    );
    return response.candles;
  }
}
