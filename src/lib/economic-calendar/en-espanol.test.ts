import { describe, expect, it } from "vitest";

import { hayTraduccion, tituloEnEspanol } from "./en-espanol";
import { TITULOS } from "./titulos-de-la-fuente";

/**
 * Lo que tiene que cumplir la traducción de los datos económicos.
 *
 * La prueba que importa es la última: los doscientos noventa y seis títulos
 * que la fuente ha mandado de verdad, no una docena elegida por quien escribió
 * las reglas. Un cien por cien medido sobre los ejemplos propios no significa
 * nada.
 */

describe("el nombre y los matices se separan", () => {
  it("un dato sin matices sale tal cual", () => {
    expect(tituloEnEspanol("Initial Jobless Claims")).toBe("Peticiones iniciales de desempleo");
  });

  it("los matices van entre paréntesis, detrás", () => {
    expect(tituloEnEspanol("Inflation Rate YoY")).toBe("Inflación (interanual)");
  });

  /**
   * El periodo antes que la versión. «Trimestral, segunda estimación» es cómo
   * se dice; «segunda estimación, trimestral» es cómo sale si el orden lo
   * decide el orden en que se buscaron.
   */
  it("varios matices se leen en el orden en que se dicen", () => {
    expect(tituloEnEspanol("Core PCE Prices QoQ 2nd Est")).toBe(
      "Precios PCE subyacentes (trimestral, segunda estimación)",
    );
    expect(tituloEnEspanol("Building Permits MoM Final")).toBe(
      "Permisos de construcción (mensual, final)",
    );
  });

  it("el matiz largo gana al corto que lleva dentro", () => {
    // «2nd est» tiene que reconocerse entero: si ganara «qoq» primero, el
    // «2nd est» se quedaría pegado al nombre y no lo encontraría nadie.
    expect(tituloEnEspanol("GDP Growth Rate QoQ 2nd Est")).toContain("segunda estimación");
    expect(tituloEnEspanol("GDP Growth Rate QoQ 2nd Est")).not.toMatch(/2nd|est\b/i);
  });
});

describe("las familias que crecen solas", () => {
  it("un gobernador nuevo de la Fed no necesita una regla propia", () => {
    expect(tituloEnEspanol("Fed Musalem Speech")).toBe("Discurso de Musalem (Fed)");
    expect(tituloEnEspanol("Fed Hammack Speech")).toBe("Discurso de Hammack (Fed)");
  });

  /** Un «comparecencia de powell» delata la máquina que hay detrás. */
  it("los apellidos conservan su mayúscula", () => {
    expect(tituloEnEspanol("Fed Chair Powell Speech")).toBe(
      "Comparecencia de Powell, presidente de la Fed",
    );
    expect(tituloEnEspanol("Treasury Secretary Bessent Speech")).toBe(
      "Discurso de Bessent, secretario del Tesoro",
    );
  });

  it("las subastas salen con su plazo", () => {
    expect(tituloEnEspanol("4-Week Bill Auction")).toBe("Subasta de letras a 4 semanas");
    expect(tituloEnEspanol("52-Week Bill Auction")).toBe("Subasta de letras a 52 semanas");
    expect(tituloEnEspanol("10-Year TIPS Auction")).toBe(
      "Subasta de bonos indexados a la inflación a 10 años",
    );
  });

  it("los inventarios de la EIA traducen también el producto", () => {
    expect(tituloEnEspanol("EIA Cushing Crude Oil Stocks Change")).toBe(
      "EIA: cambio en reservas de crudo en Cushing",
    );
    expect(tituloEnEspanol("EIA Natural Gas Stocks Change")).toBe(
      "EIA: cambio en reservas de gas natural",
    );
  });
});

describe("lo que no se sabe decir", () => {
  /**
   * La decisión importante del módulo: en inglés y cierto antes que en español
   * e inventado. Un dato macro mal nombrado en una pantalla desde la que se
   * opera es peor que uno sin traducir.
   */
  it("se queda en inglés, sin inventar", () => {
    expect(tituloEnEspanol("Zimbabwe Widget Index QoQ")).toBe("Zimbabwe Widget Index QoQ");
    expect(hayTraduccion("Zimbabwe Widget Index QoQ")).toBe(false);
  });

  it("no se rompe con lo vacío", () => {
    expect(tituloEnEspanol("")).toBe("");
    expect(tituloEnEspanol("   ")).toBe("");
  });
});

describe("contra lo que manda la fuente de verdad", () => {
  const sinTraducir = TITULOS.filter((t) => !hayTraduccion(t));

  it("están todos cubiertos", () => {
    // El mensaje enumera los que faltan: un «esperaba 0, recibí 12» no dice
    // cuáles, y entonces la prueba se salta en vez de arreglarse.
    expect(sinTraducir, `Sin traducir:\n${sinTraducir.join("\n")}`).toEqual([]);
  });

  it("ninguna traducción se queda a medias con inglés dentro", () => {
    // Un «Índice manufacturero Final» es peor que dejarlo entero en inglés:
    // parece revisado y no lo está.
    const restos = /\b(mom|yoy|qoq|prel|adv|flash|change|index|rate|auction|speech)\b/i;
    const sospechosas = TITULOS.map((t) => [t, tituloEnEspanol(t)] as const).filter(
      ([, es]) => restos.test(es),
    );

    expect(
      sospechosas.map(([en, es]) => `${en} → ${es}`),
      "Estas conservan una palabra inglesa:",
    ).toEqual([]);
  });
});
