import {
  CHANNELS,
  CONTENT_TYPES,
  DIFFICULTIES,
  EDIT_STYLES,
  EDIT_TIME_OPTIONS,
  PLATFORMS,
  RECORD_TIME_OPTIONS,
  STATUSES,
  type ContentStatus,
  type ContentType,
  type Difficulty,
} from "./content";

/**
 * Traduce una página del calendario de Notion a una fila nuestra.
 *
 * Es una función pura sobre las propiedades ya descargadas, y no parte del
 * cliente de Notion, por una razón práctica: el mapeo es donde están todos
 * los errores posibles -- un estado que no reconocemos, una etiqueta de
 * tiempo nueva, una propiedad renombrada -- y así se prueban todos sin red
 * de por medio.
 *
 * La dirección es una sola: Notion manda en Contenido mientras el editor
 * trabaje allí, y esto refleja. Nada de aquí escribe en Notion.
 */

export interface NotionMappedPiece {
  notion_page_id: string;
  title: string;
  summary: string | null;
  channels: string[];
  platforms: string[];
  content_type: ContentType | null;
  status: ContentStatus;
  planned_date: string | null;
  has_script: boolean;
  is_edited: boolean;
  has_thumbnail_ab: boolean;
  record_difficulty: Difficulty | null;
  record_minutes: number | null;
  edit_minutes: number | null;
  edit_time_uncapped: boolean;
  edit_styles: string[];
  edit_notes: string | null;
  video_url: string | null;
  final_url: string | null;
}

/** Los rótulos de Notion, tal cual, contra nuestros identificadores. */
const STATUS_FROM_NOTION: Record<string, ContentStatus> = {
  Idea: "IDEA",
  "Falta Guion": "FALTA_GUION",
  "Falta grabar": "FALTA_GRABAR",
  "Falta editar": "FALTA_EDITAR",
  Editando: "EDITANDO",
  "Editado FALTA LINK": "EDITADO_FALTA_LINK",
  "En Drive": "EN_DRIVE",
  "Falta miniatura": "FALTA_MINIATURA",
  "Listo para publicar": "LISTO_PARA_PUBLICAR",
  Publicado: "PUBLICADO",
};

const TYPE_FROM_NOTION: Record<string, ContentType> = {
  Video: "VIDEO",
  Photo: "FOTO",
};

/**
 * Busca una propiedad ignorando mayúsculas, tildes y espacios sobrantes.
 *
 * Tres propiedades del calendario real llevan un espacio de más -- « resumen»,
 * «Guión », «Miniatura A/B » -- y ese espacio se escribió una vez y ahí se
 * quedó. Buscar por el nombre exacto haría que el día que alguien lo corrija
 * en Notion, la importación deje de traer esos campos sin decir nada.
 */
