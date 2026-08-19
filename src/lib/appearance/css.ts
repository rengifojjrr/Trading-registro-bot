import { PALETTES, type Palette } from "./catalog";
import { PALETTE_COLORS, type PaletteColors } from "./palettes";

/**
 * La hoja de estilo de las paletas, generada.
 *
 * Aquí está la decisión que hace que todo lo demás funcione: **la paleta no
 * se aplica escribiendo variables en el elemento**. Un
 * `documentElement.style.setProperty("--background", …)` es un estilo en
 * línea, y un estilo en línea le gana a *todas* las reglas de la hoja --
 * incluidas las de `prefers-color-scheme`. El resultado es la avería clásica:
 * eliges una paleta, y a partir de ese momento la aplicación se queda en
 * claro de noche para siempre, porque la regla del sistema operativo ya no
 * puede alcanzar el token. En su lugar se genera CSS de verdad, con la misma
 * estructura de tres estados, y la elección viaja en un atributo.
 *
 * Se emiten **todas** las paletas, no sólo la elegida. Cuesta poco (unas
 * cinco docenas de declaraciones por paleta, que comprimen a casi nada
 * porque se repiten) y a cambio cambiar de paleta es cambiar una letra en un
 * atributo: sin recargar, sin pedir nada al servidor y sin un instante con
 * los colores viejos. Eso es lo que permite que el panel no tenga botón de
 * «Guardar».
 */

/**
 * Los selectores llevan `:root` dos veces a propósito.
 *
 * No cambia a qué elemento apuntan -- `<html>` sigue siendo `<html>` -- sólo
 * sube la especificidad. Hace falta porque estas reglas y las de
 * `globals.css` compiten por los mismos tokens, y el orden de las hojas de
 * estilo en Next.js depende del orden de los `import` y **no está garantizado
 * que sea el mismo en desarrollo que en el build**
 * (`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, línea
 * 458). Empatar en especificidad y confiar en el orden significaría que la
 * paleta se aplica al desarrollar y se cae al desplegar, o al revés. Con el
 * `:root` repetido gana siempre la paleta, se ordenen como se ordenen.
 */
function scope(palette: Palette): string {
  return `:root:root[data-paleta="${palette}"]`;
}

function declarations(colors: PaletteColors): string {
  return Object.entries(colors)
    .map(([token, value]) => `--${token}:${value}`)
    .join(";");
}

/**
 * Los tres estados de una paleta.
 *
 * 1. Sin condiciones: los valores de día. Es la definición que siempre
 *    existe, y por eso ningún color depende de que se cumpla un `@media`.
 * 2. El sistema pide oscuro **y** nadie eligió claro a mano.
 * 3. Alguien eligió oscuro a mano, y entonces gana sobre el sistema.
 *
 * El segundo y el tercero llevan los mismos valores, así que empatar en
 * especificidad entre ellos da igual. Lo que no puede empatar es cualquiera
 * de los dos contra el primero, y no lo hace: los dos llevan un selector de
 * más.
 */
export function paletteRules(palette: Palette): string {
  const definition = PALETTE_COLORS[palette];
  const day = declarations(definition.light);
  const night = declarations(definition.dark);
  const root = scope(palette);

  return [
    `${root}{${day}}`,
    `@media (prefers-color-scheme:dark){${root}:not([data-theme="light"]){${night}}}`,
    `${root}[data-theme="dark"]{${night}}`,
  ].join("");
}

/**
 * Las tiras de color del botón de cada paleta.
 *
 * También en CSS, y no como `style` en línea en el componente, para que no
 * quede ni un color escrito a mano fuera de los archivos de tokens: el panel
 * pone un atributo y estas reglas ponen los colores.
 *
 * Estas sí son iguales de día y de noche a propósito. La tira identifica la
 * paleta, como la etiqueta de un bote de pintura, y una etiqueta que cambia
 * de color según la hora no identifica nada.
 */
export function swatchRules(palette: Palette): string {
  const [uno, dos, tres] = PALETTE_COLORS[palette].swatch;
  return `[data-muestra-paleta="${palette}"]{--muestra-1:${uno};--muestra-2:${dos};--muestra-3:${tres}}`;
}

/**
 * El día y la noche de la paleta puesta, disponibles a la vez.
 *
 * Los botones de claro y oscuro enseñan un trozo de lo que va a pasar, y
 * para eso hacen falta los dos juegos al mismo tiempo -- cosa que los tokens
 * normales no pueden dar, porque en cada momento sólo uno de los dos está
 * aplicado. Estos cuatro no se usan para pintar la aplicación: son el
 * catálogo enseñándose a sí mismo.
 */
export function previewRules(palette: Palette): string {
  const { light, dark } = PALETTE_COLORS[palette];
  return (
    `${scope(palette)}{` +
    `--dia-fondo:${light.background};--dia-tinta:${light.foreground};` +
    `--noche-fondo:${dark.background};--noche-tinta:${dark.foreground}}`
  );
}

/** Todo lo generado, listo para meter en un `<style>` del `<head>`. */
export function appearanceStylesheet(): string {
  return PALETTES.map(
    (palette) => paletteRules(palette) + previewRules(palette) + swatchRules(palette),
  ).join("");
}
