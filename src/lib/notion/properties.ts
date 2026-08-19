/**
 * Lectores de propiedades de una página de Notion.
 *
 * Son puros y trabajan sobre el objeto ya descargado, no sobre el cliente,
 * porque es donde están todos los errores posibles de una importación -- una
 * propiedad renombrada, un tipo cambiado, una opción nueva -- y así se prueban
 * sin red de por medio.
 *
 * Viven aquí y no dentro de un módulo porque las seis importaciones necesitan
 * exactamente lo mismo, y porque un módulo no puede importar de otro.
 */

export type NotionProperties = Record<string, unknown>;
type Property = Record<string, unknown> | null;

/**
 * Busca una propiedad ignorando mayúsculas, tildes y espacios sobrantes.
 *
 * No es una comodidad: en las bases reales del usuario hay siete propiedades
 * con un espacio colgando -- «Dia de dormir », «antes de dormir », «Donde »,
 * «Hora de despertar », « resumen», «Guión », «Miniatura A/B »-- y algunas con
 * tilde inconsistente. Buscar por el nombre exacto significa que el día que
 * alguien corrija uno en Notion, la importación deje de traer ese campo sin
 * decir nada.
 */
export function findProperty(properties: NotionProperties, name: string): Property {
  const wanted = normaliseKey(name);
  for (const [key, value] of Object.entries(properties)) {
    if (normaliseKey(key) === wanted) return value as Record<string, unknown>;
  }
  return null;
}

function normaliseKey(key: string): string {
  return (
    key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // «Cuanto tiempo Dormí? » y «Cuanto tiempo Dormi» son la misma columna.
      .replace(/[?¿!¡]/g, "")
      .replace(/\s+/g, " ")
      // El recorte va al final y no al principio: «Que libro ?» deja un
      // espacio colgando justo al quitar la interrogación, y recortar antes
      // no lo vería. Ese descuadre hacía que el campo no se encontrara y la
      // importación se dejara el libro y el género sin decir nada.
      .trim()
  );
}

/** El texto de un título o de un campo de texto enriquecido. Vacío es null. */
export function plainText(property: Property): string | null {
  if (!property) return null;
  const items = (property.title ?? property.rich_text) as { plain_text?: string }[] | undefined;
  if (!Array.isArray(items)) return null;
  const text = items
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
  return text === "" ? null : text;
}

export function multiSelectNames(property: Property): string[] {
  const items = property?.multi_select as { name?: string }[] | undefined;
  if (!Array.isArray(items)) return [];
  return items.map((item) => item.name ?? "").filter((name) => name !== "");
}

/** Sirve igual para `select` y para `status`: los dos guardan `{ name }`. */
export function selectName(property: Property): string | null {
  const value = (property?.select ?? property?.status) as { name?: string } | null | undefined;
  return value?.name ?? null;
}

export function checkbox(property: Property): boolean {
  return property?.checkbox === true;
}

export function numberValue(property: Property): number | null {
  const value = property?.number;
  return typeof value === "number" ? value : null;
}

/**
 * El día de una fecha, sin hora.
 *
 * Una fecha con hora llega como ISO completo y se recorta al día porque las
 * columnas que la reciben son `date`. Recortar la cadena en lugar de convertir
 * a Date es deliberado: convertir la anclaría a la zona del servidor y una
 * fecha de las 21:00 en Bogotá se archivaría un día tarde.
 */
export function dateStart(property: Property): string | null {
  const value = property?.date as { start?: string } | null | undefined;
  return value?.start?.slice(0, 10) ?? null;
}

/** La marca de tiempo completa, cuando la fecha sí traía hora. */
export function dateStartInstant(property: Property): string | null {
  const value = property?.date as { start?: string } | null | undefined;
  const start = value?.start;
  return start && start.length > 10 ? start : null;
}

export function createdTime(property: Property): string | null {
  const value = property?.created_time;
  return typeof value === "string" ? value : null;
}

/** El primer archivo con enlace, subido o externo. */
export function firstFileUrl(property: Property): string | null {
  const files = property?.files as
    | { external?: { url?: string }; file?: { url?: string } }[]
    | undefined;
  if (!Array.isArray(files)) return null;
  for (const entry of files) {
    const url = entry.external?.url ?? entry.file?.url;
    if (url) return url;
  }
  return null;
}

export interface KnownOnly {
  kept: string[];
  dropped: string[];
}

/**
 * Se queda sólo con las opciones que la aplicación conoce.
 *
 * Una etiqueta nueva en Notion se descarta en lugar de guardarse, porque las
 * gráficas y los filtros la ignorarían igual y guardarla daría la falsa
 * impresión de que se está usando. Lo descartado se devuelve para poder
 * avisar en el informe en vez de callar.
 */
export function knownOnly(names: string[], allowed: readonly string[]): KnownOnly {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const name of names) {
    if (allowed.includes(name)) kept.push(name);
    else dropped.push(name);
  }
  return { kept, dropped };
}

/**
 * Empareja una etiqueta de Notion con nuestra ortografía.
 *
 * Las mismas opciones están escritas de dos formas: Notion dice «Con energia»,
 * «Con Alarma» y «Desperte durante la noche», y aquí son «Con energía», «Con
 * alarma» y «Desperté durante la noche». Son la misma cosa, y compararlas
 * literalmente las perdería todas.
 *
 * Devuelve *nuestra* forma, no la de Notion, para que lo importado y lo que se
 * marque en el formulario sean el mismo valor y las gráficas no acaben con dos
 * barras para el mismo ánimo.
 */
export function matchOption(name: string, allowed: readonly string[]): string | null {
  const wanted = loosen(name);
  return allowed.find((option) => loosen(option) === wanted) ?? null;
}

/** Como `knownOnly`, pero devolviendo la ortografía nuestra. */
export function matchOptions(names: string[], allowed: readonly string[]): KnownOnly {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const name of names) {
    const match = matchOption(name, allowed);
    if (match !== null) {
      if (!kept.includes(match)) kept.push(match);
    } else {
      dropped.push(name);
    }
  }
  return { kept, dropped };
}

function loosen(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
