/**
 * La nota del setup: A+, A, B o C.
 *
 * No es una columna del diario sino una etiqueta («Setup: A+»), porque así la
 * dejó la importación de Notion y una operación no puede tener dos sitios
 * distintos para lo mismo según de dónde viniera.
 *
 * Vive aquí y no dentro de una acción para que la ficha de una operación y el
 * cuadro de apuntar varias a la vez lean y escriban exactamente lo mismo: dos
 * copias del prefijo son dos formas de que la nota de una operación deje de
 * encontrarse.
 *
 * Puro: sólo nombres.
 */

export const SETUP_GRADES = ["A+", "A", "B", "C"] as const;

export type SetupGrade = (typeof SETUP_GRADES)[number];

export const SETUP_TAG_PREFIX = "Setup: ";

/** El nombre de la etiqueta que guarda una nota. */
export function setupTagName(grade: SetupGrade): string {
  return `${SETUP_TAG_PREFIX}${grade}`;
}

/**
 * La nota que hay dentro del nombre de una etiqueta, si es de setup.
 *
 * Devuelve `null` para cualquier otra etiqueta y también para una que empiece
 * por «Setup: » con algo que no es una nota conocida: eso es una etiqueta que
 * alguien escribió a mano, y tratarla como nota la haría desaparecer en el
 * primer guardado.
 */
export function gradeFromTagName(name: string): SetupGrade | null {
  if (!name.startsWith(SETUP_TAG_PREFIX)) return null;
  const resto = name.slice(SETUP_TAG_PREFIX.length);
  return (SETUP_GRADES as readonly string[]).includes(resto) ? (resto as SetupGrade) : null;
}

export function isSetupGrade(value: unknown): value is SetupGrade {
  return typeof value === "string" && (SETUP_GRADES as readonly string[]).includes(value);
}
