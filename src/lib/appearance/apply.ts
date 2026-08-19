"use client";

import {
  appearanceAttributes,
  DEFAULT_APPEARANCE,
  parseCorners,
  parseDensity,
  parsePalette,
  parseSurface,
  type Appearance,
} from "./catalog";
import { appearanceCookieValue } from "./storage";

/**
 * Aplicar la apariencia, en el navegador.
 *
 * Dos cosas pasan aquí y ninguna es pintar: se cambian atributos en `<html>`
 * y se guardan cookies. Los colores los pone el CSS, que ya está en la página
 * con las cinco paletas escritas. Por eso el cambio se ve en el mismo
 * fotograma y no hace falta ningún botón de «Guardar»: al cambiar la letra
 * del atributo, el navegador ya tiene la regla que corresponde.
 *
 * Lo que **no** hace es escribir variables con `style.setProperty()`. Ver la
 * explicación larga en `css.ts`; el resumen es que un estilo en línea gana a
 * `prefers-color-scheme` y deja la aplicación en claro de noche para siempre.
 */

/** El estado que hay ahora mismo, leído de donde manda: el propio `<html>`. */
export function currentAppearance(): Appearance {
  if (typeof document === "undefined") return DEFAULT_APPEARANCE;

  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");

  return {
    palette: parsePalette(root.getAttribute("data-paleta")),
    // Sin atributo es `auto`, que es justo lo que significa no dejar marca.
    theme: theme === "light" ? "claro" : theme === "dark" ? "oscuro" : "auto",
    surface: parseSurface(root.getAttribute("data-superficie")),
    corners: parseCorners(root.getAttribute("data-esquinas")),
    density: parseDensity(root.getAttribute("data-densidad")),
  };
}

/**
 * Cambia los ejes que se le pasen y deja en paz a los demás.
 *
 * `aplicarApariencia({ theme: "oscuro" })` no puede tocar la paleta: se parte
 * de lo que hay puesto y se sobrescribe sólo lo que llega.
 */
export function aplicarApariencia(cambios: Partial<Appearance>): Appearance {
  const siguiente: Appearance = { ...currentAppearance(), ...cambios };

  if (typeof document === "undefined") return siguiente;

  const root = document.documentElement;
  const atributos = appearanceAttributes(siguiente);

  for (const [nombre, valor] of Object.entries(atributos)) {
    root.setAttribute(nombre, valor);
  }
  // `auto` no deja atributo, así que al volver a `auto` hay que quitarlo:
  // dejarlo puesto congelaría el tema en lo último que se eligió.
  if (!("data-theme" in atributos)) root.removeAttribute("data-theme");

  guardar(cambios);

  return siguiente;
}

/** Lo devuelve todo a los valores por defecto y dice en qué lo dejó. */
export function aparienciaDeFabrica(): Appearance {
  return aplicarApariencia(DEFAULT_APPEARANCE);
}

/**
 * Guardar no puede tumbar la página.
 *
 * En modo privado, con las cookies desactivadas o con la cuota llena, esto
 * lanza. Que la elección no se recuerde es un fastidio; que la aplicación se
 * quede en blanco por no poder recordarla, no. El cambio ya se ha aplicado
 * antes de llegar aquí, así que fallar sólo cuesta la próxima visita.
 */
function guardar(cambios: Partial<Appearance>): void {
  try {
    for (const [eje, valor] of Object.entries(cambios)) {
      document.cookie = appearanceCookieValue(eje as keyof Appearance, valor);
    }
  } catch {
    // Sin sitio donde guardar se sigue funcionando con lo que hay en pantalla.
  }
}
