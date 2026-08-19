/**
 * Los cinco ejes de apariencia.
 *
 * Independientes a propósito: cualquiera de las 3 × 3 × 5 × 3 × 3 = 405
 * combinaciones tiene que verse bien. Un único interruptor de «modo oscuro»
 * mezcla decisiones que no tienen nada que ver -- el contraste, la forma de
 * las tarjetas y cuánto cabe en pantalla -- y obliga a elegir el paquete
 * entero de otro.
 *
 * Este archivo es el catálogo y nada más: no toca el DOM, no lee cookies y no
 * conoce React. Todo lo que valida una preferencia guardada sale de aquí, así
 * que quitar una paleta no puede dejar a nadie con la página sin colores.
 */

export const PALETTES = ["pizarra", "carbon", "pergamino", "indigo", "bosque"] as const;
export type Palette = (typeof PALETTES)[number];

export const THEMES = ["auto", "claro", "oscuro"] as const;
export type Theme = (typeof THEMES)[number];

export const SURFACES = ["plano", "vidrio", "marco", "bisel", "halo"] as const;
export type Surface = (typeof SURFACES)[number];

export const CORNERS = ["rectas", "suaves", "redondas"] as const;
export type Corners = (typeof CORNERS)[number];

export const DENSITIES = ["compacta", "normal", "amplia"] as const;
export type Density = (typeof DENSITIES)[number];

export interface Appearance {
  palette: Palette;
  theme: Theme;
  surface: Surface;
  corners: Corners;
  density: Density;
}

/**
 * Lo que sale de fábrica.
 *
 * El tema arranca en `auto` y no en «oscuro»: si alguien ya le dijo a su
 * sistema operativo cómo quiere ver las cosas, no hay motivo para llevarle la
 * contraria la primera vez que abre esto.
 */
export const DEFAULT_APPEARANCE: Appearance = {
  palette: "pizarra",
  theme: "auto",
  surface: "plano",
  corners: "suaves",
  density: "normal",
};

/** Lo que se enseña en el panel: el nombre y a qué suena. */
export interface Option<T> {
  value: T;
  label: string;
  hint: string;
  /**
   * Lo que cuesta dibujarlo.
   *
   * Sólo lo llevan los estilos de superficie. Difuminar el fondo obliga al
   * navegador a recomponer lo que hay detrás de cada tarjeta, y con una tabla
   * de cientos de filas en un equipo modesto se nota al desplazar. Quien
   * elige tiene derecho a saberlo antes, no a descubrirlo.
   */
  cost?: "ligero" | "pesado";
}

export const PALETTE_OPTIONS: Option<Palette>[] = [
  { value: "pizarra", label: "Pizarra", hint: "Azul frío sobre gris. La de casa." },
  { value: "carbon", label: "Carbón", hint: "Grises puros, sin tono. Para no distraerse." },
  { value: "pergamino", label: "Pergamino", hint: "Papel cálido y tinta marrón." },
  { value: "indigo", label: "Índigo", hint: "Violeta profundo, más contraste." },
  { value: "bosque", label: "Bosque", hint: "Verdes apagados y madera." },
];

export const THEME_OPTIONS: Option<Theme>[] = [
  { value: "auto", label: "Automático", hint: "Lo que diga tu sistema." },
  { value: "claro", label: "Claro", hint: "Siempre claro, aunque el sistema pida oscuro." },
  { value: "oscuro", label: "Oscuro", hint: "Siempre oscuro, aunque el sistema pida claro." },
];

export const SURFACE_OPTIONS: Option<Surface>[] = [
  { value: "plano", label: "Plano", hint: "Sin adornos. Lo más rápido de leer.", cost: "ligero" },
  { value: "vidrio", label: "Vidrio", hint: "Difumina lo que hay detrás.", cost: "pesado" },
  { value: "marco", label: "Marco", hint: "Borde marcado, sin relleno.", cost: "ligero" },
  { value: "bisel", label: "Bisel", hint: "Un filo de luz arriba, como en relieve.", cost: "ligero" },
  { value: "halo", label: "Halo", hint: "Sombra difusa alrededor.", cost: "pesado" },
];

export const CORNER_OPTIONS: Option<Corners>[] = [
  { value: "rectas", label: "Rectas", hint: "Esquinas casi vivas. Más severo." },
  { value: "suaves", label: "Suaves", hint: "El redondeo de siempre." },
  { value: "redondas", label: "Redondas", hint: "Bien redondeadas. Más amable." },
];

export const DENSITY_OPTIONS: Option<Density>[] = [
  { value: "compacta", label: "Compacta", hint: "Menos aire entre bloques. Cabe más." },
  { value: "normal", label: "Normal", hint: "El espaciado de siempre." },
  { value: "amplia", label: "Amplia", hint: "Más aire. Se lee más descansado." },
];

/**
 * Devuelve el valor si está en el catálogo, y el de fábrica si no.
 *
 * Es lo que hace que quitar una paleta no rompa a quien la tuviera elegida:
 * su preferencia deja de existir y cae al valor por defecto en lugar de
 * quedarse con un atributo que ninguna regla de CSS reconoce.
 */
function pick<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== null && value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parsePalette(value?: string | null): Palette {
  return pick(value, PALETTES, DEFAULT_APPEARANCE.palette);
}

export function parseTheme(value?: string | null): Theme {
  return pick(value, THEMES, DEFAULT_APPEARANCE.theme);
}

export function parseSurface(value?: string | null): Surface {
  return pick(value, SURFACES, DEFAULT_APPEARANCE.surface);
}

export function parseCorners(value?: string | null): Corners {
  return pick(value, CORNERS, DEFAULT_APPEARANCE.corners);
}

export function parseDensity(value?: string | null): Density {
  return pick(value, DENSITIES, DEFAULT_APPEARANCE.density);
}

/** Los cinco ejes de una tacada, cada uno validado por su cuenta. */
export function parseAppearance(raw: Partial<Record<keyof Appearance, string | null | undefined>>): Appearance {
  return {
    palette: parsePalette(raw.palette),
    theme: parseTheme(raw.theme),
    surface: parseSurface(raw.surface),
    corners: parseCorners(raw.corners),
    density: parseDensity(raw.density),
  };
}

/**
 * Los atributos que van en `<html>`.
 *
 * El tema en `auto` **no deja atributo**, y eso no es un descuido: es lo que
 * permite que `prefers-color-scheme` decida. Un `data-theme="auto"` obligaría
 * a escribir reglas para un tercer valor que el CSS no sabe resolver.
 */
export function appearanceAttributes(appearance: Appearance): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-paleta": appearance.palette,
    "data-superficie": appearance.surface,
    "data-esquinas": appearance.corners,
    "data-densidad": appearance.density,
  };

  if (appearance.theme === "claro") attributes["data-theme"] = "light";
  if (appearance.theme === "oscuro") attributes["data-theme"] = "dark";

  return attributes;
}
