/**
 * Cuándo cuenta una operación como apuntada.
 *
 * La fila de diario puede existir y estar vacía: el formulario la crea al
 * abrirlo, y la encuesta la crea en cuanto se toca la primera respuesta. Si
 * la mera existencia de la fila contara, abrir la ficha y cerrarla haría
 * desaparecer la operación de todo lo que recuerda apuntarla -- que es
 * exactamente el olvido que esas listas existen para evitar.
 *
 * Lo decidía cada sitio por su cuenta con su propia copia de la condición: el
 * aviso de la sincronización, la bandeja del diario y ahora la encuesta. Tres
 * copias son, a la primera corrección, tres criterios distintos, y entonces
 * el aviso dice que hay seis sin apuntar y la bandeja enseña cinco.
 *
 * Las notas del 1 al 5 **no** cuentan a propósito. Son un toque, no algo
 * escrito: dejarlas contar haría que una encuesta abandonada a la segunda
 * pregunta se leyera como una operación apuntada, y nadie volvería a ella.
 *
 * Puro: recibe la fila ya leída y no sabe de base de datos.
 */

export interface JournalContentRow {
  notes: string | null;
  lesson_learned: string | null;
  emotional_state: string | null;
  mistake_tag: string | null;
  strategy_id: string | null;
}

export function hasJournalContent(row: JournalContentRow | null | undefined): boolean {
  if (!row) return false;
  return (
    (row.notes ?? "").trim() !== "" ||
    (row.lesson_learned ?? "").trim() !== "" ||
    row.emotional_state !== null ||
    row.mistake_tag !== null ||
    row.strategy_id !== null
  );
}

/** Las columnas que hay que pedir para poder responder a lo de arriba. */
export const JOURNAL_CONTENT_COLUMNS =
  "trade_id, notes, lesson_learned, emotional_state, mistake_tag, strategy_id";
