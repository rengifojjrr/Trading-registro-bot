import type { ProjectColor } from "@/types/database";

/**
 * Los diez colores de Notion.
 *
 * Se guardan por nombre y no como hexadecimal porque el nombre es lo que
 * viene de Notion: importar un color pasa a ser copiarlo y no traducirlo, y
 * dos importaciones seguidas no pueden acabar con dos tonos distintos del
 * mismo verde.
 *
 * Los valores son HSL con la luminosidad partida en dos: el mismo tono se ve
 * distinto sobre papel y sobre fondo oscuro, y un único hexadecimal obligaría
 * a elegir cuál de los dos fondos queda mal.
 */

export const PROJECT_COLORS: ProjectColor[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

export const COLOR_LABELS: Record<ProjectColor, string> = {
  default: "Sin color",
  gray: "Gris",
  brown: "Marrón",
  orange: "Naranja",
  yellow: "Amarillo",
  green: "Verde",
  blue: "Azul",
  purple: "Morado",
  pink: "Rosa",
  red: "Rojo",
};

/** Tono y saturación por color; la luminosidad la pone el tema. */
const HUES: Record<ProjectColor, { h: number; s: number }> = {
  default: { h: 240, s: 5 },
  gray: { h: 220, s: 8 },
  brown: { h: 24, s: 34 },
  orange: { h: 28, s: 82 },
  yellow: { h: 45, s: 78 },
  green: { h: 152, s: 52 },
  blue: { h: 208, s: 72 },
  purple: { h: 272, s: 56 },
  pink: { h: 338, s: 66 },
  red: { h: 4, s: 68 },
};

/**
 * El color como cadena CSS, listo para un `style`.
 *
 * `dark` mueve sólo la luminosidad: sobre fondo oscuro hace falta subirla para
 * que el marrón no se confunda con el borde.
 */
export function colorCss(color: ProjectColor | null | undefined, dark = false): string {
  const { h, s } = HUES[color ?? "default"];
  return `hsl(${h} ${s}% ${dark ? 68 : 42}%)`;
}

/**
 * El color de una etiqueta, que necesita las dos variantes a la vez porque
 * la hoja de estilos no sabe en qué tema se va a pintar. Se devuelven como
 * variables para que el CSS elija.
 */
export function colorVars(color: ProjectColor | null | undefined): Record<string, string> {
  return {
    "--tag-color": colorCss(color, false),
    "--tag-color-dark": colorCss(color, true),
  };
}

/**
 * A qué color asignar un nombre que aún no lo tiene.
 *
 * Determinista a partir del nombre: el mismo proyecto sale siempre del mismo
 * color, en este navegador y en el siguiente, sin guardar nada. Se salta
 * `default` porque un color asignado que resulta ser gris no se distingue de
 * no haber asignado ninguno.
 */
export function colorForName(name: string): ProjectColor {
  const palette = PROJECT_COLORS.filter((c) => c !== "default");
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 100000;
  return palette[hash % palette.length];
}
