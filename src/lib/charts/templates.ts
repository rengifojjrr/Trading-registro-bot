import { parseStyle, serialiseStyle, type DrawingStyle } from "./style";
import { isToolId, type ToolId } from "./tools";

/**
 * Las plantillas de dibujo: «así quiero yo esta herramienta».
 *
 * Ajustas una línea de tendencia a tu gusto -- grosor 3, discontinua, morada --
 * y a la siguiente empiezas otra vez desde los valores de fábrica. Guardar la
 * configuración como la tuya para esa herramienta hace que la segunda vez ya
 * salga bien.
 *
 * Se guarda **sólo lo que se aparta de fábrica**, igual que el estilo de cada
 * dibujo y por el mismo motivo: si mañana cambia el color por defecto de una
 * herramienta, el cambio alcanza a tu plantilla en todo lo que no tocaste.
 *
 * Puro: convierte entre lo guardado y el estilo. Quién lo guarda -- el
 * navegador, hoy -- es cosa de quien llama.
 */

export const TEMPLATES_KEY = "grafico:plantillas";

/** Lo que hay en el almacenamiento: por herramienta, sólo sus diferencias. */
export type StoredTemplates = Partial<Record<ToolId, Record<string, unknown>>>;

/**
 * Lee las plantillas guardadas sin fiarse.
 *
 * Una herramienta que ya no existe se descarta en silencio: el catálogo cambia
 * y una plantilla huérfana no debe impedir leer las demás.
 */
export function parseTemplates(raw: unknown): StoredTemplates {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const salida: StoredTemplates = {};
  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!isToolId(clave)) continue;
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) continue;
    salida[clave] = valor as Record<string, unknown>;
  }
  return salida;
}

/**
 * El estilo de partida de una herramienta: su plantilla si la hay, y si no los
 * valores de fábrica.
 *
 * Pasa por `parseStyle`, así que una plantilla con un campo corrupto cae al
 * valor de fábrica **de ese campo** y no invalida el resto.
 */
export function styleForTool(tool: ToolId, templates: StoredTemplates): DrawingStyle {
  return parseStyle(tool, templates[tool] ?? null);
}

/** Guarda el estilo actual como la plantilla de esa herramienta. */
export function withTemplate(
  templates: StoredTemplates,
  tool: ToolId,
  style: DrawingStyle,
): StoredTemplates {
  const diferencias = serialiseStyle(tool, style);
  // Un estilo idéntico al de fábrica no es una plantilla: guardar `{}` dejaría
  // una entrada que no hace nada y que confunde al mirarlas.
  if (Object.keys(diferencias).length === 0) return withoutTemplate(templates, tool);
  return { ...templates, [tool]: diferencias };
}

/** Quita la plantilla de una herramienta, que vuelve a los valores de fábrica. */
export function withoutTemplate(templates: StoredTemplates, tool: ToolId): StoredTemplates {
  const copia = { ...templates };
  delete copia[tool];
  return copia;
}

/** Si esa herramienta tiene una plantilla puesta. */
export function hasTemplate(templates: StoredTemplates, tool: ToolId): boolean {
  return templates[tool] !== undefined;
}
