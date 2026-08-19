import {
  dateStart,
  findProperty,
  plainText,
  selectName,
  type NotionProperties,
} from "@/lib/notion/properties";

import { parseIngredientLine, type IngredientLike, type MealType } from "./meals";

/**
 * Traduce el «🍳 Planificador de Comidas» de Notion.
 *
 * La única razón de traerse este módulo es su campo de ingredientes: allí es
 * un párrafo de texto libre, y de un párrafo no salen cantidades sumadas. Aquí
 * cada ingrediente es una fila, y eso es toda la diferencia.
 *
 * La conversión es la misma que hace el formulario cuando se escribe a mano
 * -- una línea por ingrediente, «200 g tomate» -- así que se reutiliza
 * `parseIngredientLine` en lugar de tener dos interpretaciones que se
 * separarían con el tiempo. También se acepta la coma como separador, porque
 * un párrafo escrito de corrido rara vez lleva saltos de línea.
 */

export interface NotionMappedMeal {
  notion_page_id: string;
  meal_date: string;
  meal_type: MealType;
  name: string;
  notes: string | null;
  ingredients: IngredientLike[];
}

const TYPE_FROM_NOTION: Record<string, MealType> = {
  Desayuno: "DESAYUNO",
  Almuerzo: "ALMUERZO",
  Cena: "CENA",
};

export interface MealMappingResult {
  meal: NotionMappedMeal;
  warnings: string[];
}

/**
 * Parte el párrafo de ingredientes.
 *
 * Por líneas primero; si sólo hay una, por comas. Ese orden importa: una
 * lista escrita en líneas puede contener comas dentro de un ingrediente
 * («aceite de oliva, virgen»), y partir siempre por comas la rompería.
 */
export function splitIngredients(text: string | null): IngredientLike[] {
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter((line) => line !== "");

  const parts =
    lines.length > 1
      ? lines
      : (lines[0] ?? "")
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part !== "");

  return parts
    .map((part) => parseIngredientLine(part))
    .filter((ingredient): ingredient is IngredientLike => ingredient !== null);
}

export function mapNotionMeal(page: {
  id: string;
  properties: NotionProperties;
}): MealMappingResult | null {
  const properties = page.properties ?? {};

  const name = plainText(findProperty(properties, "Nombre de la comida"));
  const mealDate = dateStart(findProperty(properties, "Fecha"));

  // Sin nombre o sin día no hay comida que planificar: son las dos cosas que
  // la colocan en la rejilla de la semana.
  if (name === null || mealDate === null) return null;

  const warnings: string[] = [];

  const typeLabel = selectName(findProperty(properties, "Tipo de comida"));
  const mealType = typeLabel ? TYPE_FROM_NOTION[typeLabel] : undefined;
  if (typeLabel && !mealType) warnings.push(`Tipo de comida desconocido: «${typeLabel}»`);

  return {
    meal: {
      notion_page_id: page.id,
      meal_date: mealDate,
      // Sin tipo, almuerzo: es el hueco que más se rellena y el que menos
      // sorprende encontrar ocupado al mirar la semana.
      meal_type: mealType ?? "ALMUERZO",
      name,
      notes: plainText(findProperty(properties, "Notas")),
      ingredients: splitIngredients(plainText(findProperty(properties, "Ingredientes"))),
    },
    warnings,
  };
}
