/**
 * Qué es cada evento y cuáles miran los que operan Bitcoin.
 *
 * Puro y sin dependencias, probado en `relevance.test.ts`.
 */

/**
 * Las categorías que devuelve la fuente, confirmadas contra trece meses de
 * datos reales (2025-09 a 2026-10). Lo que no esté aquí se enseña sin
 * etiqueta en vez de con una inventada.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  prce: "Precios e inflación",
  lbr: "Empleo",
  mny: "Dinero y banca central",
  gdp: "PIB",
  cnsm: "Consumo",
  bsnss: "Actividad empresarial",
  hse: "Vivienda",
  enrg: "Energía",
  trd: "Comercio exterior",
  bnd: "Deuda pública",
  gov: "Gobierno",
  mrkt: "Mercados",
};

export function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return CATEGORY_LABELS[category] ?? null;
}

/**
 * Las publicaciones que un operador de Bitcoin mira antes de abrir posición.
 *
 * Es una lista corta y a mano, no una teoría: inflación, empleo, la Reserva
 * Federal y el crecimiento. Son las que mueven el apetito por riesgo, y
 * Bitcoin cotiza como activo de riesgo.
 *
 * Importante lo que **no** dice: nada aquí predice hacia dónde irá el precio.
 * Sólo dice «de esto se habla». La aplicación no adivina el mercado; enseña
 * qué viene y cuándo, y la decisión sigue siendo de quien opera.
 *
 * Se compara contra `indicator` y `title` en minúsculas, así que basta con el
 * trozo distintivo del nombre.
 */
const CLAVES_PARA_BITCOIN = [
  // Inflación: lo que marca el ritmo de la Reserva Federal.
  "inflation rate",
  "core inflation",
  "pce price",
  "producer price",
  "ppi",
  "cpi",
  // La Reserva Federal, en todas sus formas.
  "fed interest rate",
  "fomc",
  "fed chair",
  "fed press conference",
  "interest rate decision",
  // Empleo.
  "non farm payrolls",
  "nonfarm payrolls",
  "unemployment rate",
  "initial jobless claims",
  "jolts",
  // Crecimiento y consumo.
  "gdp growth",
  "retail sales",
  "ism manufacturing",
  "ism services",
] as const;

/**
 * Si es de los que se miran para Bitcoin.
 *
 * Un evento cuenta si está en la lista de arriba **o** si la fuente lo marca
 * como de alto impacto. Lo segundo cubre lo que la lista no anticipó -- un
 * discurso del presidente, una revisión anual -- sin tener que mantenerla al
 * día de todo lo que existe.
 */
export function isKeyForBitcoin(event: {
  title: string;
  indicator: string | null;
  importance: number;
}): boolean {
  if (event.importance === 1) return true;

  const texto = `${event.indicator ?? ""} ${event.title}`.toLowerCase();
  return CLAVES_PARA_BITCOIN.some((clave) => texto.includes(clave));
}

/**
 * Los países que se siguen.
 *
 * Sólo Estados Unidos: es de donde salen la Reserva Federal y los datos que
 * mueven el apetito por riesgo global, y añadir la zona euro doblaría la
 * lista para ganar dos o tres publicaciones al mes. Es una constante y no una
 * opción de configuración porque hoy no hay ninguna razón para tocarla; el
 * día que la haya, se toca aquí.
 */
export const COUNTRIES = ["US"] as const;
