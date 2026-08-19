import { describe, expect, it } from "vitest";

import {
  describeGap,
  findFillGaps,
  storedHighWaterMark,
  type OrderExpectation,
  type StoredFillTally,
} from "./gaps";

const orden = (over: Partial<OrderExpectation> = {}): OrderExpectation => ({
  orderId: "ed1c6d12-a07b-4538-8099-4b31dfbfed1b",
  filledSize: "1",
  numberOfFills: 1,
  ...over,
});

const guardado = (over: Partial<StoredFillTally> = {}): StoredFillTally => ({
  orderId: "ed1c6d12-a07b-4538-8099-4b31dfbfed1b",
  storedSize: "1",
  storedCount: 1,
  ...over,
});

describe("huecos de fills", () => {
  it("una orden cuadrada no es un hueco", () => {
    expect(findFillGaps([orden()], [guardado()])).toEqual([]);
  });

  it("encuentra la orden ejecutada de la que no guardamos nada", () => {
    // El caso real: compra de 1 contrato del 11 de agosto de 2026, ejecutada
    // según Coinbase, cero fills guardados. Ese contrato de más es lo que
    // impidió que la posición volviera a cero y fundió una semana de
    // operaciones en una sola operación fantasma de 151 contratos.
    const gaps = findFillGaps([orden()], []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingSize).toBe("1");
    expect(gaps[0].missingCount).toBe(1);
    expect(gaps[0].storedSize).toBe("0");
  });

  it("encuentra la orden a la que le falta un trozo", () => {
    // Una orden grande que se ejecutó en cinco trozos y de la que sólo
    // guardamos cuatro: el tamaño canta antes que la cuenta.
    const gaps = findFillGaps(
      [orden({ filledSize: "60", numberOfFills: 5 })],
      [guardado({ storedSize: "47", storedCount: 4 })],
    );
    expect(gaps[0].missingSize).toBe("13");
    expect(gaps[0].missingCount).toBe(1);
  });

  it("el tamaño delata el hueco aunque la cuenta cuadre", () => {
    // Coinbase puede agrupar; fiarse sólo de `number_of_fills` dejaría pasar
    // esto.
    const gaps = findFillGaps(
      [orden({ filledSize: "60", numberOfFills: 4 })],
      [guardado({ storedSize: "47", storedCount: 4 })],
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingSize).toBe("13");
    expect(gaps[0].missingCount).toBeNull();
  });

  it("guardar de más no es un hueco", () => {
    // No puede pasar -- raw_fills está indexado por el entry_id de Coinbase --
    // pero si Coinbase corrigiera una orden a la baja, tratarlo como hueco
    // haría que la aplicación pidiera para siempre unos fills que ya no
    // existen.
    expect(
      findFillGaps([orden({ filledSize: "40" })], [guardado({ storedSize: "43", storedCount: 4 })]),
    ).toEqual([]);
  });

  it("una orden que no dice cuánto se ejecutó no se inventa un hueco", () => {
    // No saber no es lo mismo que faltar.
    expect(findFillGaps([orden({ filledSize: null, numberOfFills: null })], [])).toEqual([]);
    expect(findFillGaps([orden({ filledSize: "", numberOfFills: null })], [])).toEqual([]);
  });

  it("aguanta un filled_size que no es un número", () => {
    expect(findFillGaps([orden({ filledSize: "no-sé", numberOfFills: null })], [])).toEqual([]);
  });

  it("no confunde una orden con otra", () => {
    const gaps = findFillGaps(
      [orden({ orderId: "a" }), orden({ orderId: "b", filledSize: "20", numberOfFills: 1 })],
      [guardado({ orderId: "b", storedSize: "20", storedCount: 1 })],
    );
    expect(gaps.map((g) => g.orderId)).toEqual(["a"]);
  });

  it("compara con decimales de verdad", () => {
    // 0.3 - 0.1 - 0.2 en coma flotante no da cero, y un hueco de
    // 0.00000000000000003 contratos haría que la aplicación reintentara sin
    // parar una orden que está completa.
    expect(
      findFillGaps(
        [orden({ filledSize: "0.3", numberOfFills: 2 })],
        [guardado({ storedSize: "0.30000000000000004", storedCount: 2 })],
      ),
    ).toEqual([]);
  });
});

describe("cómo se cuenta", () => {
  it("dice qué falta y contra qué se compara", () => {
    const [gap] = findFillGaps([orden()], []);
    expect(describeGap(gap)).toBe(
      "Orden ed1c6d12: falta 1 ejecución · 1 contrato por registrar (Coinbase dice 1, tenemos 0).",
    );
  });

  it("pluraliza", () => {
    const [gap] = findFillGaps(
      [orden({ filledSize: "60", numberOfFills: 5 })],
      [guardado({ storedSize: "47", storedCount: 3 })],
    );
    expect(describeGap(gap)).toContain("2 ejecuciones · 13 contratos");
  });
});

describe("hasta dónde avanza la marca de agua", () => {
  const fill = (id: string, ts: string) => ({ entry_id: id, sequence_timestamp: ts });

  it("con todo guardado, hasta el último", () => {
    const fills = [fill("a", "2026-08-11T01:00:00Z"), fill("b", "2026-08-12T03:00:00Z")];
    expect(storedHighWaterMark(fills, new Set(["a", "b"]))).toBe("2026-08-12T03:00:00Z");
  });

  it("se para en el primero que no se guardó", () => {
    // Lo que convierte un fallo puntual en un agujero permanente: si la marca
    // pasa por encima de un fill que no llegó a guardarse, la ventana normal
    // sólo pide lo posterior a la marca y nadie vuelve a mirar ahí jamás.
    const fills = [
      fill("a", "2026-08-11T01:00:00Z"),
      fill("perdido", "2026-08-11T02:00:00Z"),
      fill("c", "2026-08-12T03:00:00Z"),
    ];
    expect(storedHighWaterMark(fills, new Set(["a", "c"]))).toBe("2026-08-11T01:00:00Z");
  });

  it("si el primero ya falla, la marca no se mueve", () => {
    const fills = [fill("perdido", "2026-08-11T01:00:00Z"), fill("b", "2026-08-12T03:00:00Z")];
    expect(storedHighWaterMark(fills, new Set(["b"]))).toBe("1970-01-01T00:00:00Z");
  });

  it("ordena antes de decidir, porque Coinbase no promete orden", () => {
    const fills = [
      fill("c", "2026-08-12T03:00:00Z"),
      fill("a", "2026-08-11T01:00:00Z"),
      fill("perdido", "2026-08-11T02:00:00Z"),
    ];
    expect(storedHighWaterMark(fills, new Set(["a", "c"]))).toBe("2026-08-11T01:00:00Z");
  });

  it("sin fills, la marca no se mueve", () => {
    expect(storedHighWaterMark([], new Set())).toBe("1970-01-01T00:00:00Z");
  });
});
