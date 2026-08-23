import { describe, expect, it } from "vitest";

import { summariseOpenTrade } from "./open-trade-total";

describe("cómo va una operación todavía abierta", () => {
  it("separa lo que ya está cobrado de lo que depende del precio", () => {
    // El caso real del 19 de agosto: 211 contratos entrados, 60 cerrados con
    // +862,99 ya en la cuenta, y el resto a mercado. La ficha enseñaba los
    // -2.720 y escondía los +862.
    const totales = summariseOpenTrade({
      realizedNetPnl: "862.99",
      unrealizedGrossPnl: "-2720.61",
      totalEntryQty: "211",
      totalExitQty: "60",
    });

    expect(totales.realized).toBe("862.99");
    expect(totales.unrealized).toBe("-2720.61");
    expect(totales.total).toBe("-1857.62");
    expect(totales.openQty).toBe("151");
    expect(totales.closedQty).toBe("60");
  });

  it("sin nada cerrado no inventa un realizado de cero", () => {
    // «0,00» se lee como «cerré algo y me quedé igual», que no es lo mismo
    // que «no he cerrado nada».
    const totales = summariseOpenTrade({
      realizedNetPnl: "0",
      unrealizedGrossPnl: "-1117.50",
      totalEntryQty: "150",
      totalExitQty: "0",
    });

    expect(totales.realized).toBeNull();
    expect(totales.total).toBe("-1117.5");
    expect(totales.openQty).toBe("150");
  });

  it("el total suma las dos cuando hay las dos", () => {
    const totales = summariseOpenTrade({
      realizedNetPnl: "-605.81",
      unrealizedGrossPnl: "200",
      totalEntryQty: "100",
      totalExitQty: "40",
    });
    expect(totales.total).toBe("-405.81");
  });

  it("suma con decimales de verdad", () => {
    // 0.1 + 0.2 en coma flotante no da 0.3, y aquí eso serían céntimos que no
    // cuadran con el extracto.
    const totales = summariseOpenTrade({
      realizedNetPnl: "0.1",
      unrealizedGrossPnl: "0.2",
      totalEntryQty: "10",
      totalExitQty: "5",
    });
    expect(totales.total).toBe("0.3");
  });

  it("aguanta una operación sin realizado apuntado", () => {
    const totales = summariseOpenTrade({
      realizedNetPnl: null,
      unrealizedGrossPnl: "50",
      totalEntryQty: "10",
      totalExitQty: "3",
    });
    expect(totales.realized).toBeNull();
    expect(totales.total).toBe("50");
  });

  it("calcula lo que sigue abierto restando, no fiándose de otro campo", () => {
    const totales = summariseOpenTrade({
      realizedNetPnl: "10",
      unrealizedGrossPnl: "0",
      totalEntryQty: "170",
      totalExitQty: "113",
    });
    expect(totales.openQty).toBe("57");
  });
});
