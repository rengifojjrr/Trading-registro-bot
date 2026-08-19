import { describe, expect, it } from "vitest";

import { mapNotionMeal, splitIngredients } from "./notion-mapping";

function page(properties: Record<string, unknown>, id = "meal-1") {
  return {
    id,
    properties: {
      "Nombre de la comida": { type: "title", title: [{ plain_text: "Arroz con pollo" }] },
      Fecha: { type: "date", date: { start: "2025-11-11T06:00:00.000Z" } },
      ...properties,
    },
  };
}

const text = (value: string) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });

describe("splitIngredients", () => {
  it("parte por líneas y entiende cantidad y unidad", () => {
    const ingredients = splitIngredients("200 g arroz\n2 ud huevo\nsal");

    expect(ingredients).toEqual([
      { name: "arroz", quantity: 200, unit: "g" },
      { name: "huevo", quantity: 2, unit: "ud" },
      { name: "sal", quantity: null, unit: null },
    ]);
  });

  it("parte por comas cuando el párrafo va de corrido", () => {
    const ingredients = splitIngredients("200 g arroz, pollo, sal");
    expect(ingredients.map((i) => i.name)).toEqual(["arroz", "pollo", "sal"]);
  });

  it("prefiere las líneas a las comas, para no romper «aceite de oliva, virgen»", () => {
    const ingredients = splitIngredients("aceite de oliva, virgen\nsal");

    expect(ingredients).toHaveLength(2);
    expect(ingredients[0].name).toBe("aceite de oliva, virgen");
  });

  it("quita las viñetas que trae una lista pegada de Notion", () => {
    const ingredients = splitIngredients("- 200 g arroz\n• sal\n* pimienta");
    expect(ingredients.map((i) => i.name)).toEqual(["arroz", "sal", "pimienta"]);
  });

  it("no devuelve nada si no hay párrafo", () => {
    expect(splitIngredients(null)).toEqual([]);
    expect(splitIngredients("   ")).toEqual([]);
  });
});

describe("mapNotionMeal", () => {
  it("traduce los tres tipos de comida", () => {
    const tipo = (name: string) => ({ type: "select", select: { name } });

    expect(mapNotionMeal(page({ "Tipo de comida": tipo("Desayuno") }))?.meal.meal_type).toBe("DESAYUNO");
    expect(mapNotionMeal(page({ "Tipo de comida": tipo("Cena") }))?.meal.meal_type).toBe("CENA");
  });

  it("recorta la fecha con hora al día", () => {
    expect(mapNotionMeal(page({}))?.meal.meal_date).toBe("2025-11-11");
  });

  it("convierte el párrafo de ingredientes en filas", () => {
    const result = mapNotionMeal(page({ Ingredientes: text("200 g arroz\n1 ud pollo") }));

    expect(result?.meal.ingredients).toHaveLength(2);
    expect(result?.meal.ingredients[0]).toEqual({ name: "arroz", quantity: 200, unit: "g" });
  });

  it("sin tipo lo deja en almuerzo, sin avisar de nada", () => {
    const result = mapNotionMeal(page({}));

    expect(result?.meal.meal_type).toBe("ALMUERZO");
    expect(result?.warnings).toEqual([]);
  });

  it("avisa de un tipo que no reconoce", () => {
    const result = mapNotionMeal(
      page({ "Tipo de comida": { type: "select", select: { name: "Merienda" } } }),
    );

    expect(result?.warnings).toContain("Tipo de comida desconocido: «Merienda»");
  });

  it("descarta una fila sin nombre o sin día", () => {
    expect(mapNotionMeal({ id: "x", properties: { Fecha: { date: { start: "2026-01-01" } } } })).toBeNull();
    expect(
      mapNotionMeal({ id: "x", properties: { "Nombre de la comida": { title: [{ plain_text: "Sopa" }] } } }),
    ).toBeNull();
  });
});
