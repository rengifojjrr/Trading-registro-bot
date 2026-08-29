import { describe, expect, it } from "vitest";

import {
  dashPattern,
  defaultStyle,
  fillColor,
  hasParam,
  parseStyle,
  serialiseStyle,
} from "./style";
import { TOOLS, TOOL_BY_ID, TOOL_IDS, isToolId, toolsByGroup } from "./tools";

describe("el catálogo de herramientas", () => {
  it("no repite identificadores", () => {
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length);
  });

  it("todas declaran cuántos clics necesitan", () => {
    // Es el dato del que sale la vista previa, cuándo se guarda y si se puede
    // arrastrar por un extremo. Un cero dejaría una herramienta imposible de
    // colocar.
    for (const t of TOOLS) {
      expect(t.points, `${t.id} sin puntos`).toBeGreaterThanOrEqual(1);
      expect(t.points, `${t.id} con demasiados puntos`).toBeLessThanOrEqual(5);
    }
  });

  it("todas tienen etiqueta, pista y al menos el color", () => {
    for (const t of TOOLS) {
      expect(t.label, `${t.id} sin etiqueta`).toBeTruthy();
      expect(t.hint, `${t.id} sin pista`).toBeTruthy();
      expect(t.params, `${t.id} sin color`).toContain("color");
    }
  });

  it("ninguna repite un parámetro", () => {
    // Repetido saldría dos veces en el panel de ajustes.
    for (const t of TOOLS) {
      expect(new Set(t.params).size, `${t.id} repite un parámetro`).toBe(t.params.length);
    }
  });

  it("ninguna herramienta se queda fuera de su grupo", () => {
    const agrupadas = toolsByGroup().flatMap((g) => g.tools);
    expect(agrupadas).toHaveLength(TOOLS.length);
  });

  it("reconoce los identificadores válidos y rechaza los demás", () => {
    expect(isToolId("TRENDLINE")).toBe(true);
    expect(isToolId("INVENTADA")).toBe(false);
  });
});

describe("los valores de fábrica", () => {
  it("una línea no ofrece relleno, y una figura sí", () => {
    // Un control de opacidad que no hace nada es peor que no tenerlo: se toca,
    // no pasa nada, y se deja de confiar en el resto del panel.
    expect(defaultStyle("TRENDLINE").fill).toBe(false);
    expect(defaultStyle("RECTANGLE").fill).toBe(true);
  });

  it("un rayo se prolonga y una línea de tendencia no", () => {
    // Es justo lo que los distingue.
    expect(defaultStyle("RAY").extendRight).toBe(true);
    expect(defaultStyle("TRENDLINE").extendRight).toBe(false);
    expect(defaultStyle("EXTENDED").extendLeft).toBe(true);
  });

  it("la posición larga es verde y la corta roja", () => {
    // Que el color diga la dirección ahorra leer la etiqueta.
    expect(defaultStyle("LONG_POSITION").color).not.toBe(defaultStyle("SHORT_POSITION").color);
  });

  it("cada familia trae sus niveles", () => {
    expect(defaultStyle("FIB").levels).toContain(0.618);
    expect(defaultStyle("FIB_EXTENSION").levels).toContain(1.618);
    expect(defaultStyle("GANN_BOX").levels).toContain(0.25);
  });
});

describe("leer lo guardado sin fiarse", () => {
  it("aguanta cualquier cosa en la columna", () => {
    // Es `jsonb`: nada impide que llegue un número o una lista.
    expect(parseStyle("TRENDLINE", null)).toEqual(defaultStyle("TRENDLINE"));
    expect(parseStyle("TRENDLINE", [1, 2])).toEqual(defaultStyle("TRENDLINE"));
    expect(parseStyle("TRENDLINE", "texto")).toEqual(defaultStyle("TRENDLINE"));
  });

  it("un campo malo no invalida el dibujo entero", () => {
    // Perder un dibujo por un campo mal escrito sería peor que perder el campo.
    const s = parseStyle("TRENDLINE", { color: "no es color", lineWidth: 4 });
    expect(s.color).toBe(defaultStyle("TRENDLINE").color);
    expect(s.lineWidth).toBe(4);
  });

  it("rechaza un ancho de línea absurdo", () => {
    expect(parseStyle("TRENDLINE", { lineWidth: 900 }).lineWidth).toBe(2);
    expect(parseStyle("TRENDLINE", { lineWidth: 0 }).lineWidth).toBe(2);
    expect(parseStyle("TRENDLINE", { lineWidth: 2.5 }).lineWidth).toBe(2);
  });

  it("ordena los niveles y quita los repetidos", () => {
    expect(parseStyle("FIB", { levels: [1, 0.5, 0.5, 0] }).levels).toEqual([0, 0.5, 1]);
  });

  it("descarta niveles fuera de rango pero conserva los buenos", () => {
    expect(parseStyle("FIB", { levels: [0.618, 999, -50] }).levels).toEqual([0.618]);
  });

  it("una lista de niveles vacía cae a la de siempre", () => {
    // Un Fibonacci sin ningún nivel no dibuja nada y parece roto.
    expect(parseStyle("FIB", { levels: [] }).levels).toEqual(defaultStyle("FIB").levels);
  });

  it("acepta un grado de onda conocido y rechaza uno inventado", () => {
    expect(parseStyle("ELLIOTT", { waveDegree: "PRIMARY" }).waveDegree).toBe("PRIMARY");
    expect(parseStyle("ELLIOTT", { waveDegree: "GIGANTE" }).waveDegree).toBe("MINOR");
  });

  it("corta un texto demasiado largo en vez de rechazarlo", () => {
    expect(parseStyle("TRENDLINE", { textLabel: "x".repeat(500) }).textLabel).toHaveLength(80);
  });
});

