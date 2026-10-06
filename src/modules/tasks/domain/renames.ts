import { normalizeName } from "@/core/people";

/**
 * Lo que se recuerda al renombrar algo en la aplicación.
 *
 * El archivo de Claude casa por nombre lo que no trae id. Si renombras a
 * «Lucía» como «Lucía Prado», o «Comprar pintura» como «Comprar pintura
 * blanca», el archivo de la vuelta siguiente todavía dice lo de antes, y sin
 * esto el importador creaba otra persona u otra tarea y le pasaba las tareas.
 * Por eso el nombre de antes se guarda: en una persona, entre sus alias; en
 * una tarea o un hito, en `former_titles`.
 */

/** Como mucho, los diez últimos (la base tiene el mismo tope). */
export const MAX_TITULOS_DE_ANTES = 10;

/**
 * Los títulos de antes después de renombrar `anterior` a `nuevo`, o `null` si
 * no hay nada que guardar (el mismo título, o sólo cambian tildes y mayúsculas).
 */
export function titulosDeAntes(anterior: string, anteriores: readonly string[], nuevo: string): string[] | null {
  const a = anterior.trim();
  if (a === "" || normalizeName(a) === normalizeName(nuevo)) return null;
  const sinRepetir = anteriores.filter((t) => normalizeName(t) !== normalizeName(a) && normalizeName(t) !== normalizeName(nuevo));
  return [...sinRepetir, a].slice(-MAX_TITULOS_DE_ANTES);
}

/**
 * Los alias de una persona después de renombrarla, o `null` si no cambian: el
 * nombre de antes pasa a ser un alias (si no lo era ya) y el nuevo deja de
 * serlo (sería repetirse).
 */
export function aliasConNombreDeAntes(anterior: string, alias: readonly string[], nuevo: string): string[] | null {
  const a = anterior.trim();
  if (a === "" || normalizeName(a) === normalizeName(nuevo)) return null;
  const sinNuevo = alias.filter((x) => normalizeName(x) !== normalizeName(nuevo));
  const yaEsta = sinNuevo.some((x) => normalizeName(x) === normalizeName(a));
  const resultado = yaEsta ? sinNuevo : [...sinNuevo, a];
  return resultado.slice(-20);
}
