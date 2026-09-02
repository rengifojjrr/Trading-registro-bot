import { Decimal } from "decimal.js";

import type { CoinbaseFill, CoinbaseOrder } from "@/lib/coinbase/types";

/**
 * Las liquidaciones de Coinbase, reconocidas por lo que son.
 *
 * Cuando el margen no alcanza, Coinbase cierra posición por su cuenta con una
 * orden de tipo `LIQUIDATION` (`is_liquidation = true`). Sus fills llegan por
 * el endpoint de fills como los de cualquier otra orden y la reconstrucción
 * los aplica igual -- eso está bien: son cierres reales a precios reales. Lo
 * que faltaba era decirlo: una posición que se reduce sola sin que nadie lo
 * cuente parece un fallo de la aplicación, y no lo es.
 *
 * Confirmado con datos reales: la orden 07b1d9b4 del 1 de septiembre de 2026
 * (28 contratos de BIP-20DEC30-CDE en siete fills) llegó exactamente así.
 *
 * Puro.
 */

export function isLiquidationOrder(order: Pick<CoinbaseOrder, "order_type" | "is_liquidation">): boolean {
  return order.is_liquidation === true || order.order_type === "LIQUIDATION";
}

/**
 * Lo mismo, para una fila de `raw_orders`.
 *
 * Mira las dos cosas porque durante semanas la columna `order_type` se quedó
 * en `null` y la marca sólo vivía dentro de `raw_payload`; la migración
 * `20260902150000_liquidaciones.sql` la rellenó, pero leer las dos no cuesta
 * nada y no depende de que nadie se acuerde de rellenarla.
 */
export function isStoredLiquidationOrder(row: { order_type: string | null; raw_payload: unknown }): boolean {
  const payload =
    row.raw_payload && typeof row.raw_payload === "object"
      ? (row.raw_payload as { order_type?: unknown; is_liquidation?: unknown })
      : {};
  return isLiquidationOrder({
    order_type: row.order_type ?? (typeof payload.order_type === "string" ? payload.order_type : undefined),
    is_liquidation: payload.is_liquidation === true,
  });
}

export interface LiquidationSummary {
  orderId: string;
  productId: string;
  side: "BUY" | "SELL";
  /** Contratos cerrados por Coinbase en esta orden. */
  contracts: string;
  /** Precio medio ponderado por tamaño. */
  averagePrice: string;
  fills: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Una entrada por orden de liquidación con fills en la lista.
 *
 * Se agrupa por orden y no por fill porque lo que Coinbase decidió fue una
 * orden: siete fills de 3, 2, 5, 7, 4, 4 y 3 contratos son «una liquidación
 * de 28», no siete liquidaciones.
 */
export function summariseLiquidations(
  fills: CoinbaseFill[],
  orders: Array<Pick<CoinbaseOrder, "order_id" | "order_type" | "is_liquidation">>,
): LiquidationSummary[] {
  const liquidaciones = new Set(orders.filter(isLiquidationOrder).map((o) => o.order_id));
  if (liquidaciones.size === 0) return [];

  const porOrden = new Map<string, CoinbaseFill[]>();
  for (const fill of fills) {
    if (!liquidaciones.has(fill.order_id)) continue;
    const lista = porOrden.get(fill.order_id) ?? [];
    lista.push(fill);
    porOrden.set(fill.order_id, lista);
  }

  return [...porOrden.entries()]
    .map(([orderId, delaOrden]) => {
      const ordenados = [...delaOrden].sort((a, b) => a.trade_time.localeCompare(b.trade_time));
      let size = new Decimal(0);
      let notional = new Decimal(0);
      for (const f of ordenados) {
        const s = new Decimal(f.size).abs();
        size = size.plus(s);
        notional = notional.plus(s.times(f.price));
      }
      return {
        orderId,
        productId: ordenados[0].product_id,
        side: ordenados[0].side,
        contracts: size.toString(),
        averagePrice: size.isZero() ? "0" : notional.dividedBy(size).toFixed(2),
        fills: ordenados.length,
        firstAt: ordenados[0].trade_time,
        lastAt: ordenados[ordenados.length - 1].trade_time,
      };
    })
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

/** La frase del aviso: qué cerró Coinbase, cuánto y a qué precio. */
export function describeLiquidation(s: LiquidationSummary): string {
  const unidad = s.contracts === "1" ? "contrato" : "contratos";
  const que = s.side === "SELL" ? "vendió" : "compró";
  const ejecuciones = s.fills === 1 ? "ejecución" : "ejecuciones";
  return `Coinbase cerró por su cuenta ${s.contracts} ${unidad} de ${s.productId}: ${que} a un precio medio de ${s.averagePrice} en ${s.fills} ${ejecuciones}.`;
}
