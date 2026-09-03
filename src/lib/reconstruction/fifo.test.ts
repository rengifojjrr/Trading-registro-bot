import { describe, expect, it } from "vitest";

import { reconstructTrades } from "./engine";
import type { ReconstructionFillInput } from "./types";

/**
 * Lo abierto y lo realizado por lotes FIFO, como lo cuenta Coinbase.
 *
 * El caso grande es real: la posición de BIP-20DEC30-CDE del 1 y 2 de
 * septiembre de 2026, con dos liquidaciones de 28 contratos y una recompra
 * entre medias. Coinbase reportó para los 22 que quedaron `avg_entry_price`
 * 77.284,77 y `daily_realized_pnl` 104,25; con el WAP de todas las entradas
 * (77.153,46) la aplicación enseñaba ganancia donde Coinbase enseñaba
 * pérdida. La diferencia que queda (77.285 y 104,30) es el orden de dos fills
 * de un mismo instante dentro de una orden, cinco dólares por un contrato.
 */

const PRODUCT = "BIP-20DEC30-CDE";

let seq = 0;
function fill(partial: {
  side: "BUY" | "SELL";
  price: number;
  size: number;
  commission?: number;
}): ReconstructionFillInput {
  const n = seq++;
  const ts = new Date(Date.UTC(2026, 8, 1, 18, 0, n)).toISOString();
  return {
    entryId: `f${String(n).padStart(3, "0")}`,
    productId: PRODUCT,
    side: partial.side,
    price: String(partial.price),
    size: String(partial.size),
    commission: String(partial.commission ?? 0),
    sequenceTimestamp: ts,
    tradeTime: ts,
    tradeType: "FILL",
    hasFutureLegs: false,
  };
}

