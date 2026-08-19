/**
 * Lecturas, en su forma pura.
 *
 * En Notion los campos se cruzaron: «Cuánto tiempo leí» guarda géneros
 * (Crecimiento personal, Fantasía, Metafísica…) y «Cuántas hojas» tiene como
 * única opción «40 minutos». Aquí los minutos son minutos, las páginas son
 * páginas y el género es del libro, no de la sesión -- que es donde debía
 * estar desde el principio.
 */

/** Los géneros tal cual están en la base «Leer» de Notion. */
export const GENRES = [
  "Crecimiento personal",
  "Fantasía",
  "Metafísica",
  "Marketing",
  "Espiritual",
] as const;

export const BOOK_STATUSES = ["POR_LEER", "LEYENDO", "TERMINADO", "ABANDONADO"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  POR_LEER: "Por leer",
  LEYENDO: "Leyendo",
  TERMINADO: "Terminado",
  ABANDONADO: "Abandonado",
};

export interface SessionLike {
  minutes: number | null;
  pages: number | null;
  sessionDate: string;
}

export interface ReadingTotals {
  sessions: number;
  minutes: number;
  pages: number;
  /** Páginas por hora, sólo cuando hay ambos datos suficientes para que signifique algo. */
  pagesPerHour: number | null;
}

/**
 * Suma un conjunto de sesiones.
 *
 * Los nulos suman cero aquí, al contrario que en sueño: no apuntar las
 * páginas de una sesión no invalida los minutos de esa misma sesión, así que
 * cada campo se agrega por su cuenta.
 */
export function totalsFor(sessions: SessionLike[]): ReadingTotals {
  const minutes = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const pages = sessions.reduce((sum, s) => sum + (s.pages ?? 0), 0);

  return {
    sessions: sessions.length,
    minutes,
    pages,
    // Menos de diez minutos no da un ritmo creíble, sólo un número grande.
    pagesPerHour: minutes >= 10 && pages > 0 ? Math.round((pages / minutes) * 60) : null,
  };
}

/** «1h 20m» o «45m». */
export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Cuánto llevas de un libro.
 *
 * Devuelve null si no se sabe el total de páginas: media barra de progreso
 * inventada es peor que ninguna.
 */
export function bookProgress(pagesRead: number, totalPages: number | null): number | null {
  if (!totalPages || totalPages <= 0) return null;
  return Math.min(100, Math.round((pagesRead / totalPages) * 100));
}
