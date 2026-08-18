import { describe, expect, it } from "vitest";

import { resolvePlannedPrice } from "./options";

const base = { entryPrice: "100", direction: "LONG" as const, kind: "STOP" as const };

describe("resolvePlannedPrice", () => {
  it("devuelve el precio tal cual cuando la unidad es precio", () => {
    expect(resolvePlannedPrice({ ...base, raw: "98.5", unit: "PRICE" })).toBe("98.5");
  });

  it("un stop del 1% en un largo queda por debajo de la entrada", () => {
    expect(resolvePlannedPrice({ ...base, raw: "1", unit: "PERCENT" })).toBe("99");
  });

  it("un stop del 1% en un corto queda por encima", () => {
    expect(
      resolvePlannedPrice({ ...base, direction: "SHORT", raw: "1", unit: "PERCENT" }),
    ).toBe("101");
  });

  it("un objetivo del 2% en un largo queda por encima", () => {
    expect(
      resolvePlannedPrice({ ...base, kind: "TARGET", raw: "2", unit: "PERCENT" }),
    ).toBe("102");
  });

  it("un objetivo del 2% en un corto queda por debajo", () => {
    expect(
      resolvePlannedPrice({ ...base, kind: "TARGET", direction: "SHORT", raw: "2", unit: "PERCENT" }),
    ).toBe("98");
  });

  it("no inventa nada sin precio de entrada", () => {
    expect(resolvePlannedPrice({ ...base, entryPrice: null, raw: "1", unit: "PERCENT" })).toBeNull();
  });

  it("un campo vacío es vacío, no cero", () => {
    expect(resolvePlannedPrice({ ...base, raw: "", unit: "PRICE" })).toBeNull();
    expect(resolvePlannedPrice({ ...base, raw: "   ", unit: "PERCENT" })).toBeNull();
  });

  it("calcula sobre el precio real, no sobre un redondeo", () => {
    // 63594.523809523809524 es el WAP real de la operación del usuario.
    expect(
      resolvePlannedPrice({
        ...base,
        entryPrice: "63594.523809523809524",
        raw: "0.5",
        unit: "PERCENT",
      }),
    ).toBe("63276.55119048");
  });
});
