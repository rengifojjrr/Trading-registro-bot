import { describe, expect, it } from "vitest";

import { esTema, normalizar, temaLabel, TEMA_DESCRIPCIONES, TEMA_LABELS, TEMAS, temasDe } from "./temas";

/**
 * Los titulares de las pruebas son **reales**, copiados de la respuesta de la
 * fuente el 2026-09-15. Inventarlos sería probar las reglas contra el mismo
 * español con el que se escribieron, que es como aprobarse el propio examen.
 */

describe("normalizar", () => {
  it("quita tildes y baja a minúsculas, para que una regla valga para las dos formas", () => {
    expect(normalizar("Regulación")).toBe("regulacion");
    expect(normalizar("LIQUIDACIÓN")).toBe("liquidacion");
    expect(normalizar("Minería")).toBe("mineria");
  });
});

describe("de qué va un titular", () => {
  it("el del Senado es regulación", () => {
    expect(temasDe("El Senado de EE. UU. no logra avanzar la Ley CLARITY")).toContain("REGULACION");
  });

  it("uno puede ser de dos cosas a la vez, y forzar una sola escondería la otra", () => {
    const temas = temasDe(
      "Acciones cripto caen antes de la votación del Clarity Act y la decisión de la Fed",
    );
    expect(temas).toContain("REGULACION");
    expect(temas).toContain("MACRO");
  });

  it("los datos de posiciones son mercado", () => {
    expect(temasDe("Datos clave: Posiciones largas de BTCUSD por $1.788 mil millones")).toContain(
      "MERCADO",
    );
  });

  it("el rendimiento a diez años es macro", () => {
    expect(temasDe("El rendimiento a 10 años supera el 5%: impacto en Bitcoin y las acciones")).toContain(
      "MACRO",
    );
  });

  it("los datos fiscales son regulación", () => {
    expect(
      temasDe("Argentina intercambiará datos fiscales de Bitcoin y criptomonedas desde 2027"),
    ).toContain("REGULACION");
  });

  it("un hackeo es seguridad", () => {
    expect(temasDe("Un exchange pierde 40 millones tras un hackeo")).toEqual(["SEGURIDAD"]);
  });

  it("sin regla que case se queda sin tema, en vez de recibir uno plausible", () => {
    expect(temasDe("Robert Kiyosaki publica un libro nuevo")).toEqual([]);
    expect(temasDe("")).toEqual([]);
  });

  it("no repite un tema aunque casen varias de sus palabras", () => {
    const temas = temasDe("La SEC y el Congreso debaten la nueva normativa");
    expect(temas.filter((t) => t === "REGULACION")).toHaveLength(1);
  });

  it("respeta el orden de las reglas, para que la lista salga siempre igual", () => {
    expect(temasDe("La Fed decide mientras el Senado vota la ley")).toEqual(["REGULACION", "MACRO"]);
  });
});

describe("el catálogo", () => {
  it("cada tema tiene etiqueta y explicación: un filtro sin nombre no se usa", () => {
    for (const tema of TEMAS) {
      expect(TEMA_LABELS[tema]).toBeTruthy();
      expect(TEMA_DESCRIPCIONES[tema]).toBeTruthy();
    }
  });

  it("reconoce los suyos y rechaza lo que no lo es", () => {
    expect(esTema("MACRO")).toBe(true);
    expect(esTema("INVENTADO")).toBe(false);
    expect(temaLabel("MACRO")).toBe("Macro");
    expect(temaLabel("INVENTADO")).toBeNull();
  });
});
