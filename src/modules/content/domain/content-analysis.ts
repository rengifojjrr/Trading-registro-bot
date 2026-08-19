import { DateTime } from "luxon";

import { CHANNELS, PLATFORMS, STATUS_ORDER, type ContentStatus } from "./content";

/**
 * Lo que se puede preguntar a un calendario de contenido.
 *
 * Las cinco vistas de Notion son cinco filtros sobre la misma tabla: en
 * progreso, ideas, un tablero, el del editor y un calendario. Ninguna suma
 * nada, porque una tabla de Notion no puede decirte cuántas horas de edición
 * llevas ni dónde se te atasca todo -- y eso, con los tiempos ya guardados
 * como números, aquí sale solo.
 */

export interface AnalysablePiece {
  status: ContentStatus;
  plannedDate: string | null;
  publishedAt: string | null;
  channels: string[];
  platforms: string[];
  recordMinutes: number | null;
  editMinutes: number | null;
  editTimeUncapped: boolean;
  editStyles: string[];
  contentType: string | null;
}

export interface Point {
  label: string;
  value: number;
}

/**
 * Cuántas piezas hay en cada estado, en el orden del proceso.
 *
 * En el orden del proceso y no de mayor a menor: aquí la posición significa
 * algo -- es el embudo -- y reordenarlo por tamaño lo destruiría. Un montón
 * en «Falta editar» y nada en «Falta grabar» dice dónde está el tapón.
 */
export function funnel(pieces: AnalysablePiece[], labels: Record<ContentStatus, string>): Point[] {
  return STATUS_ORDER.map((status) => ({
    label: labels[status],
    value: pieces.filter((p) => p.status === status).length,
  }));
}

/** Cuánto publicas por canal. */
export function byChannel(pieces: AnalysablePiece[]): Point[] {
  return countAcross(pieces, (p) => p.channels, CHANNELS);
}

/** Cuánto publicas por plataforma. */
export function byPlatform(pieces: AnalysablePiece[]): Point[] {
  return countAcross(pieces, (p) => p.platforms, PLATFORMS);
}

/**
 * Cuenta piezas por etiqueta manteniendo un orden fijo.
 *
 * El orden lo fija la lista de opciones y no el recuento, para que la gráfica
 * no se reordene sola cada vez que se publica algo -- comparar dos semanas
 * exige que las barras estén en el mismo sitio. Las etiquetas a cero se
 * quedan fuera: un canal que no usas nunca no es un hueco, es que no existe
 * para ti.
 */
function countAcross(
  pieces: AnalysablePiece[],
  pick: (piece: AnalysablePiece) => string[],
  order: readonly string[],
): Point[] {
  const counts = new Map<string, number>();
  for (const piece of pieces) {
    for (const label of new Set(pick(piece))) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const known = order.filter((label) => (counts.get(label) ?? 0) > 0);
  const unknown = [...counts.keys()].filter((label) => !order.includes(label)).sort();

  return [...known, ...unknown].map((label) => ({ label, value: counts.get(label)! }));
}

/**
 * Horas de edición por estilo, para saber qué formato sale caro.
 *
 * Una pieza con dos estilos suma sus minutos a los dos: la pregunta es cuánto
 * cuesta cada estilo, no cómo repartir un presupuesto. Los tiempos «dejé de
 * contar» entran con su suelo, así que el resultado se queda corto antes que
 * pasarse.
 */
export function minutesByEditStyle(pieces: AnalysablePiece[]): Point[] {
  const totals = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.editMinutes === null) continue;
    for (const style of new Set(piece.editStyles)) {
      totals.set(style, (totals.get(style) ?? 0) + piece.editMinutes);
    }
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value: Math.round((value / 60) * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
}

export interface WorkTotals {
  recordMinutes: number;
  editMinutes: number;
  /** Alguna pieza traía un tiempo sin tope, así que el total es un mínimo. */
  isFloor: boolean;
  measured: number;
}

/** Cuánto trabajo hay detrás de lo publicado. */
export function workTotals(pieces: AnalysablePiece[]): WorkTotals {
  const measured = pieces.filter((p) => p.recordMinutes !== null || p.editMinutes !== null);

  return {
    recordMinutes: measured.reduce((sum, p) => sum + (p.recordMinutes ?? 0), 0),
    editMinutes: measured.reduce((sum, p) => sum + (p.editMinutes ?? 0), 0),
    isFloor: measured.some((p) => p.editTimeUncapped),
    measured: measured.length,
  };
}

/**
 * Cuántas piezas publicaste cada mes.
 *
 * Por mes y no por día porque publicar no es diario: una serie diaria de
 * contenido son treinta ceros y dos barras, y de ahí no se lee una tendencia.
 */
export function publishedByMonth(
  pieces: AnalysablePiece[],
  timezone: string,
  months = 12,
): Point[] {
  const counts = new Map<string, number>();
  for (const piece of pieces) {
    if (!piece.publishedAt) continue;
    const dt = DateTime.fromISO(piece.publishedAt).setZone(timezone);
    if (!dt.isValid) continue;
    const key = dt.toFormat("yyyy-MM");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return [];

  // Desde el mes más antiguo con algo, sin dejar huecos por el camino.
  const first = DateTime.fromISO(`${[...counts.keys()].sort()[0]}-01`);
  const last = DateTime.now().setZone(timezone).startOf("month");
  const start = DateTime.max(first, last.minus({ months: months - 1 }));

  const points: Point[] = [];
  for (let cursor = start; cursor <= last; cursor = cursor.plus({ months: 1 })) {
    points.push({
      label: cursor.setLocale("es").toFormat("LLL yy"),
      value: counts.get(cursor.toFormat("yyyy-MM")) ?? 0,
    });
  }
  return points;
}

/**
 * Lo que lleva más tiempo sin moverse de estado.
 *
 * Se mide desde la fecha planificada porque es la única fecha que una pieza
 * atascada tiene: si estaba prevista para hace tres semanas y sigue en «Falta
 * editar», eso es el retraso, y ningún otro campo lo dice.
 */
export function overdue(
  pieces: (AnalysablePiece & { title: string })[],
  today: string,
  limit = 8,
): { title: string; status: ContentStatus; days: number }[] {
  return pieces
    .filter((p) => p.status !== "PUBLICADO" && p.plannedDate !== null && p.plannedDate < today)
    .map((p) => ({
      title: p.title,
      status: p.status,
      days: Math.floor(DateTime.fromISO(today).diff(DateTime.fromISO(p.plannedDate!), "days").days),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}
