import { formatClock, parseClockLabel } from "@/lib/notion/clock";
import {
  createdTime,
  findProperty,
  matchOptions,
  multiSelectNames,
  numberValue,
  plainText,
  selectName,
  type NotionProperties,
} from "@/lib/notion/properties";

import { GENRES } from "./reading";

/**
 * Traduce la base «Leer» de Notion, que tiene los campos cruzados.
 *
 * No es una suposición: en el esquema real, «Cuanto Tiempo lei ?» guarda
 * géneros (Crecimiento personal, Fantacia, Metafisica…) y «Cuantas Hojas»
 * tiene una única opción, que es «40 minutos». Se rellenaron una vez con lo
 * que no tocaba y las listas de opciones se quedaron así.
 *
 * La traducción deshace el cruce leyendo cada campo por lo que de verdad
 * contiene, no por cómo se llama. Y hay una cosa que no se puede recuperar:
 * **las páginas leídas no existen en ningún sitio**, porque el campo que
 * debería tenerlas quedó ocupado por los minutos. Se importan como ausentes en
 * lugar de inventarse un número, y el ritmo de páginas por hora sólo empezará
 * a salir con las lecturas que se registren desde ahora.
 */

export interface NotionMappedSession {
  notion_page_id: string;
  session_date: string;
  /** «HH:MM» en la zona del usuario; el llamador lo combina con la fecha. */
  start_clock: string | null;
  minutes: number | null;
  /** Siempre null al importar: ver arriba. */
  pages: number | null;
  score: number | null;
  summary: string | null;
  /** Título y autor del libro, si la fila decía cuál era. */
  book_title: string | null;
  book_author: string | null;
  genres: string[];
}

export interface SessionMappingResult {
  session: NotionMappedSession;
  warnings: string[];
}

/** «40 minutos» → 40. También entiende «1 hora» y «1h 30». */
export function parseDurationLabel(label: string | null): number | null {
  if (!label) return null;
  const text = label.trim().toLowerCase();

  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\b/);
  const minutes = text.match(/(\d+)\s*m(?:in(?:utos?)?)?\b/);

  const fromHours = hours ? Number(hours[1].replace(",", ".")) * 60 : 0;
  const fromMinutes = minutes ? Number(minutes[1]) : 0;
  const total = Math.round(fromHours + fromMinutes);

  return total > 0 ? total : null;
}

export function mapNotionSession(page: {
  id: string;
  properties: NotionProperties;
}): SessionMappingResult | null {
  const properties = page.properties ?? {};

  // La base no tiene columna de fecha: se usa la de creación de la página,
  // que es cuando se apuntó la lectura y, en la práctica, cuando se leyó.
  const created = createdTime(findProperty(properties, "Inicio"));
  const sessionDate = created?.slice(0, 10) ?? null;
  if (!sessionDate) return null;

  const warnings: string[] = [];

  const startLabel = selectName(findProperty(properties, "A que hora empece"));
  const startClock = formatClock(parseClockLabel(startLabel));
  if (startLabel && !startClock) warnings.push(`Hora de inicio ilegible: «${startLabel}»`);

  // «Cuantas Hojas» dice hojas y guarda minutos.
  const durationLabel = selectName(findProperty(properties, "Cuantas Hojas"));
  const minutes = parseDurationLabel(durationLabel);
  if (durationLabel && minutes === null) {
    warnings.push(`Duración ilegible en «Cuantas Hojas»: «${durationLabel}»`);
  }

  // El género está repartido entre los dos campos que lo acabaron guardando.
  const genres = matchOptions(
    [
      ...multiSelectNames(findProperty(properties, "Tipo de lectura")),
      ...multiSelectNames(findProperty(properties, "Cuanto Tiempo lei")),
    ],
    GENRES,
  );
  for (const dropped of genres.dropped) {
    warnings.push(`Género desconocido: «${dropped}»`);
  }

  const score = numberValue(findProperty(properties, "Puntaje"));

  return {
    session: {
      notion_page_id: page.id,
      session_date: sessionDate,
      start_clock: startClock,
      minutes,
      pages: null,
      score,
      summary: plainText(findProperty(properties, "Resumen")),
      book_title: multiSelectNames(findProperty(properties, "Que libro"))[0] ?? null,
      book_author: multiSelectNames(findProperty(properties, "Autor"))[0] ?? null,
      genres: genres.kept,
    },
    warnings,
  };
}

export interface NotionMappedBook {
  title: string;
  author: string | null;
  genres: string[];
}

/**
 * Los libros que aparecen en las sesiones.
 *
 * Se deducen de las lecturas porque en Notion no hay una base de libros usable
 * -- la que existe está vacía salvo por dos filas de prueba. Un libro reúne
 * los géneros de todas sus lecturas, que es como el género acaba donde
 * corresponde: en el libro, no en cada rato.
 */
export function booksIn(sessions: NotionMappedSession[]): NotionMappedBook[] {
  const byTitle = new Map<string, NotionMappedBook>();

  for (const session of sessions) {
    if (!session.book_title) continue;
    const existing = byTitle.get(session.book_title) ?? {
      title: session.book_title,
      author: session.book_author,
      genres: [],
    };
    existing.author = existing.author ?? session.book_author;
    for (const genre of session.genres) {
      if (!existing.genres.includes(genre)) existing.genres.push(genre);
    }
    byTitle.set(session.book_title, existing);
  }

  return [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}