describe("lotes FIFO -- lo abierto y lo realizado como Coinbase", () => {
  it("el caso que enseñaba verde aquí y rojo en Coinbase: recompra tras un cierre parcial", () => {
    // Compras 50, te cierran 28, recompras 28 más caro, te cierran 28.
    const fills = [
      fill({ side: "BUY", price: 100, size: 50 }),
      fill({ side: "SELL", price: 110, size: 28 }),
      fill({ side: "BUY", price: 120, size: 28 }),
      fill({ side: "SELL", price: 130, size: 28 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.status).toBe("OPEN");
    expect(t.totalEntryQty).toBe("78");
    expect(t.totalExitQty).toBe("56");

    // La media de todas las entradas: (50×100 + 28×120) / 78.
    expect(Number(t.entryWap)).toBeCloseTo(107.179, 3);
    // Pero lo que queda abierto son 22 de los 28 comprados a 120: FIFO cerró
    // primero los 50 a 100.
    expect(t.openLotsWap).toBe("120");
    // Realizado: 28 × (110 − 100) + 22 × (130 − 100) + 6 × (130 − 120).
    expect(t.fifoRealizedPoints).toBe("1000");
  });

  it("la posición real del 1 y 2 de septiembre de 2026, contrastada con /cfm/positions", () => {
    const fills = [
      fill({ side: "BUY", price: 77115, size: 1 }),
      fill({ side: "BUY", price: 77115, size: 39 }),
      fill({ side: "BUY", price: 76940, size: 10 }),
      // Liquidación del 1 de septiembre, 20:05 UTC.
      fill({ side: "SELL", price: 77365, size: 3 }),
      fill({ side: "SELL", price: 77365, size: 2 }),
      fill({ side: "SELL", price: 77355, size: 5 }),
      fill({ side: "SELL", price: 77355, size: 7 }),
      fill({ side: "SELL", price: 77355, size: 4 }),
      fill({ side: "SELL", price: 77345, size: 4 }),
      fill({ side: "SELL", price: 77315, size: 3 }),
      // Recompra a las 22:51 UTC.
      fill({ side: "BUY", price: 77280, size: 1 }),
      fill({ side: "BUY", price: 77280, size: 1 }),
      fill({ side: "BUY", price: 77285, size: 1 }),
      fill({ side: "BUY", price: 77285, size: 1 }),
      fill({ side: "BUY", price: 77285, size: 24 }),
      // Liquidación del 2 de septiembre, 20:04 UTC.
      fill({ side: "SELL", price: 77465, size: 6 }),
      fill({ side: "SELL", price: 77460, size: 7 }),
      fill({ side: "SELL", price: 77460, size: 1 }),
      fill({ side: "SELL", price: 77460, size: 3 }),
      fill({ side: "SELL", price: 77460, size: 6 }),
      fill({ side: "SELL", price: 77460, size: 5 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.status).toBe("OPEN");
    expect(t.totalEntryQty).toBe("78");
    expect(t.totalExitQty).toBe("56");
    expect(Number(t.entryWap)).toBeCloseTo(77153.46, 2);

    // Coinbase: 77.284,77 (un contrato a 77.280 entre los 22; aquí, por el
    // orden de los fills del mismo instante, los 22 salen a 77.285).
    expect(t.openLotsWap).toBe("77285");
    // 6.610 de la primera liquidación + 10.430 de la segunda; × 0,01 por
    // contrato son 170,40 dólares. Coinbase dio 104,25 para la segunda.
    expect(t.fifoRealizedPoints).toBe("17040");
  });

  it("cerrada del todo, FIFO y los WAP dan lo mismo, y no queda precio abierto", () => {
    const fills = [
      fill({ side: "BUY", price: 100, size: 2 }),
      fill({ side: "BUY", price: 120, size: 2 }),
      fill({ side: "SELL", price: 130, size: 4 }),
    ];
    const { trades } = reconstructTrades(fills);

    const t = trades[0];
    expect(t.status).toBe("CLOSED");
    expect(t.openLotsWap).toBeNull();
    // (130 − 110) × 4 con los WAP; (130 − 100) × 2 + (130 − 120) × 2 por lotes.
    expect(t.fifoRealizedPoints).toBe("80");
    expect(Number(t.exitWap) - Number(t.entryWap)).toBeCloseTo(20, 10);
  });

  it("en corto el signo se invierte: bajar es ganar", () => {
    const fills = [
      fill({ side: "SELL", price: 100, size: 3 }),
      fill({ side: "SELL", price: 90, size: 2 }),
      fill({ side: "BUY", price: 80, size: 4 }),
    ];
    const { trades } = reconstructTrades(fills);

    const t = trades[0];
    expect(t.direction).toBe("SHORT");
    expect(t.status).toBe("OPEN");
    // Cierra primero los 3 a 100 (+20 cada uno) y uno de los 2 a 90 (+10).
    expect(t.fifoRealizedPoints).toBe("70");
    expect(t.openLotsWap).toBe("90");
  });

  it("un reversal empieza la operación nueva con sus propios lotes", () => {
    const fills = [
      fill({ side: "BUY", price: 100, size: 2 }),
      fill({ side: "SELL", price: 110, size: 5 }),
    ];
    const { trades } = reconstructTrades(fills);

    expect(trades).toHaveLength(2);
    const [cerrada, abierta] = trades;
    expect(cerrada.status).toBe("CLOSED");
    expect(cerrada.fifoRealizedPoints).toBe("20");
    expect(cerrada.openLotsWap).toBeNull();

    expect(abierta.direction).toBe("SHORT");
    expect(abierta.status).toBe("OPEN");
    expect(abierta.fifoRealizedPoints).toBe("0");
    expect(abierta.openLotsWap).toBe("110");
  });

  it("sin salidas, lo abierto es la media de las entradas y no hay nada realizado", () => {
    const fills = [fill({ side: "BUY", price: 100, size: 1 }), fill({ side: "BUY", price: 104, size: 3 })];
    const { trades } = reconstructTrades(fills);

    expect(trades[0].openLotsWap).toBe("103");
    expect(trades[0].entryWap).toBe("103");
    expect(trades[0].fifoRealizedPoints).toBe("0");
  });
});
