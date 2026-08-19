/**
 * Contenido, en su forma pura.
 *
 * Esto es una traducción del calendario real -- «📷 Social Media Content
 * Calendar» -- y no un diseño nuevo. Su decisión más importante son los diez
 * estados: cada uno nombra un cuello de botella concreto (falta guion, falta
 * grabar, falta editar, falta miniatura) en lugar del clásico «pendiente / en
 * curso / hecho», que no dice *qué* falta -- que es justo lo que hay que
 * saber para desatascar una pieza.
 *
 * Lo único que cambia respecto a Notion son los tiempos: allí «2 Horas» es una
 * etiqueta de texto y aquí son minutos. Es el mismo arreglo que en sueño y por
 * el mismo motivo: de una etiqueta no sale una media. El formulario sigue
 * ofreciendo exactamente las mismas opciones.
 */

export const STATUSES = [
  "IDEA",
  "FALTA_GUION",
  "FALTA_GRABAR",
  "FALTA_EDITAR",
  "EDITANDO",
  "EDITADO_FALTA_LINK",
  "EN_DRIVE",
  "FALTA_MINIATURA",
  "LISTO_PARA_PUBLICAR",
  "PUBLICADO",
] as const;
export type ContentStatus = (typeof STATUSES)[number];

/** Los rótulos tal cual están escritos en Notion, tildes y mayúsculas incluidas. */
export const STATUS_LABELS: Record<ContentStatus, string> = {
  IDEA: "Idea",
  FALTA_GUION: "Falta guion",
  FALTA_GRABAR: "Falta grabar",
  FALTA_EDITAR: "Falta editar",
  EDITANDO: "Editando",
  EDITADO_FALTA_LINK: "Editado, falta link",
  EN_DRIVE: "En Drive",
  FALTA_MINIATURA: "Falta miniatura",
  LISTO_PARA_PUBLICAR: "Listo para publicar",
  PUBLICADO: "Publicado",
};

/** El orden real del proceso: ordena las columnas del tablero y define el paso siguiente. */
export const STATUS_ORDER: ContentStatus[] = [...STATUSES];

/**
 * De quién es cada estado.
 *
 * Es lo que permite que el tablero del editor enseñe sólo lo suyo sin tener
 * que mantener una segunda lista que se desincronice. «Editando» y «Editado,
 * falta link» son los dos estados en que la pieza está en manos de Luis.
 */
export const EDITOR_STATUSES: ContentStatus[] = ["FALTA_EDITAR", "EDITANDO", "EDITADO_FALTA_LINK"];

/** Los cuatro canales, tal cual en el campo CANAL. */
export const CHANNELS = ["PEKAS TRADING", "PEKAS PLAY", "PEKAS", "otro"] as const;

/** Las cuatro plataformas del campo Platform. */
export const PLATFORMS = ["YT LONG", "TikTok", "Insta", "YT Shorts"] as const;

export const CONTENT_TYPES = ["VIDEO", "FOTO"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  VIDEO: "Video",
  FOTO: "Foto",
};

export const DIFFICULTIES = ["FACIL", "MEDIO", "DIFICIL"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  FACIL: "Fácil",
  MEDIO: "Medio",
  DIFICIL: "Difícil",
};

/** Tipo de Edicion, con los cinco valores del calendario. */
export const EDIT_STYLES = [
  "Sencilla",
  "Multiples Camaras",
  "Tipo Documental",
  "Gameplay",
  "Con animaciones",
] as const;

export interface TimeOption {
  label: string;
  minutes: number;
  /** «Deje de contar»: el número es un suelo, no una medida. */
  uncapped?: boolean;
}

/**
 * Las opciones de «Tiempo de Grabacion», con su equivalencia en minutos.
 *
 * «Menos de 1 hora» se guarda como 30 y «Unas horas» como 180: son estimaciones
 * del punto medio del rango, no medidas. Se documentan aquí porque una media
 * calculada sobre estimaciones sigue siendo útil -- para comparar un formato
 * con otro -- pero no es un cronómetro, y conviene que se sepa.
 */
export const RECORD_TIME_OPTIONS: TimeOption[] = [
  { label: "Menos de 1 hora", minutes: 30 },
  { label: "3 horas", minutes: 180 },
  { label: "Unas horas", minutes: 180 },
  { label: "5 horas", minutes: 300 },
  { label: "16 horas", minutes: 960 },
  { label: "1 Dia de grabacion", minutes: 480 },
  { label: "Varios dias de Grabacion", minutes: 1440 },
];

/** Las opciones de «Tiempo de Edicion», con la de «deje de contar» incluida. */
export const EDIT_TIME_OPTIONS: TimeOption[] = [
  { label: "Menos de 1 hora", minutes: 30 },
  { label: "2 Horas", minutes: 120 },
  { label: "3 horas", minutes: 180 },
  { label: "4 Horas", minutes: 240 },
  { label: "6 Horas", minutes: 360 },
  { label: "8 Horas", minutes: 480 },
  { label: "9 horas", minutes: 540 },
  { label: "15 horas", minutes: 900 },
  { label: "16 horas", minutes: 960 },
  { label: "1 Dia", minutes: 480 },
  { label: "2 Dias", minutes: 960 },
  { label: "3 Dias", minutes: 1440 },
  { label: "4 Dias", minutes: 1920 },
  { label: "despues de las 10 deje de contar", minutes: 600, uncapped: true },
];

/** El paso siguiente, o null si ya está publicado. */
export function nextStatus(status: ContentStatus): ContentStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index >= 0 && index < STATUS_ORDER.length - 1 ? STATUS_ORDER[index + 1] : null;
}

export interface PieceLike {
  status: ContentStatus;
  plannedDate: string | null;
  publishedAt: string | null;
}

export interface ContentCounts {
  /** Todo lo que no está publicado: la cola real de trabajo. */
  inProgress: number;
  published: number;
  /** Planificado para una fecha ya pasada y todavía sin publicar. */
  late: number;
  /** En manos del editor ahora mismo. */
  withEditor: number;
}

export function countPieces(pieces: PieceLike[], today: string): ContentCounts {
  const open = pieces.filter((p) => p.status !== "PUBLICADO");
  return {
    inProgress: open.length,
    published: pieces.filter((p) => p.status === "PUBLICADO").length,
    late: open.filter((p) => p.plannedDate !== null && p.plannedDate < today).length,
    withEditor: open.filter((p) => EDITOR_STATUSES.includes(p.status)).length,
  };
}

/**
 * Cuántas piezas hay en cada estado.
 *
 * Devuelve siempre las diez claves, incluso a cero: una columna vacía es
 * información -- «no tengo nada grabado» es justo lo que hay que ver.
 */
export function countByStatus(pieces: PieceLike[]): Record<ContentStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const piece of pieces) counts[piece.status] += 1;
  return counts;
}

/** «2h 30m», «10h o más». El sufijo cuando se dejó de contar es parte del dato. */
export function formatWorkTime(minutes: number | null, uncapped = false): string {
  if (minutes === null) return "--";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const base = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
  return uncapped ? `${base} o más` : base;
}
