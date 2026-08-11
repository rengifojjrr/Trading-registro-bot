import type { MarketDataPort } from "../ports";
import type {
  CoinbaseFill,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "../types";

/**
 * !!! EXPERIMENTAL / DEPRECATED !!!
 *
 * INTX (Coinbase's international perpetual futures venue) is being retired
 * by Coinbase itself on 2026-09-09, replaced by an as-yet-undocumented
 * "Deribit-powered gateway" (confirmed via docs.cdp.coinbase.com on
 * 2026-08-11 -- see docs/COINBASE_INTEGRATION.md). Do not build new
 * features against this adapter. It exists only so a user who currently
 * trades INTX isn't blocked from configuring the app; FCM (CfmAdapter) is
 * the durable, recommended default (see app_settings.active_venue).
 *
 * No PositionsPort implementation: INTX position reconciliation was never
 * confirmed against documentation, unlike CFM's /cfm/positions.
 *
 * Unimplemented in Phase 1 for the same reason as CfmAdapter -- see that
 * file's comment. When the replacement gateway is eventually documented,
 * this file (not the reconstruction engine or anything else in the app) is
 * what gets replaced.
 */
export class IntxAdapter implements MarketDataPort {
  readonly venue = "INTX" as const;

  listFills(_params: CoinbaseListFillsParams): Promise<CoinbaseFill[]> {
    throw new NotImplementedUntilPhase2("IntxAdapter.listFills");
  }

  listOrders(_orderIds: string[]): Promise<CoinbaseOrder[]> {
    throw new NotImplementedUntilPhase2("IntxAdapter.listOrders");
  }

  getProduct(_productId: string): Promise<CoinbaseProduct> {
    throw new NotImplementedUntilPhase2("IntxAdapter.getProduct");
  }
}

class NotImplementedUntilPhase2 extends Error {
  constructor(method: string) {
    super(
      `${method} is not implemented yet, and INTX itself retires 2026-09-09 per Coinbase. Confirm you actually need this venue before Phase 2 builds it out -- see docs/COINBASE_INTEGRATION.md.`,
    );
    this.name = "NotImplementedUntilPhase2";
  }
}
