import { describe, expect, it } from "vitest";

import { mapRawEvent } from "./tradingview";

/**
 * Un evento real, capturado del endpoint el 2026-09-09 (el dato de precios de
 * producción de agosto). Es la referencia de lo que la fuente devuelve de
 * verdad: la traducción se prueba contra esto y no contra un objeto inventado
 * que se parezca a lo que creo recordar de su esquema.
 */
const REAL = {
  id: "399194",
  title: "PPI MoM",
  country: "US",
  indicator: "Producer Price Inflation MoM",
  ticker: "ECONOMICS:USPPIMM",
  comment: "In the United States, the Producer Price Inflation MoM for final demand measures…",
  category: "prce",
  period: "Aug",
  referenceDate: "2026-08-31T00:00:00Z",
  source: "Bureau of Labour Statistics",
  source_url: "https://www.bls.gov",
  date: "2026-09-10T12:30:00.000Z",
  importance: 1,
  actual: null,
  forecast: 0.4,
  previous: 0,
  currency: "USD",
  unit: "%",
  scale: null,
};

describe("mapRawEvent", () => {
  it("traduce un evento real de la fuente", () => {
    const event = mapRawEvent(REAL)!;

    expect(event.sourceEventId).toBe("399194");
    expect(event.title).toBe("PPI MoM");
    expect(event.indicator).toBe("Producer Price Inflation MoM");
    expect(event.occursAt).toBe("2026-09-10T12:30:00.000Z");
    expect(event.importance).toBe(1);
    expect(event.forecast).toBe(0.4);
    expect(event.unit).toBe("%");
    expect(event.category).toBe("prce");
  });

  it("un dato previo de cero es cero, no «sin dato»", () => {
    // El PPI de julio fue 0%. Leerlo con `raw.previous || null` lo borraría,
    // y la pantalla diría que no hay dato previo cuando lo hay y es plano.
    expect(mapRawEvent(REAL)!.previous).toBe(0);
  });

  it("lo que aún no ha salido es null, nunca cero", () => {
    expect(mapRawEvent(REAL)!.actual).toBeNull();
  });

  it("descarta el evento al que le falta lo imprescindible", () => {
    // Sin fecha no se puede colocar en la agenda, y colocarlo en un momento
    // inventado es peor que no enseñarlo.
    expect(mapRawEvent({ ...REAL, date: undefined })).toBeNull();
    expect(mapRawEvent({ ...REAL, date: "no es una fecha" })).toBeNull();
    expect(mapRawEvent({ ...REAL, id: undefined })).toBeNull();
    expect(mapRawEvent({ ...REAL, title: "" })).toBeNull();
    expect(mapRawEvent({ ...REAL, country: undefined })).toBeNull();
  });

  it("una importancia que no reconoce se queda en media", () => {
    // Ni se esconde ni se grita: el endpoint no está documentado y puede
    // añadir niveles sin avisar.
    expect(mapRawEvent({ ...REAL, importance: 7 })!.importance).toBe(0);
    expect(mapRawEvent({ ...REAL, importance: "alta" })!.importance).toBe(0);
  });

  it("un número que no es número no se cuela como NaN", () => {
    const event = mapRawEvent({ ...REAL, forecast: "0.4", previous: NaN })!;
    expect(event.forecast).toBeNull();
    expect(event.previous).toBeNull();
  });

  it("normaliza la fecha a ISO en UTC", () => {
    const event = mapRawEvent({ ...REAL, date: "2026-09-10T08:30:00-04:00" })!;
    expect(event.occursAt).toBe("2026-09-10T12:30:00.000Z");
  });
});
