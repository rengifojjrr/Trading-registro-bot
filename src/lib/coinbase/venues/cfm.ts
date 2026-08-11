import type { MarketDataPort, PositionsPort } from "../ports";
import type {
  CoinbaseFill,
  CoinbaseFuturesPosition,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "../types";

/**
 * Coinbase Financial Markets (CFM): CFTC-regulated US futures, the
 * recommended default venue (see docs/COINBASE_INTEGRATION.md -- INTX is
 * being retired 2026-09-09). Implements MarketDataPort against
 * /orders/historical/fills, /orders/historical/batch, /products/{id}, plus
 * the CFM-only PositionsPort via /cfm/positions.
 *
 * Deliberately unimplemented in Phase 1: the project plan explicitly keeps
 * "adapter interfaces, no live calls" separate from "Phase 2: real Coinbase
 * importer". This class exists now so the MarketDataPort/PositionsPort
 * interfaces are proven to typecheck against a real venue, not just the
 * mock adapter -- but every method throws until Phase 2 wires in
 * lib/coinbase/client.ts (the authenticated HTTP client) and real
 * credentials have passed the reconstruction-engine test suite.
 */
export class CfmAdapter implements MarketDataPort, PositionsPort {
  readonly venue = "FCM" as const;

  listFills(_params: CoinbaseListFillsParams): Promise<CoinbaseFill[]> {
    throw new NotImplementedUntilPhase2("CfmAdapter.listFills");
  }

  listOrders(_orderIds: string[]): Promise<CoinbaseOrder[]> {
    throw new NotImplementedUntilPhase2("CfmAdapter.listOrders");
  }

  getProduct(_productId: string): Promise<CoinbaseProduct> {
    throw new NotImplementedUntilPhase2("CfmAdapter.getProduct");
  }

  listOpenPositions(): Promise<CoinbaseFuturesPosition[]> {
    throw new NotImplementedUntilPhase2("CfmAdapter.listOpenPositions");
  }
}

class NotImplementedUntilPhase2 extends Error {
  constructor(method: string) {
    super(
      `${method} is not implemented yet. Live Coinbase sync is built in Phase 2, after the reconstruction engine's test suite passes -- see docs/COINBASE_INTEGRATION.md.`,
    );
    this.name = "NotImplementedUntilPhase2";
  }
}
