import { describe, expect, it } from "vitest";

import type { CoinbaseFill, CoinbaseOrder } from "@/lib/coinbase/types";

import { describeLiquidation, isLiquidationOrder, summariseLiquidations } from "./liquidations";

function fill(orderId: string, size: string, price: string, tradeTime: string): CoinbaseFill {
  return {
    entry_id: `${orderId}-${tradeTime}`,
    trade_id: "t",
    order_id: orderId,
    trade_time: tradeTime,
    trade_type: "FILL",
    price,
    size,
    commission: "0",
    product_id: "BIP-20DEC30-CDE",
    sequence_timestamp: tradeTime,
    side: "SELL",
  };
}

function order(orderId: string, extra: Partial<CoinbaseOrder>): CoinbaseOrder {
  return { order_id: orderId, product_id: "BIP-20DEC30-CDE", side: "SELL", status: "FILLED", ...extra };
}

describe("isLiquidationOrder", () => {
  it("reconoce la orden por el tipo o por la marca", () => {
    expect(isLiquidationOrder({ order_type: "LIQUIDATION" })).toBe(true);
    expect(isLiquidationOrder({ is_liquidation: true, order_type: "MARKET" })).toBe(true);
    expect(isLiquidationOrder({ order_type: "MARKET", is_liquidation: false })).toBe(false);
    expect(isLiquidationOrder({})).toBe(false);
  });
});

describe("summariseLiquidations", () => {
  // La liquidación real del 1 de septiembre de 2026: 28 contratos en siete fills.
  const fills = [
    fill("liq", "3", "77365", "2026-09-01T20:05:31Z"),
    fill("liq", "2", "77365", "2026-09-01T20:05:32Z"),
    fill("liq", "5", "77355", "2026-09-01T20:05:36Z"),
    fill("liq", "7", "77355", "2026-09-01T20:05:40Z"),
    fill("liq", "4", "77355", "2026-09-01T20:05:44Z"),
    fill("liq", "4", "77345", "2026-09-01T20:05:46Z"),
    fill("liq", "3", "77315", "2026-09-01T20:05:49Z"),
    fill("normal", "10", "77000", "2026-09-01T18:29:43Z"),
  ];

  it("agrupa los fills de la orden de liquidación y deja fuera los demás", () => {
    const r = summariseLiquidations(fills, [
      order("liq", { order_type: "LIQUIDATION", is_liquidation: true }),
      order("normal", { order_type: "MARKET" }),
    ]);

    expect(r).toHaveLength(1);
    expect(r[0].orderId).toBe("liq");
    expect(r[0].contracts).toBe("28");
    expect(r[0].fills).toBe(7);
    expect(r[0].firstAt).toBe("2026-09-01T20:05:31Z");
    expect(r[0].lastAt).toBe("2026-09-01T20:05:49Z");
    // (3+2)·77365 + (5+7+4)·77355 + 4·77345 + 3·77315, entre 28.
    expect(r[0].averagePrice).toBe("77351.07");
  });

  it("sin órdenes de liquidación no hay nada que contar", () => {
    expect(summariseLiquidations(fills, [order("normal", { order_type: "MARKET" })])).toEqual([]);
  });

  it("una orden de liquidación sin fills en la tanda tampoco cuenta", () => {
    expect(summariseLiquidations([], [order("liq", { order_type: "LIQUIDATION" })])).toEqual([]);
  });

  it("la frase dice cuánto, cómo y a qué precio", () => {
    const [s] = summariseLiquidations(fills, [order("liq", { order_type: "LIQUIDATION" })]);
    expect(describeLiquidation(s)).toBe(
      "Coinbase cerró por su cuenta 28 contratos de BIP-20DEC30-CDE: vendió a un precio medio de 77351.07 en 7 ejecuciones.",
    );
  });
});