function findProperty(
  properties: Record<string, unknown>,
  name: string,
): Record<string, unknown> | null {
  const wanted = normaliseKey(name);
  for (const [key, value] of Object.entries(properties)) {
    if (normaliseKey(key) === wanted) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function normaliseKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function plainText(property: Record<string, unknown> | null): string | null {
  if (!property) return null;
  const items = (property.title ?? property.rich_text) as { plain_text?: string }[] | undefined;
  if (!Array.isArray(items)) return null;
  const text = items
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
  return text === "" ? null : text;
}

function multiSelectNames(property: Record<string, unknown> | null): string[] {
  const items = property?.multi_select as { name?: string }[] | undefined;
  if (!Array.isArray(items)) return [];
  return items.map((item) => item.name ?? "").filter((name) => name !== "");
}

function selectName(property: Record<string, unknown> | null): string | null {
  const value = (property?.select ?? property?.status) as { name?: string } | null | undefined;
  return value?.name ?? null;
}

function checkbox(property: Record<string, unknown> | null): boolean {
  return property?.checkbox === true;
}

function dateStart(property: Record<string, unknown> | null): string | null {
  const value = property?.date as { start?: string } | null | undefined;
  const start = value?.start;
  if (!start) return null;
  // Una fecha con hora llega como ISO completo; nos quedamos con el día,
  // que es la única precisión que la columna admite.
  return start.slice(0, 10);
}

function firstFileUrl(property: Record<string, unknown> | null): string | null {
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

/**
 * Sólo las opciones que conocemos.
 *
 * Una etiqueta nueva en Notion -- un canal que se añade el mes que viene --
 * se descarta en lugar de guardarse, porque nuestras gráficas y filtros la
 * ignorarían igual y guardarla daría la falsa impresión de que se está
 * usando. Se cuenta aparte y se informa al final de la importación.
 */
function knownOnly(names: string[], allowed: readonly string[]): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const name of names) {
    if (allowed.includes(name)) kept.push(name);
    else dropped.push(name);
  }
  return { kept, dropped };
}

/** La primera etiqueta de tiempo elegida, traducida a minutos. */
function timeFrom(names: string[], options: typeof RECORD_TIME_OPTIONS) {
  for (const name of names) {
    const option = options.find((o) => o.label === name);
    if (option) return { minutes: option.minutes, uncapped: option.uncapped ?? false };
  }
  return { minutes: null, uncapped: false };
}

export interface MappingResult {
  piece: NotionMappedPiece;
  /** Valores de Notion que no reconocemos, para poder avisar en lugar de callar. */
  warnings: string[];
}

export function mapNotionPage(page: {
  id: string;
  properties: Record<string, unknown>;
}): MappingResult | null {
  const properties = page.properties ?? {};
  const title = plainText(findProperty(properties, "Post"));

  // Una página sin título es una fila vacía de Notion, de las que quedan al
  // pulsar «nuevo» sin escribir nada. Importarlas llenaría el tablero de
  // piezas sin nombre.
  if (title === null) return null;

  const warnings: string[] = [];

  const statusLabel = selectName(findProperty(properties, "Status"));
  const status = statusLabel ? STATUS_FROM_NOTION[statusLabel] : undefined;
  if (statusLabel && !status) warnings.push(`Estado desconocido: «${statusLabel}»`);

  const typeLabel = selectName(findProperty(properties, "Type"));
  const contentType = (typeLabel ? TYPE_FROM_NOTION[typeLabel] : null) ?? null;
  if (typeLabel && !contentType) warnings.push(`Tipo desconocido: «${typeLabel}»`);

  const channels = knownOnly(multiSelectNames(findProperty(properties, "CANAL")), CHANNELS);
  const platforms = knownOnly(multiSelectNames(findProperty(properties, "Platform")), PLATFORMS);
  const styles = knownOnly(multiSelectNames(findProperty(properties, "Tipo de Edicion")), EDIT_STYLES);
  for (const dropped of [...channels.dropped, ...platforms.dropped, ...styles.dropped]) {
    warnings.push(`Opción desconocida: «${dropped}»`);
  }

  const difficultyLabel = multiSelectNames(findProperty(properties, "DIFICULTAD DE GRABAR"))[0] ?? null;
  const difficulty =
    difficultyLabel && (DIFFICULTIES as readonly string[]).includes(difficultyLabel)
      ? (difficultyLabel as Difficulty)
      : null;
  if (difficultyLabel && !difficulty) warnings.push(`Dificultad desconocida: «${difficultyLabel}»`);

  const recordNames = multiSelectNames(findProperty(properties, "Tiempo de Grabacion"));
  const editNames = multiSelectNames(findProperty(properties, "Tiempo de Edicion"));
  const record = timeFrom(recordNames, RECORD_TIME_OPTIONS);
  const edit = timeFrom(editNames, EDIT_TIME_OPTIONS);
  if (recordNames.length > 0 && record.minutes === null) {
    warnings.push(`Tiempo de grabación desconocido: «${recordNames[0]}»`);
  }
  if (editNames.length > 0 && edit.minutes === null) {
    warnings.push(`Tiempo de edición desconocido: «${editNames[0]}»`);
  }

  return {
    piece: {
      notion_page_id: page.id,
      title,
      summary: plainText(findProperty(properties, "resumen")),
      channels: channels.kept,
      platforms: platforms.kept,
      content_type: contentType,
      status: status ?? "IDEA",
      planned_date: dateStart(findProperty(properties, "Publish Date")),
      has_script: checkbox(findProperty(properties, "Guión")),
      is_edited: checkbox(findProperty(properties, "Editado")),
      has_thumbnail_ab: checkbox(findProperty(properties, "Miniatura A/B")),
      record_difficulty: difficulty,
      record_minutes: record.minutes,
      edit_minutes: edit.minutes,
      edit_time_uncapped: edit.uncapped,
      edit_styles: styles.kept,
      edit_notes: plainText(findProperty(properties, "Notas de edicion")),
      video_url: firstFileUrl(findProperty(properties, "Videos")),
      final_url: firstFileUrl(findProperty(properties, "Listo")),
    },
    warnings,
  };
}

/** Comprobación de arranque: los diez rótulos de Notion existen todos aquí. */
export function statusMappingIsComplete(): boolean {
  const mapped = new Set(Object.values(STATUS_FROM_NOTION));
  return STATUSES.every((status) => mapped.has(status));
}

export { CONTENT_TYPES };