describe("guardar sólo lo que se cambió", () => {
  it("un estilo sin tocar no ocupa nada", () => {
    // Así un cambio en los valores de fábrica llega a los dibujos que nunca
    // los tocaron, en vez de dejarlos congelados.
    expect(serialiseStyle("TRENDLINE", defaultStyle("TRENDLINE"))).toEqual({});
  });

  it("guarda lo que se apartó, y sólo eso", () => {
    const s = { ...defaultStyle("TRENDLINE"), lineWidth: 5 };
    expect(serialiseStyle("TRENDLINE", s)).toEqual({ lineWidth: 5 });
  });

  it("da la vuelta completa sin perder nada", () => {
    const s = { ...defaultStyle("FIB"), color: "#ff0000", levels: [0, 0.618, 1], textLabel: "soporte" };
    expect(parseStyle("FIB", serialiseStyle("FIB", s))).toEqual(s);
  });

  it("detecta que los niveles cambiaron aunque tengan la misma longitud", () => {
    const s = { ...defaultStyle("GANN_BOX"), levels: [0, 0.3, 0.5, 0.7, 1] };
    expect(serialiseStyle("GANN_BOX", s).levels).toEqual([0, 0.3, 0.5, 0.7, 1]);
  });
});

describe("lo que el panel enseña", () => {
  it("sólo los controles que la herramienta usa", () => {
    expect(hasParam("FIB", "levels")).toBe(true);
    expect(hasParam("TRENDLINE", "levels")).toBe(false);
    expect(hasParam("LONG_POSITION", "riskReward")).toBe(true);
    expect(hasParam("VLINE", "riskReward")).toBe(false);
  });

  it("cada parámetro declarado existe en el estilo", () => {
    // Un parámetro declarado que no existe en el estilo sería un control que
    // no controla nada.
    const claves = new Set(Object.keys(defaultStyle("TRENDLINE")));
    for (const t of TOOLS) {
      for (const p of t.params) {
        expect(claves.has(p), `${t.id} declara ${p}, que no está en el estilo`).toBe(true);
      }
    }
  });
});

describe("traducir el estilo a canvas", () => {
  it("el relleno lleva la opacidad aplicada", () => {
    expect(fillColor({ ...defaultStyle("RECTANGLE"), color: "#38bdf8", fillOpacity: 50 })).toBe(
      "rgba(56, 189, 248, 0.5)",
    );
  });

  it("un color raro se devuelve tal cual en vez de romper el dibujo", () => {
    const s = { ...defaultStyle("RECTANGLE"), color: "var(--algo)" };
    expect(fillColor(s)).toBe("var(--algo)");
  });

  it("cada estilo de línea tiene su patrón", () => {
    expect(dashPattern({ ...defaultStyle("TRENDLINE"), lineStyle: "SOLID" })).toEqual([]);
    expect(dashPattern({ ...defaultStyle("TRENDLINE"), lineStyle: "DASHED" }).length).toBe(2);
    expect(dashPattern({ ...defaultStyle("TRENDLINE"), lineStyle: "DOTTED" }).length).toBe(2);
  });
});

describe("coherencia entre catálogo y estilos", () => {
  it("toda herramienta con relleno declara también la opacidad", () => {
    // Enseñar «relleno: sí» sin poder graduarlo deja el control a medias.
    for (const t of TOOLS) {
      if (t.params.includes("fill")) {
        expect(t.params, `${t.id}`).toContain("fillOpacity");
      }
    }
  });

  it("toda herramienta de posición pide tres puntos", () => {
    // Entrada, stop y objetivo: con dos no hay relación beneficio/riesgo.
    expect(TOOL_BY_ID.LONG_POSITION.points).toBe(3);
    expect(TOOL_BY_ID.SHORT_POSITION.points).toBe(3);
  });
});
