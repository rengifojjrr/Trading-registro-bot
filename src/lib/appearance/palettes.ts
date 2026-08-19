import type { Palette } from "./catalog";

/**
 * Los colores de cada paleta, de día y de noche.
 *
 * Lo que **no** está aquí es tan importante como lo que está: los colores de
 * estado -- correcto, atención, error -- y los siete tonos de módulo viven en
 * `globals.css` y son los mismos en las cinco paletas. No son decoración, son
 * información: un error morado porque quedaba bonito con la paleta elegida
 * está rompiendo el significado, y confundir una pérdida con una ganancia es
 * el único error que esta aplicación no se puede permitir.
 *
 * Cada paleta define los dos juegos completos. Definir sólo el de día y
 * «invertirlo» produce siempre un tema oscuro malo: el texto secundario, que
 * de día se aclara para bajar de jerarquía, de noche tiene que *oscurecerse*
 * -- y al invertir se vuelve el más brillante de la pantalla.
 */

export interface PaletteColors {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  muted: string;
  "muted-foreground": string;
  border: string;
  input: string;
  ring: string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  accent: string;
  "accent-foreground": string;
}

export interface PaletteDefinition {
  /** Las tres tiras de color que se enseñan en el botón del panel. */
  swatch: [string, string, string];
  light: PaletteColors;
  dark: PaletteColors;
}

