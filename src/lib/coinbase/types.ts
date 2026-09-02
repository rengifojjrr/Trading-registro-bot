/**
 * Types mirror Coinbase's Advanced Trade API responses exactly as confirmed
 * against docs.cdp.coinbase.com on 2026-08-11 (see docs/COINBASE_INTEGRATION.md
 * for the full research trail and open questions). Do not add fields here
 * that haven't been confirmed by that documentation or a real API response
 * -- if something is uncertain, it belongs in the "open questions" doc, not
 * invented into a type.
 */

export type CoinbaseProductVenue = "CBE" | "FCM" | "INTX" | "UNKNOWN_VENUE_TYPE";

export type CoinbaseProductType =
  | "SPOT"
  | "FUTURE"
  | "EQUITY"
  | "OPTION_GROUP"
  | "FUTURE_GROUP";

export type CoinbaseContractExpiryType = "EXPIRING" | "PERPETUAL";

export type CoinbaseRiskManagedBy = "MANAGED_BY_FCM" | "MANAGED_BY_VENUE";

export interface CoinbaseFutureProductDetails {
  venue?: string;
  contract_code?: string;
  contract_expiry?: string; // RFC3339, absent for perpetuals
  contract_expiry_timezone?: string;
  contract_size?: string; // the contract multiplier
  contract_root_unit?: string;
  contract_expiry_type?: CoinbaseContractExpiryType;
  contract_display_name?: string;
  risk_managed_by?: CoinbaseRiskManagedBy;
  funding_rate?: string;
  funding_time?: string;
  funding_interval?: string;
}

export interface CoinbaseProduct {
  product_id: string;
  product_type: CoinbaseProductType;
  product_venue?: CoinbaseProductVenue;
  base_currency_id?: string;
  quote_currency_id?: string;
  base_increment?: string;
  quote_increment?: string;
  price_increment?: string;
  display_name?: string;
  /** Current price, in quote currency -- confirmed present for futures too, not just spot. */
  price?: string;
  future_product_details?: CoinbaseFutureProductDetails;
}

export type CoinbaseOrderSide = "BUY" | "SELL";

export type CoinbaseFillTradeType = "FILL" | "REVERSAL" | "CORRECTION" | "SYNTHETIC";

export type CoinbaseLiquidityIndicator = "MAKER" | "TAKER" | "UNKNOWN_LIQUIDITY_INDICATOR";

export interface CoinbaseCommissionDetail {
  total_commission?: string;
  gst_commission?: string;
  withholding_commission?: string;
  client_commission?: string;
  venue_commission?: string;
  regulatory_commission?: string;
  clearing_commission?: string;
}

export interface CoinbaseFillFutureLeg {
  product_id: string;
  combo_id: string;
  trade_id: string;
  filled_price: string;
  filled_size: string;
  side: CoinbaseOrderSide;
}

/** GET /orders/historical/fills -- one entry in `fills[]`. */
export interface CoinbaseFill {
  entry_id: string; // unique identifier for the fill -- the idempotency key
  trade_id: string; // unique only for trade_type=FILL, not for adjustments
  order_id: string;
  trade_time: string; // RFC3339
  trade_type: CoinbaseFillTradeType;
  price: string;
  size: string;
  commission: string;
  product_id: string;
  sequence_timestamp: string; // RFC3339
  liquidity_indicator?: CoinbaseLiquidityIndicator;
  size_in_quote?: boolean;
  user_id?: string;
  side: CoinbaseOrderSide;
  retail_portfolio_id?: string;
  commission_detail_total?: CoinbaseCommissionDetail;
  future_legs?: CoinbaseFillFutureLeg[];
}

export interface CoinbaseListFillsResponse {
  fills: CoinbaseFill[];
  cursor?: string;
}

export interface CoinbaseListFillsParams {
  product_ids?: string[];
  order_ids?: string[];
  product_types?: CoinbaseProductType[];
  start_sequence_timestamp?: string;
  end_sequence_timestamp?: string;
  cursor?: string;
  limit?: number;
}

export type CoinbaseOrderStatus =
  | "OPEN"
  | "FILLED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "UNKNOWN_ORDER_STATUS";

/** GET /orders/historical/{order_id} and /orders/historical/batch entries. */
export interface CoinbaseOrder {
  order_id: string;
  product_id: string;
  side: CoinbaseOrderSide;
  /**
   * MARKET, LIMIT, STOP, STOP_LIMIT, BRACKET, TWAP, ROLL_OPEN, ROLL_CLOSE,
   * LIQUIDATION, SCALED o UNKNOWN_ORDER_TYPE. `LIQUIDATION` es la orden con
   * la que Coinbase cierra posición por su cuenta cuando el margen no
   * alcanza; sus fills llegan como los de cualquier otra orden.
   */
  order_type?: string;
  /** «True if order is of liquidation type.» Confirmado con datos reales el 2026-09-01. */
  is_liquidation?: boolean;
  status: CoinbaseOrderStatus;
  created_time?: string;
  retail_portfolio_id?: string;
}

/** GET /cfm/positions -- CFM (US futures) only, used for reconciliation. */
export interface CoinbaseFuturesPosition {
  product_id: string;
  expiration_time?: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  number_of_contracts: string;
  current_price?: string;
  avg_entry_price?: string;
  unrealized_pnl?: string;
  daily_realized_pnl?: string;
}

// Confirmed against docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/products/get-product-candles
// on 2026-08-11: max 350 candles per request, every candle field is a string.
export type CoinbaseCandleGranularity =
  | "ONE_MINUTE"
  | "FIVE_MINUTE"
  | "FIFTEEN_MINUTE"
  | "THIRTY_MINUTE"
  | "ONE_HOUR"
  | "TWO_HOUR"
  | "FOUR_HOUR"
  | "SIX_HOUR"
  | "ONE_DAY";

/** GET /products/{product_id}/candles -- one entry in `candles[]`. */
export interface CoinbaseCandle {
  start: string; // unix timestamp, seconds, as a string
  low: string;
  high: string;
  open: string;
  close: string;
  volume: string;
}

export interface CoinbaseGetCandlesParams {
  start: string; // unix timestamp, seconds
  end: string; // unix timestamp, seconds
  granularity: CoinbaseCandleGranularity;
  limit?: number; // max 350
}
