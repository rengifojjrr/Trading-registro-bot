/**
 * Lo que devuelve la API v5 de Bybit, tal cual.
 *
 * Sólo los campos que se usan. Todo llega como cadena --precios, cantidades,
 * comisiones y hasta las horas en milisegundos-- y se deja así: convertirlo a
 * número aquí sería perder precisión justo en la capa que existe para reflejar
 * exactamente lo que dijo la fuente, y es la misma razón por la que las
 * columnas de dinero de Postgres llegan a TypeScript como `string`.
 */

/** Los productos de Bybit. `spot` es el que no tiene funding; ver el adaptador. */
export type BybitCategory = "spot" | "linear" | "inverse";

export const BYBIT_CATEGORIES: readonly BybitCategory[] = ["spot", "linear", "inverse"];

export function esCategoriaDeBybit(valor: string): valor is BybitCategory {
  return (BYBIT_CATEGORIES as readonly string[]).includes(valor);
}

/**
 * Por qué se movió dinero en esta fila de `/v5/execution/list`.
 *
 * Bybit mete en la misma lista las ejecuciones y los cobros que no son
 * ejecuciones, y distinguirlos es la diferencia entre una reconstrucción buena
 * y una con posiciones fantasma. Ver `esUnaEjecucionDeVerdad`.
 */
export type BybitExecType =
  | "Trade"
  | "AdlTrade"
  | "Funding"
  | "BustTrade"
  | "Delivery"
  | "Settle"
  | "BlockTrade"
  | "MovePosition"
  | "UNKNOWN";

/** Una fila de GET /v5/execution/list. */
export interface BybitExecution {
  execId: string;
  orderId: string;
  orderLinkId?: string;
  symbol: string;
  side: "Buy" | "Sell";
  execPrice: string;
  execQty: string;
  execFee: string;
  feeCurrency?: string;
  execType: BybitExecType;
  /** Milisegundos, como cadena. */
  execTime: string;
  isMaker?: boolean;
  closedSize?: string;
}

/** Una fila de GET /v5/order/history. */
export interface BybitOrder {
  orderId: string;
  orderLinkId?: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType?: string;
  orderStatus: string;
  /** Presente cuando la orden fue una reducción forzada por Bybit. */
  createType?: string;
  qty?: string;
  price?: string;
  createdTime?: string;
  updatedTime?: string;
}

/** Una fila de GET /v5/market/instruments-info. */
export interface BybitInstrument {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  contractType?: string;
  settleCoin?: string;
  lotSizeFilter?: {
    qtyStep?: string;
    minOrderQty?: string;
  };
}

/**
 * Si esta fila mueve una posición.
 *
 * `Trade` es una ejecución normal. `AdlTrade` y `BustTrade` también lo son
 * --Bybit te reduce o te cierra por riesgo-- y cuentan: las decidió el exchange
 * y no tú, pero el tamaño cambió de verdad y esconderlas dejaría una posición
 * abierta en el diario que en Bybit ya no existe. `BlockTrade` y `MovePosition`
 * igual: son ejecuciones por otra vía.
 *
 * Lo que NO cuenta es `Funding`, `Settle` y `Delivery`. Son movimientos de
 * efectivo sin cambio de tamaño, y pasarlos por ejecuciones metería entradas y
 * salidas que nunca ocurrieron: el motor de reconstrucción agrupa por
 * compras y ventas, y un cobro de funding con cantidad cero --o peor, con la
 * cantidad de la posición-- le haría creer que abriste o cerraste algo.
 *
 * `UNKNOWN` y cualquier valor nuevo que Bybit añada mañana se quedan fuera. Es
 * deliberado y es el lado seguro: una fila desconocida que se cuela como
 * ejecución corrompe la posición en silencio, y una que se queda fuera deja un
 * descuadre que la conciliación ve y canta.
 */
export function esUnaEjecucionDeVerdad(execType: BybitExecType): boolean {
  return (
    execType === "Trade" ||
    execType === "AdlTrade" ||
    execType === "BustTrade" ||
    execType === "BlockTrade" ||
    execType === "MovePosition"
  );
}

/** Si Bybit cerró esto por su cuenta, no tú. */
export function laCerroElExchange(execType: BybitExecType): boolean {
  return execType === "AdlTrade" || execType === "BustTrade";
}
