/**
 * Contenido, en su forma pura.
 *
 * El único módulo sin plantilla previa. Hoy en Notion sólo existe la casilla
 * «Trabajar en las redes» dentro de Hábitos, que registra si trabajaste --
 * no qué publicaste. Esto es lo segundo, y por eso el eje del módulo es el
 * estado de cada pieza, no el tiempo dedicado.
 */

export const STATUSES = ["IDEA", "GRABADO", "EDITADO", "PROGRAMADO", "PUBLICADO"] as const;
export type ContentStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<ContentStatus, string> = {
  IDEA: "Idea",
  GRABADO: "Grabado",
  EDITADO: "Editado",
  PROGRAMADO: "Programado",
  PUBLICADO: "Publicado",
};

/** El orden real del proceso: sirve para ordenar columnas y para saber cuál es el siguiente paso. */
export const STATUS_ORDER: ContentStatus[] = ["IDEA", "GRABADO", "EDITADO", "PROGRAMADO", "PUBLICADO"];

export const PLATFORMS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn"] as const;

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
  /** Programado para una fecha ya pasada y todavía sin publicar. */
  late: number;
}

export function countPieces(pieces: PieceLike[], today: string): ContentCounts {
  const open = pieces.filter((p) => p.status !== "PUBLICADO");
  return {
    inProgress: open.length,
    published: pieces.filter((p) => p.status === "PUBLICADO").length,
    late: open.filter((p) => p.plannedDate !== null && p.plannedDate < today).length,
  };
}

/**
 * Cuántas piezas hay en cada estado.
 *
 * Devuelve siempre las cinco claves, incluso a cero: una columna vacía es
 * información -- «no tengo nada grabado» es justo lo que hay que ver.
 */
export function countByStatus(pieces: PieceLike[]): Record<ContentStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const piece of pieces) counts[piece.status] += 1;
  return counts;
}
