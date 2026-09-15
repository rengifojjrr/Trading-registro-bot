import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import {
  isDrawingTool,
  parseDrawingPoints,
  parseDrawingStyle,
  serialiseDrawingStyle,
} from "./index";

/**
 * Guardar, mover y borrar lo que se dibuja encima de un gráfico.
 *
 * Los dibujos colgaban de una operación y de nada más (`trade_id not null`), y
 * eso era lo único que impedía que el gráfico de una publicación macro tuviera
 * las mismas herramientas: no había dónde guardar la línea. El resultado eran
 * dos gráficos en la misma aplicación, uno con herramientas y otro sin ellas,
 * y el segundo se siente roto precisamente porque el primero existe.
 *
 * Así que lo que antes vivía repartido en tres rutas de API vive aquí una sola
 * vez, con el dueño como parámetro. Las rutas quedan en lo que deben ser: leer
 * la petición, llamar, devolver. Duplicarlas para las noticias habría sido
 * duplicar también la validación de los puntos y el saneado del estilo, que es
 * exactamente el código en el que una copia se queda atrás sin que se note.
 */

export type DuenoDelDibujo =
  | { tipo: "operacion"; id: string }
  | { tipo: "evento"; id: string };

export interface ResultadoDibujo {
  error: string | null;
  /** El del dibujo recién creado. Null en todo lo demás. */
  id: string | null;
  /** Para que la ruta elija el código HTTP sin volver a interpretar el mensaje. */
  estado: number;
}

const ok = (id: string | null = null): ResultadoDibujo => ({ error: null, id, estado: 200 });
const fallo = (error: string, estado: number): ResultadoDibujo => ({ error, id: null, estado });

/** La columna que ata el dibujo a su dueño. Una y sólo una, como en la tabla. */
function columnaDueno(dueno: DuenoDelDibujo): { trade_id: string } | { event_id: string } {
  return dueno.tipo === "operacion" ? { trade_id: dueno.id } : { event_id: dueno.id };
}

/**
 * Que el dueño exista y sea tuyo.
 *
 * Una operación es tuya o no existe para ti. Una publicación macro es de
 * todos -- la tabla del calendario es de referencia y sólo se lee --, así que
 * basta con que exista: lo que se comprueba es que no se está guardando un
 * dibujo contra un identificador inventado, que dejaría filas huérfanas que
 * nadie volvería a ver.
 */
async function duenoValido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dueno: DuenoDelDibujo,
  userId: string,
): Promise<boolean> {
  if (dueno.tipo === "operacion") {
    const { data } = await supabase
      .from("trades")
      .select("id")
      .eq("id", dueno.id)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }

  const { data } = await supabase
    .from("economic_events")
    .select("id")
    .eq("id", dueno.id)
    .maybeSingle();
  return Boolean(data);
}

interface CuerpoDibujo {
  tool?: unknown;
  points?: unknown;
  style?: unknown;
}

export async function crearDibujo(
  dueno: DuenoDelDibujo,
  cuerpo: CuerpoDibujo,
): Promise<ResultadoDibujo> {
  const user = await requireUser();

  const { tool, points, style } = cuerpo;
  if (typeof tool !== "string" || !isDrawingTool(tool)) return fallo("Herramienta desconocida.", 400);

  const parsedPoints = parseDrawingPoints(tool, points);
  if (!parsedPoints) return fallo("Coordenadas inválidas.", 400);

  const supabase = await createClient();
  if (!(await duenoValido(supabase, dueno, user.id))) {
    return fallo(dueno.tipo === "operacion" ? "Operación no encontrada." : "Dato no encontrado.", 404);
  }

  // El estilo se sanea antes de guardarse y se guarda ya reducido a lo que se
  // aparta de fábrica: así lo que entra en la tabla es exactamente lo que el
  // lector espera encontrar, sin pasar por un formato intermedio.
  const parsedStyle = parseDrawingStyle(tool, style);
  const styleToStore = parsedStyle ? serialiseDrawingStyle(tool, parsedStyle) : {};

  const { data, error } = await supabase
    .from("chart_drawings")
    .insert({
      user_id: user.id,
      ...columnaDueno(dueno),
      tool,
      // `DrawingPoint[]` es estructuralmente un `Json[]`, pero TypeScript no lo
      // acepta sin firma de índice. El casteo está aquí, en una línea y con el
      // motivo escrito, en vez de aflojar el tipo de `Json`.
      points: parsedPoints as unknown as Json,
      style: styleToStore as Json,
    })
    .select("id")
    .single();

  if (error || !data) return fallo("No se pudo guardar el dibujo.", 500);
  return ok(data.id);
}

/**
 * Mueve un dibujo que ya existe.
 *
 * Sólo cambian los puntos: la herramienta y el color quedan fijos al crearlo,
 * así que arrastrar una forma nunca puede convertirla en otra. `tool` viaja de
 * todas formas para poder validar los puntos contra el esquema que toca.
 */
export async function moverDibujo(
  dueno: DuenoDelDibujo,
  drawingId: string,
  cuerpo: CuerpoDibujo,
): Promise<ResultadoDibujo> {
  const user = await requireUser();

  const { tool, points, style } = cuerpo;
  if (typeof tool !== "string" || !isDrawingTool(tool)) return fallo("Herramienta desconocida.", 400);

  const parsedPoints = parseDrawingPoints(tool, points);
  if (!parsedPoints) return fallo("Coordenadas inválidas.", 400);

  // El estilo es opcional al mover: arrastrar un dibujo cambia sus puntos y no
  // sus ajustes, y mandarlos en cada arrastre sería reescribirlos por nada.
  const parsedStyle = style === undefined ? null : parseDrawingStyle(tool, style);

  const supabase = await createClient();
  const columna = columnaDueno(dueno);
  const { error } = await supabase
    .from("chart_drawings")
    .update({
      points: parsedPoints as unknown as Json,
      ...(parsedStyle ? { style: serialiseDrawingStyle(tool, parsedStyle) as Json } : {}),
    })
    .eq("id", drawingId)
    .eq("user_id", user.id)
    .eq("tool", tool)
    .match(columna);

  if (error) return fallo("No se pudo mover el dibujo.", 500);
  return ok();
}

export async function borrarDibujo(
  dueno: DuenoDelDibujo,
  drawingId: string,
): Promise<ResultadoDibujo> {
  const user = await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("chart_drawings")
    .delete()
    .eq("id", drawingId)
    .eq("user_id", user.id)
    .match(columnaDueno(dueno));

  if (error) return fallo("No se pudo eliminar el dibujo.", 500);
  return ok();
}
