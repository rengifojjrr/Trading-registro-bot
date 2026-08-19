/**
 * Comidas, en su forma pura.
 *
 * El planificador de Notion está bien montado, así que traérselo sólo se
 * justifica por una cosa: allí los ingredientes son un párrafo de texto
 * libre, y de un párrafo no sale una lista de la compra. Aquí cada
 * ingrediente es una fila, y eso es todo el módulo.
 */

export const MEAL_TYPES = ["DESAYUNO", "ALMUERZO", "CENA"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  DESAYUNO: "Desayuno",
  ALMUERZO: "Almuerzo",
  CENA: "Cena",
};

export interface IngredientLike {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface ShoppingItem {
  name: string;
  /** Cantidad por unidad de medida. Un ingrediente puede aparecer en gramos en una receta y en unidades en otra. */
  amounts: { quantity: number; unit: string }[];
  /** Veces que aparece sin cantidad -- «sal», «aceite». */
  unmeasured: number;
}

/**
 * Junta los ingredientes de varias comidas en una lista de la compra.
 *
 * Agrupa por nombre normalizado, y dentro por unidad: sumar 200 gramos con
 * 2 unidades daría 202 de nada. Lo que no lleva cantidad se cuenta aparte en
 * lugar de descartarlo -- «sal» sigue teniendo que estar en la lista.
 */
export function buildShoppingList(ingredients: IngredientLike[]): ShoppingItem[] {
  const byName = new Map<string, ShoppingItem>();

  for (const ingredient of ingredients) {
    const key = normalise(ingredient.name);
    if (key === "") continue;

    const item = byName.get(key) ?? { name: titleCase(ingredient.name), amounts: [], unmeasured: 0 };

    if (ingredient.quantity === null || ingredient.quantity === 0) {
      item.unmeasured += 1;
    } else {
      const unit = (ingredient.unit ?? "").trim().toLowerCase() || "ud";
      const existing = item.amounts.find((a) => a.unit === unit);
      if (existing) existing.quantity += ingredient.quantity;
      else item.amounts.push({ quantity: ingredient.quantity, unit });
    }

    byName.set(key, item);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** «500 g · 2 ud» o «×3» cuando no hay cantidades. */
export function formatShoppingAmount(item: ShoppingItem): string {
  const parts = item.amounts.map((a) => `${trimNumber(a.quantity)} ${a.unit}`);
  if (parts.length === 0) return item.unmeasured > 1 ? `×${item.unmeasured}` : "";
  if (item.unmeasured > 0) parts.push(`+${item.unmeasured} sin cantidad`);
  return parts.join(" · ");
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * Ignora mayúsculas, acentos y el plural simple, para que «Tomates» y
 * «tomate» sean el mismo ingrediente.
 *
 * Sólo se quita una «s» final. La otra regla del plural español -- «es»
 * tras consonante, limón/limones -- se deja fuera a propósito: aplicada a
 * ciegas convierte «tomates» en «tomat» y deja de casar con «tomate», y
 * fusionar dos ingredientes distintos por pasarse de listo es peor error que
 * no fusionar dos formas del mismo.
 */
function normalise(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return base.length > 3 && base.endsWith("s") ? base.slice(0, -1) : base;
}

function titleCase(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Parte un ingrediente escrito de corrido: «200 g tomate» → cantidad,
 * unidad y nombre.
 *
 * Escribir tres campos por ingrediente es tedioso y hace que no lo apuntes,
 * así que se acepta una línea y se interpreta. Si no encaja, el texto entero
 * es el nombre y no se pierde nada.
 */
export function parseIngredientLine(line: string): IngredientLike | null {
  const text = line.trim();
  if (text === "") return null;

  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ]{1,10})?\s+(.+)$/);
  if (!match) return { name: text, quantity: null, unit: null };

  const quantity = Number(match[1].replace(",", "."));
  const maybeUnit = match[2]?.toLowerCase();
  const rest = match[3];

  // Sin unidad reconocible, el segundo grupo era parte del nombre.
  const KNOWN_UNITS = ["g", "kg", "ml", "l", "ud", "uds", "cda", "cdta", "taza", "tazas", "lata", "latas"];
  if (maybeUnit && KNOWN_UNITS.includes(maybeUnit)) {
    return { name: rest, quantity, unit: maybeUnit };
  }
  return { name: [maybeUnit, rest].filter(Boolean).join(" "), quantity, unit: null };
}
