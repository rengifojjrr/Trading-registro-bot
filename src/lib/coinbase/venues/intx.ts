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
    throw new VenueRetirado("IntxAdapter.listFills");
  }

  listOrders(_orderIds: string[]): Promise<CoinbaseOrder[]> {
    throw new VenueRetirado("IntxAdapter.listOrders");
  }

  getProduct(_productId: string): Promise<CoinbaseProduct> {
    throw new VenueRetirado("IntxAdapter.getProduct");
  }
}

/**
 * INTX no se va a implementar.
 *
 * Coinbase lo retira el 9 de septiembre de 2026 y lo sustituye por una
 * pasarela sobre Deribit que a día de hoy no está documentada públicamente.
 * Construir un adaptador para algo que se apaga en semanas, contra una API
 * que nadie ha visto, es trabajo que nace caducado; cuando exista la
 * pasarela entrará como su propio adaptador, que es exactamente para lo que
 * está la separación por venues.
 *
 * Mientras tanto el mensaje dice qué hacer, no sólo qué falta: quien acabe
 * aquí es porque tiene `COINBASE_PRODUCT_VENUE=INTX` en el entorno.
 */
class VenueRetirado extends Error {
  constructor(method: string) {
    super(
      `${method}: el venue INTX no está implementado y Coinbase lo retira el 9 de septiembre de 2026. ` +
        "Pon COINBASE_PRODUCT_VENUE=FCM, que es donde están los futuros regulados de EE. UU. " +
        "Ver docs/COINBASE_INTEGRATION.md.",
    );
    this.name = "VenueRetirado";
  }
}
