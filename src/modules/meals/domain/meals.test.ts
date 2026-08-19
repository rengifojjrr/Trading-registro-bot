import { describe, expect, it } from "vitest";

import { buildShoppingList, formatShoppingAmount, parseIngredientLine } from "./meals";

describe("buildShoppingList", () => {
  it("suma las cantidades del mismo ingrediente", () => {
    const list = buildShoppingList([
      { name: "Tomate", quantity: 200, unit: "g" },
      { name: "tomate", quantity: 300, unit: "g" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].amounts).toEqual([{ quantity: 500, unit: "g" }]);
  });

  it("no mezcla unidades distintas del mismo ingrediente", () => {
    // Sumar 200 gramos con 2 unidades daría 202 de nada.
    const list = buildShoppingList([
      { name: "Tomate", quantity: 200, unit: "g" },
      { name: "Tomate", quantity: 2, unit: "ud" },
    ]);
    expect(list[0].amounts).toEqual([
      { quantity: 200, unit: "g" },
      { quantity: 2, unit: "ud" },
    ]);
  });

  it("agrupa singular y plural", () => {
    const list = buildShoppingList([
      { name: "Tomates", quantity: 1, unit: "kg" },
      { name: "Tomate", quantity: 1, unit: "kg" },
    ]);
    expect(list).toHaveLength(1);
  });

  it("ignora acentos al agrupar", () => {
    const list = buildShoppingList([
      { name: "Limón", quantity: 1, unit: "ud" },
      { name: "limon", quantity: 2, unit: "ud" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].amounts[0].quantity).toBe(3);
  });

  it("cuenta aparte lo que no lleva cantidad en lugar de descartarlo", () => {
    // "Sal" sigue teniendo que aparecer en la lista de la compra.
    const list = buildShoppingList([
      { name: "Sal", quantity: null, unit: null },
      { name: "sal", quantity: null, unit: null },
    ]);
    expect(list[0].unmeasured).toBe(2);
    expect(list[0].amounts).toEqual([]);
  });

  it("descarta líneas vacías", () => {
    expect(buildShoppingList([{ name: "   ", quantity: 1, unit: "g" }])).toEqual([]);
  });

  it("ordena alfabéticamente en español", () => {
    const list = buildShoppingList([
      { name: "Zanahoria", quantity: 1, unit: "ud" },
      { name: "Ajo", quantity: 1, unit: "ud" },
    ]);
    expect(list.map((i) => i.name)).toEqual(["Ajo", "Zanahoria"]);
  });
});

describe("formatShoppingAmount", () => {
  it("junta varias unidades", () => {
    expect(
      formatShoppingAmount({
        name: "Tomate",
        amounts: [
          { quantity: 500, unit: "g" },
          { quantity: 2, unit: "ud" },
        ],
        unmeasured: 0,
      }),
    ).toBe("500 g · 2 ud");
  });

  it("cuenta las apariciones sin cantidad", () => {
    expect(formatShoppingAmount({ name: "Sal", amounts: [], unmeasured: 3 })).toBe("×3");
  });

  it("una sola aparición sin cantidad no necesita contador", () => {
    expect(formatShoppingAmount({ name: "Sal", amounts: [], unmeasured: 1 })).toBe("");
  });
});

describe("parseIngredientLine", () => {
  it("separa cantidad, unidad y nombre", () => {
    expect(parseIngredientLine("200 g tomate")).toEqual({ name: "tomate", quantity: 200, unit: "g" });
  });

  it("acepta la coma decimal", () => {
    expect(parseIngredientLine("1,5 l leche")).toEqual({ name: "leche", quantity: 1.5, unit: "l" });
  });

  it("sin unidad reconocible, esa palabra es parte del nombre", () => {
    // "2 huevos" no lleva unidad: "huevos" es el ingrediente.
    expect(parseIngredientLine("2 huevos")).toEqual({ name: "huevos", quantity: 2, unit: null });
  });

  it("sin cantidad, la línea entera es el nombre", () => {
    expect(parseIngredientLine("sal al gusto")).toEqual({
      name: "sal al gusto",
      quantity: null,
      unit: null,
    });
  });

  it("una línea vacía no produce ingrediente", () => {
    expect(parseIngredientLine("   ")).toBeNull();
  });
});
