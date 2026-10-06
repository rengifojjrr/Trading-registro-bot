import { describe, expect, it } from "vitest";

import { MAX_TITULOS_DE_ANTES, aliasConNombreDeAntes, titulosDeAntes } from "./renames";

describe("lo que se recuerda al renombrar", () => {
  it("una tarea guarda su título de antes", () => {
    expect(titulosDeAntes("Comprar pintura", [], "Comprar pintura blanca")).toEqual(["Comprar pintura"]);
  });

  it("sin cambio de verdad no guarda nada", () => {
    expect(titulosDeAntes("Comprar pintura", [], "comprar  PINTURA")).toBeNull();
    expect(titulosDeAntes("", [], "Algo")).toBeNull();
  });

  it("no repite y deja el más reciente al final, con tope", () => {
    expect(titulosDeAntes("B", ["A", "B"], "C")).toEqual(["A", "B"]);
    expect(titulosDeAntes("B", ["C", "A"], "C")).toEqual(["A", "B"]);
    const muchos = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const r = titulosDeAntes("Último", muchos, "Nuevo")!;
    expect(r).toHaveLength(MAX_TITULOS_DE_ANTES);
    expect(r[r.length - 1]).toBe("Último");
  });

  it("una persona renombrada guarda su nombre de antes entre sus alias", () => {
    expect(aliasConNombreDeAntes("Lucía", ["Lu"], "Lucía Prado")).toEqual(["Lu", "Lucía"]);
    expect(aliasConNombreDeAntes("Lucía", ["lucia"], "Lucía Prado")).toEqual(["lucia"]);
    expect(aliasConNombreDeAntes("Lucía", ["Lucía Prado"], "Lucía Prado")).toEqual(["Lucía"]);
    expect(aliasConNombreDeAntes("Lucía", [], "lucia")).toBeNull();
  });
});
