import { z } from "zod";

import { parseStyle, serialiseStyle, type DrawingStyle } from "@/lib/charts/style";
import { TOOL_BY_ID, TOOL_IDS, isToolId, type ToolId } from "@/lib/charts/tools";

/**
 * Lo que viaja entre el navegador, la API y la base de datos.
 *
 * Los puntos se guardan como **lista** y no como `{p1, p2}`: hay herramientas
 * de uno a cinco puntos, y una lista las cubre todas sin inventar nombres como
 * `p3`, `p4`, `p5`. Lo antiguo lo migró la migración, así que aquí sólo se
 * entiende un formato -- un lector que entiende dos es uno que hay que
 * mantener entendiendo dos para siempre.
 */

export const DRAWING_TOOLS = TOOL_IDS;
export type DrawingTool = ToolId;

export { isToolId as isDrawingTool };

export interface DrawingPoint {
  time: number;
  price: number;
}

const pointSchema = z.object({
  time: z.number().int().nonnegative(),
  price: z.number().finite(),
});

/**
 * Los puntos de un dibujo, comprobando que son los que su herramienta pide.
 *
 * Se valida contra el catálogo y no contra un mínimo genérico: una horquilla
 * con dos puntos no se puede dibujar, y aceptarla aquí sería guardar algo que
 * el gráfico no sabe pintar y que nadie descubre hasta abrir la operación.
 */
export function parseDrawingPoints(tool: string, points: unknown): DrawingPoint[] | null {
  if (!isToolId(tool)) return null;

  // El tope lo pone la herramienta más larga que hay (tres impulsos, siete);
  // el `max` sólo evita que alguien mande diez mil puntos por la API.
  const parsed = z.array(pointSchema).min(1).max(12).safeParse(points);
  if (!parsed.success) return null;

  return parsed.data.length === TOOL_BY_ID[tool].points ? parsed.data : null;
}

/** El estilo guardado, saneado y con los valores de fábrica de su herramienta. */
export function parseDrawingStyle(tool: string, style: unknown): DrawingStyle | null {
  if (!isToolId(tool)) return null;
  return parseStyle(tool, style);
}

/** Sólo lo que se aparta de los valores de fábrica, listo para guardar. */
export function serialiseDrawingStyle(tool: ToolId, style: DrawingStyle): Record<string, unknown> {
  return serialiseStyle(tool, style);
}

/**
 * Los niveles de Fibonacci de siempre.
 *
 * Se mantiene exportado porque lo usa código antiguo; el valor de verdad vive
 * ahora en `lib/charts/style.ts`, donde cada herramienta trae los suyos.
 */
export { DEFAULT_FIB_LEVELS as FIB_LEVELS } from "@/lib/charts/style";