export const PALETTE_COLORS: Record<Palette, PaletteDefinition> = {
  // La de siempre, extraída tal cual estaba en globals.css para que quien no
  // toque nada vea exactamente lo mismo que antes.
  pizarra: {
    swatch: ["hsl(222 47% 6%)", "hsl(199 89% 48%)", "hsl(210 40% 96%)"],
    dark: {
      background: "hsl(222 47% 6%)",
      foreground: "hsl(210 40% 96%)",
      card: "hsl(222 44% 9%)",
      "card-foreground": "hsl(210 40% 96%)",
      popover: "hsl(222 44% 10%)",
      "popover-foreground": "hsl(210 40% 96%)",
      muted: "hsl(217 33% 14%)",
      "muted-foreground": "hsl(215 20% 65%)",
      border: "hsl(217 28% 18%)",
      input: "hsl(217 28% 18%)",
      ring: "hsl(199 89% 48%)",
      primary: "hsl(199 89% 48%)",
      "primary-foreground": "hsl(222 47% 6%)",
      secondary: "hsl(217 33% 16%)",
      "secondary-foreground": "hsl(210 40% 96%)",
      accent: "hsl(217 33% 18%)",
      "accent-foreground": "hsl(210 40% 96%)",
    },
    light: {
      background: "hsl(210 40% 98%)",
      foreground: "hsl(222 47% 11%)",
      card: "hsl(0 0% 100%)",
      "card-foreground": "hsl(222 47% 11%)",
      popover: "hsl(0 0% 100%)",
      "popover-foreground": "hsl(222 47% 11%)",
      muted: "hsl(210 40% 94%)",
      "muted-foreground": "hsl(215 16% 42%)",
      border: "hsl(214 32% 88%)",
      input: "hsl(214 32% 88%)",
      ring: "hsl(199 89% 40%)",
      primary: "hsl(199 89% 40%)",
      "primary-foreground": "hsl(0 0% 100%)",
      secondary: "hsl(210 40% 94%)",
      "secondary-foreground": "hsl(222 47% 11%)",
      accent: "hsl(210 40% 92%)",
      "accent-foreground": "hsl(222 47% 11%)",
    },
  },

  // Grises sin tono. Para mirar gráficas sin que el fondo tire de ningún lado.
  carbon: {
    swatch: ["hsl(0 0% 8%)", "hsl(0 0% 72%)", "hsl(0 0% 96%)"],
    dark: {
      background: "hsl(0 0% 7%)",
      foreground: "hsl(0 0% 95%)",
      card: "hsl(0 0% 11%)",
      "card-foreground": "hsl(0 0% 95%)",
      popover: "hsl(0 0% 12%)",
      "popover-foreground": "hsl(0 0% 95%)",
      muted: "hsl(0 0% 16%)",
      "muted-foreground": "hsl(0 0% 64%)",
      border: "hsl(0 0% 21%)",
      input: "hsl(0 0% 21%)",
      ring: "hsl(0 0% 72%)",
      primary: "hsl(0 0% 88%)",
      "primary-foreground": "hsl(0 0% 8%)",
      secondary: "hsl(0 0% 18%)",
      "secondary-foreground": "hsl(0 0% 95%)",
      accent: "hsl(0 0% 20%)",
      "accent-foreground": "hsl(0 0% 95%)",
    },
    light: {
      background: "hsl(0 0% 97%)",
      foreground: "hsl(0 0% 10%)",
      card: "hsl(0 0% 100%)",
      "card-foreground": "hsl(0 0% 10%)",
      popover: "hsl(0 0% 100%)",
      "popover-foreground": "hsl(0 0% 10%)",
      muted: "hsl(0 0% 93%)",
      "muted-foreground": "hsl(0 0% 38%)",
      border: "hsl(0 0% 86%)",
      input: "hsl(0 0% 86%)",
      ring: "hsl(0 0% 30%)",
      primary: "hsl(0 0% 16%)",
      "primary-foreground": "hsl(0 0% 100%)",
      secondary: "hsl(0 0% 93%)",
      "secondary-foreground": "hsl(0 0% 10%)",
      accent: "hsl(0 0% 90%)",
      "accent-foreground": "hsl(0 0% 10%)",
    },
  },

  // Papel cálido. La de leer los sueños y los guiones, no la de mirar velas.
  pergamino: {
    swatch: ["hsl(38 26% 92%)", "hsl(24 54% 38%)", "hsl(28 20% 16%)"],
    dark: {
      background: "hsl(28 14% 9%)",
      foreground: "hsl(38 24% 92%)",
      card: "hsl(28 13% 13%)",
      "card-foreground": "hsl(38 24% 92%)",
      popover: "hsl(28 13% 14%)",
      "popover-foreground": "hsl(38 24% 92%)",
      muted: "hsl(28 12% 18%)",
      "muted-foreground": "hsl(36 14% 64%)",
      border: "hsl(28 12% 23%)",
      input: "hsl(28 12% 23%)",
      ring: "hsl(24 62% 56%)",
      primary: "hsl(24 62% 56%)",
      "primary-foreground": "hsl(28 20% 10%)",
      secondary: "hsl(28 12% 20%)",
      "secondary-foreground": "hsl(38 24% 92%)",
      accent: "hsl(28 12% 22%)",
      "accent-foreground": "hsl(38 24% 92%)",
    },
    light: {
      background: "hsl(38 32% 95%)",
      foreground: "hsl(28 26% 15%)",
      card: "hsl(40 40% 98%)",
      "card-foreground": "hsl(28 26% 15%)",
      popover: "hsl(40 40% 98%)",
      "popover-foreground": "hsl(28 26% 15%)",
      muted: "hsl(38 26% 90%)",
      "muted-foreground": "hsl(28 14% 40%)",
      border: "hsl(36 22% 82%)",
      input: "hsl(36 22% 82%)",
      ring: "hsl(24 54% 38%)",
      primary: "hsl(24 54% 38%)",
      "primary-foreground": "hsl(40 40% 98%)",
      secondary: "hsl(38 26% 90%)",
      "secondary-foreground": "hsl(28 26% 15%)",
      accent: "hsl(38 26% 87%)",
      "accent-foreground": "hsl(28 26% 15%)",
    },
  },

  // Más contraste que pizarra, con el violeta como color de acción.
  indigo: {
    swatch: ["hsl(250 40% 8%)", "hsl(255 82% 68%)", "hsl(250 30% 95%)"],
    dark: {
      background: "hsl(250 40% 7%)",
      foreground: "hsl(250 30% 96%)",
      card: "hsl(250 36% 11%)",
      "card-foreground": "hsl(250 30% 96%)",
      popover: "hsl(250 36% 12%)",
      "popover-foreground": "hsl(250 30% 96%)",
      muted: "hsl(250 28% 17%)",
      "muted-foreground": "hsl(250 18% 68%)",
      border: "hsl(250 26% 22%)",
      input: "hsl(250 26% 22%)",
      ring: "hsl(255 82% 68%)",
      primary: "hsl(255 82% 68%)",
      "primary-foreground": "hsl(250 40% 8%)",
      secondary: "hsl(250 28% 19%)",
      "secondary-foreground": "hsl(250 30% 96%)",
      accent: "hsl(250 28% 21%)",
      "accent-foreground": "hsl(250 30% 96%)",
    },
    light: {
      background: "hsl(250 40% 98%)",
      foreground: "hsl(250 40% 12%)",
      card: "hsl(0 0% 100%)",
      "card-foreground": "hsl(250 40% 12%)",
      popover: "hsl(0 0% 100%)",
      "popover-foreground": "hsl(250 40% 12%)",
      muted: "hsl(250 32% 94%)",
      "muted-foreground": "hsl(250 16% 42%)",
      border: "hsl(250 28% 88%)",
      input: "hsl(250 28% 88%)",
      ring: "hsl(255 62% 48%)",
      primary: "hsl(255 62% 48%)",
      "primary-foreground": "hsl(0 0% 100%)",
      secondary: "hsl(250 32% 94%)",
      "secondary-foreground": "hsl(250 40% 12%)",
      accent: "hsl(250 32% 91%)",
      "accent-foreground": "hsl(250 40% 12%)",
    },
  },

  // Verdes apagados. El verde de «correcto» sigue siendo el de siempre: aquí
  // el verde es fondo, no señal.
  bosque: {
    swatch: ["hsl(160 22% 8%)", "hsl(160 46% 46%)", "hsl(150 20% 94%)"],
    dark: {
      background: "hsl(160 22% 7%)",
      foreground: "hsl(150 20% 94%)",
      card: "hsl(160 20% 11%)",
      "card-foreground": "hsl(150 20% 94%)",
      popover: "hsl(160 20% 12%)",
      "popover-foreground": "hsl(150 20% 94%)",
      muted: "hsl(160 16% 16%)",
      "muted-foreground": "hsl(150 12% 64%)",
      border: "hsl(160 16% 21%)",
      input: "hsl(160 16% 21%)",
      ring: "hsl(160 46% 46%)",
      primary: "hsl(160 46% 52%)",
      "primary-foreground": "hsl(160 30% 8%)",
      secondary: "hsl(160 16% 18%)",
      "secondary-foreground": "hsl(150 20% 94%)",
      accent: "hsl(160 16% 20%)",
      "accent-foreground": "hsl(150 20% 94%)",
    },
    light: {
      background: "hsl(150 26% 97%)",
      foreground: "hsl(160 30% 12%)",
      card: "hsl(0 0% 100%)",
      "card-foreground": "hsl(160 30% 12%)",
      popover: "hsl(0 0% 100%)",
      "popover-foreground": "hsl(160 30% 12%)",
      muted: "hsl(150 22% 93%)",
      "muted-foreground": "hsl(160 12% 38%)",
      border: "hsl(152 18% 85%)",
      input: "hsl(152 18% 85%)",
      ring: "hsl(160 48% 30%)",
      primary: "hsl(160 48% 30%)",
      "primary-foreground": "hsl(0 0% 100%)",
      secondary: "hsl(150 22% 93%)",
      "secondary-foreground": "hsl(160 30% 12%)",
      accent: "hsl(150 22% 90%)",
      "accent-foreground": "hsl(160 30% 12%)",
    },
  },
};
