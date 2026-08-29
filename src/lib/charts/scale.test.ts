import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW,
  isScaleMode,
  parseView,
  SCALE_HINTS,
  SCALE_LABELS,
  SCALE_MODES,
  viewStorageKey,
} from "./scale";

describe("los modos de escala", () => {
  it("los tres tienen nombre y explicación", () => {
    for (const modo of SCALE_MODES) {
      expect(SCALE_LABELS[modo], modo).toBeTruthy();
      expect(SCALE_HINTS[modo], modo).toBeTruthy();
    }
  });

  it("reconoce los válidos y rechaza lo demás", () => {
    expect(isScaleMode("LOG")).toBe(true);
    expect(isScaleMode("logaritmica")).toBe(false);
    expect(isScaleMode(null)).toBe(false);
    expect(isScaleMode(3)).toBe(false);
  });
});

describe("leer una vista guardada", () => {
  it("sin nada guardado usa la de fábrica con la temporalidad que se le pase", () => {
    // La de fábrica no puede imponer su temporalidad: la que trae el servidor
    // es la que cabe en esa operación.
    expect(parseView(null, "FIVE_MINUTE")).toEqual({
      ...DEFAULT_VIEW,
      granularity: "FIVE_MINUTE",
    });
  });

  it("aguanta cualquier cosa en el almacenamiento", () => {
    // Es un valor que el usuario puede editar a mano desde el navegador.
    for (const basura of ["", 3, true, [], "{}", { scaleMode: 9 }]) {
      expect(() => parseView(basura, "ONE_HOUR")).not.toThrow();
    }
  });

  it("un campo malo no invalida la vista entera", () => {
    const vista = parseView(
      { scaleMode: "inventada", showVolume: "sí", autoScale: false },
      "ONE_HOUR",
    );
    // Los dos malos caen al de siempre y el bueno se conserva.
    expect(vista.scaleMode).toBe("NORMAL");
    expect(vista.showVolume).toBe(false);
    expect(vista.autoScale).toBe(false);
  });

  it("conserva lo que sí encaja", () => {
    const vista = parseView(
      {
        granularity: "ONE_DAY",
        scaleMode: "PERCENT",
        autoScale: false,
        showVolume: true,
        showDrawings: false,
        showPlan: false,
        magnet: false,
        indicators: ["EMA9", "RSI14"],
      },
      "ONE_HOUR",
    );
    expect(vista.granularity).toBe("ONE_DAY");
    expect(vista.scaleMode).toBe("PERCENT");
    expect(vista.indicators).toEqual(["EMA9", "RSI14"]);
    expect(vista.showPlan).toBe(false);
  });

  it("filtra lo que no sea texto de la lista de indicadores", () => {
    expect(parseView({ indicators: ["EMA9", 3, null, "RSI14"] }, "ONE_HOUR").indicators).toEqual([
      "EMA9",
      "RSI14",
    ]);
  });

  it("recorta una lista de indicadores absurda", () => {
    const muchos = Array.from({ length: 100 }, (_, i) => `X${i}`);
    expect(parseView({ indicators: muchos }, "ONE_HOUR").indicators).toHaveLength(12);
  });
});

describe("la clave de almacenamiento", () => {
  it("es distinta por operación", () => {
    // Compartirla haría que abrir una operación cambiara la vista de la otra.
    expect(viewStorageKey("a")).not.toBe(viewStorageKey("b"));
    expect(viewStorageKey("a")).toContain("a");
  });
});
