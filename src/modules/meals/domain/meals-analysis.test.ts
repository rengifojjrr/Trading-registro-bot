import { describe, expect, it } from "vitest";

import {
  commonIngredients,
  countsByType,
  planningCoverage,
  repeatedMeals,
  weekGrid,
  type AnalysableMeal,
} from "./meals-analysis";

function meal(over: Partial<AnalysableMeal> = {}): AnalysableMeal {
  return {
    mealDate: "2026-08-19",
    mealType: "ALMUERZO",
    name: "Arroz con pollo",
    ingredients: [{ name: "arroz", quantity: 200, unit: "g" }],
    ...over,
  };
}

describe("repeatedMeals", () => {
  it("agrupa el mismo plato escrito de formas distintas", () => {
    const points = repeatedMeals([
      meal({ name: "Arroz con pollo" }),
      meal({ name: "arroz  con   pollo" }),
    ]);

    expect(points).toEqual([{ label: "Arroz con pollo", value: 2 }]);
  });

  it("esconde lo que sólo comiste una vez, que no es una costumbre", () => {
    const points = repeatedMeals([meal({ name: "Lentejas" }), meal({ name: "Pasta" })]);
    expect(points).toEqual([]);
  });

  it("ordena de más repetido a menos", () => {
    const points = repeatedMeals([
      meal({ name: "Pasta" }),
      meal({ name: "Pasta" }),
      meal({ name: "Lentejas" }),
      meal({ name: "Lentejas" }),
      meal({ name: "Lentejas" }),
    ]);

    expect(points.map((p) => p.label)).toEqual(["Lentejas", "Pasta"]);
  });
});

describe("commonIngredients", () => {
  it("cuenta comidas, no cantidades", () => {
    const points = commonIngredients([
      meal({ ingredients: [{ name: "arroz", quantity: 200, unit: "g" }] }),
      meal({ ingredients: [{ name: "Arroz", quantity: 1, unit: "kg" }] }),
    ]);

    expect(points).toEqual([{ label: "Arroz", value: 2 }]);
  });

  it("no cuenta dos veces un ingrediente repetido dentro de una comida", () => {
    const points = commonIngredients([
      meal({
        ingredients: [
          { name: "arroz", quantity: 200, unit: "g" },
          { name: "arroz", quantity: 100, unit: "g" },
        ],
      }),
    ]);

    expect(points[0].value).toBe(1);
  });
});

describe("weekGrid", () => {
  it("devuelve los veintiún huecos, incluidos los vacíos", () => {
    const grid = weekGrid([meal()], "2026-08-17");

    expect(grid).toHaveLength(7);
    expect(grid.every((day) => day.slots.length === 3)).toBe(true);
  });

  it("coloca cada comida en su día y su tipo", () => {
    const grid = weekGrid(
      [meal({ mealDate: "2026-08-19", mealType: "CENA", name: "Sopa" })],
      "2026-08-17",
    );

    const miercoles = grid.find((d) => d.date === "2026-08-19")!;
    expect(miercoles.slots.find((s) => s.type === "CENA")!.meals[0].name).toBe("Sopa");
    expect(miercoles.slots.find((s) => s.type === "ALMUERZO")!.meals).toEqual([]);
  });

  it("admite varias comidas en el mismo hueco", () => {
    const grid = weekGrid([meal(), meal({ name: "Ensalada" })], "2026-08-19", 1);
    expect(grid[0].slots.find((s) => s.type === "ALMUERZO")!.meals).toHaveLength(2);
  });
});

describe("planningCoverage", () => {
  it("es el porcentaje de huecos con algo planificado", () => {
    const grid = weekGrid([meal({ mealDate: "2026-08-17" })], "2026-08-17", 1);
    expect(planningCoverage(grid)).toBe(33);
  });

  it("devuelve null sin rejilla, que no es lo mismo que un cero por ciento", () => {
    expect(planningCoverage([])).toBeNull();
  });
});

describe("countsByType", () => {
  it("devuelve los tres tipos aunque alguno esté a cero", () => {
    const points = countsByType([meal({ mealType: "CENA" })]);

    expect(points.map((p) => p.label)).toEqual(["Desayuno", "Almuerzo", "Cena"]);
    expect(points.find((p) => p.label === "Cena")?.value).toBe(1);
    expect(points.find((p) => p.label === "Desayuno")?.value).toBe(0);
  });
});
