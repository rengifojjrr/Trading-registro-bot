import { describe, expect, it } from "vitest";

import { categoryLabel, isKeyForBitcoin } from "./relevance";

describe("categoryLabel", () => {
  it("traduce las categorías confirmadas de la fuente", () => {
    expect(categoryLabel("prce")).toBe("Precios e inflación");
    expect(categoryLabel("mny")).toBe("Dinero y banca central");
    expect(categoryLabel("lbr")).toBe("Empleo");
  });

  it("una categoría desconocida no se inventa", () => {
    // Prefiere no decir nada a enseñar un código crudo o una etiqueta falsa.
    expect(categoryLabel("xyz")).toBeNull();
    expect(categoryLabel(null)).toBeNull();
  });
});

describe("isKeyForBitcoin", () => {
  const evento = (over: Partial<Parameters<typeof isKeyForBitcoin>[0]> = {}) => ({
    title: "Algo",
    indicator: null,
    importance: -1,
    ...over,
  });

  it("lo que marca la fuente como alto impacto entra siempre", () => {
    expect(isKeyForBitcoin(evento({ title: "US President Trump Speech", importance: 1 }))).toBe(true);
  });

  it("entra la inflación, el empleo, la Reserva Federal y el crecimiento", () => {
    expect(isKeyForBitcoin(evento({ title: "Core Inflation Rate MoM" }))).toBe(true);
    expect(isKeyForBitcoin(evento({ title: "Initial Jobless Claims" }))).toBe(true);
    expect(isKeyForBitcoin(evento({ title: "FOMC Minutes" }))).toBe(true);
    expect(isKeyForBitcoin(evento({ title: "GDP Growth Rate QoQ Adv" }))).toBe(true);
    expect(isKeyForBitcoin(evento({ title: "ISM Services PMI" }))).toBe(true);
  });

  it("también por el nombre largo del indicador, no sólo por el corto", () => {
    // «PPI MoM» ya entra por la lista, pero el caso general es que el título
    // corto sea opaco y el indicador diga de qué va.
    expect(
      isKeyForBitcoin(evento({ title: "Algo Prel", indicator: "Producer Price Inflation MoM" })),
    ).toBe(true);
  });

  it("el ruido de baja importancia se queda fuera", () => {
    expect(isKeyForBitcoin(evento({ title: "EIA Cushing Crude Oil Stocks Change" }))).toBe(false);
    expect(isKeyForBitcoin(evento({ title: "4-Week Bill Auction" }))).toBe(false);
    expect(isKeyForBitcoin(evento({ title: "MBA Mortgage Applications" }))).toBe(false);
  });

  it("no distingue mayúsculas", () => {
    expect(isKeyForBitcoin(evento({ title: "NON FARM PAYROLLS" }))).toBe(true);
  });
});
