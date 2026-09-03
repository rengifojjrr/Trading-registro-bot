export type PnlDirection = "LONG" | "SHORT";

export interface PnlInput {
  direction: PnlDirection;
  entryWap: string;
  /** Weighted-average exit price over whatever has been closed so far. Null if nothing has been exited yet. */
  exitWap: string | null;
  totalEntryQty: string;
  /** The realized/closed quantity -- gross P&L is computed on this, not totalEntryQty. */
  totalExitQty: string;
  entryCommissions: string;
  exitCommissions: string;
  /** products.contract_size for this trade's product -- never hardcode this. */
  contractSize: string;
  /**
   * Lo realizado por lotes FIFO, en precio × contratos (lo que devuelve el
   * motor de reconstrucción en `fifoRealizedPoints`). Si se da, el P&L bruto
   * es esto × contractSize en vez de (WAP salida − WAP entrada) × cerrado ×
   * contractSize. Se pasa **sólo para operaciones abiertas**: cerradas, las
   * dos fórmulas dan lo mismo, y la de los WAP se mantiene para que las
   * cifras guardadas -- y verificadas -- no cambien ni en el último decimal.
   * Ver docs/PNL_METHODOLOGY.md, «Operación abierta».
   */
  fifoRealizedPoints?: string | null;
}

export interface PnlResult {
  /** Null when totalExitQty is 0 -- nothing realized yet, not zero. */
  grossPnl: string | null;
  netPnl: string | null;
  notionalValue: string;
  returnPct: string | null;
}
