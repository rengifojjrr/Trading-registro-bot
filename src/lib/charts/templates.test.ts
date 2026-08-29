import { describe, expect, it } from "vitest";

import { defaultStyle } from "./style";
import {
  hasTemplate,
  parseTemplates,
  styleForTool,
  withoutTemplate,
  withTemplate,
} from "./templates";

describe("leer plantillas guardadas", () => {
  it("aguanta cualquier cosa", () => {
    for (const basura of [null, 3, "{}", [], true]) {
      expect(parseTemplates(basura)).toEqual({});
    }
  });

  it("descarta herramientas que ya no existen", () => {
    // El catálogo cambia; una plantilla huérfana no puede impedir leer las
    // demás.
    const leidas = parseTemplates({ TRENDLINE: { color: "#ff0000" }, INVENTADA: { color: "#0f0" } });
    expect(Object.keys(leidas)).toEqual(["TRENDLINE"]);
  });

  it("descarta una plantilla que no es un objeto", () => {
    expect(parseTemplates({ TRENDLINE: "roja" })).toEqual({});
  });
});

describe("guardar y quitar", () => {
  it("guarda sólo lo que se aparta de fábrica", () => {
    // Así, si mañana cambia el color por defecto, el cambio alcanza a la
    // plantilla en todo lo que no se tocó.
    const estilo = { ...defaultStyle("TRENDLINE"), lineWidth: 4 };
    const guardadas = withTemplate({}, "TRENDLINE", estilo);
    expect(guardadas.TRENDLINE).toEqual({ lineWidth: 4 });
  });

  it("un estilo igual al de fábrica no crea plantilla", () => {
    // `{}` dejaría una entrada que no hace nada y confunde al mirarlas.
    const guardadas = withTemplate({}, "TRENDLINE", defaultStyle("TRENDLINE"));
    expect(hasTemplate(guardadas, "TRENDLINE")).toBe(false);
  });

  it("volver a los valores de fábrica borra la plantilla", () => {
    const con = withTemplate({}, "FIB", { ...defaultStyle("FIB"), lineWidth: 3 });
    expect(hasTemplate(con, "FIB")).toBe(true);
    expect(hasTemplate(withTemplate(con, "FIB", defaultStyle("FIB")), "FIB")).toBe(false);
  });

  it("quitar una no toca las demás", () => {
    let t = withTemplate({}, "FIB", { ...defaultStyle("FIB"), lineWidth: 3 });
    t = withTemplate(t, "RECTANGLE", { ...defaultStyle("RECTANGLE"), fillOpacity: 40 });
    const quitada = withoutTemplate(t, "FIB");
    expect(hasTemplate(quitada, "FIB")).toBe(false);
    expect(hasTemplate(quitada, "RECTANGLE")).toBe(true);
  });

  it("no muta lo que recibe", () => {
    // Estas funciones se llaman desde el estado de React, donde mutar el valor
    // anterior hace que el render no se entere del cambio.
    const antes = withTemplate({}, "FIB", { ...defaultStyle("FIB"), lineWidth: 3 });
    const copia = JSON.parse(JSON.stringify(antes));
    withoutTemplate(antes, "FIB");
    withTemplate(antes, "RECTANGLE", defaultStyle("RECTANGLE"));
    expect(antes).toEqual(copia);
  });
});

describe("el estilo de partida", () => {
  it("sin plantilla es el de fábrica", () => {
    expect(styleForTool("TRENDLINE", {})).toEqual(defaultStyle("TRENDLINE"));
  });

  it("con plantilla aplica sólo lo guardado sobre el de fábrica", () => {
    const t = withTemplate({}, "TRENDLINE", { ...defaultStyle("TRENDLINE"), lineWidth: 4 });
    const estilo = styleForTool("TRENDLINE", t);
    expect(estilo.lineWidth).toBe(4);
    expect(estilo.color).toBe(defaultStyle("TRENDLINE").color);
  });

  it("una plantilla con un campo corrupto sólo pierde ese campo", () => {
    const estilo = styleForTool("TRENDLINE", { TRENDLINE: { lineWidth: 900, color: "#22c55e" } });
    expect(estilo.lineWidth).toBe(defaultStyle("TRENDLINE").lineWidth);
    expect(estilo.color).toBe("#22c55e");
  });

  it("da la vuelta completa sin perder nada", () => {
    const original = { ...defaultStyle("FIB"), lineWidth: 3, color: "#a855f7", showLabels: false };
    expect(styleForTool("FIB", withTemplate({}, "FIB", original))).toEqual(original);
  });
});
