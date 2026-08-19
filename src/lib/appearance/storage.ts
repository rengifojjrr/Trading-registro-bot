import {
  DEFAULT_APPEARANCE,
  parseCorners,
  parseDensity,
  parsePalette,
  parseSurface,
  parseTheme,
  type Appearance,
} from "./catalog";

/**
 * Dónde se guarda la apariencia elegida.
 *
 * **Una cookie por eje, no una sola con los cinco.** Con un único valor
 * empaquetado, guardar el tema obliga a reescribir también la paleta, y dos
 * pestañas abiertas cambiando cosas distintas se pisan la una a la otra. Con
 * una cookie por eje, escribir el tema es escribir el tema.
 *
 * **Cookies y no `localStorage`.** El encargo pide `localStorage`, pero pide
 * antes que no haya parpadeo, y aquí las dos cosas no caben juntas: esta
 * aplicación se renderiza en el servidor, y el servidor no puede leer
 * `localStorage`. Con `localStorage` habría que mandar el HTML sin saber qué
 * aspecto toca y corregirlo después con un script -- que es exactamente el
 * parpadeo que hay que evitar. Con una cookie, la elección viaja con la
 * petición y los atributos correctos van en el primer byte de HTML. Sigue
 * siendo, como pide el encargo, algo que vive en el navegador de cada uno y
 * no en la base de datos.
 *
 * Nada de esto es sensible, así que las cookies no son `HttpOnly` -- el panel
 * tiene que poder escribirlas sin ir al servidor -- y son `SameSite=Lax`.
 */

export const APPEARANCE_COOKIES: Record<keyof Appearance, string> = {
  palette: "apariencia-paleta",
  theme: "apariencia-tema",
  surface: "apariencia-superficie",
  corners: "apariencia-esquinas",
  density: "apariencia-densidad",
};

/**
 * La cookie del interruptor viejo de claro/oscuro.
 *
 * Antes de esto sólo había dos temas y se guardaban como `light` / `dark`.
 * Quien ya había elegido uno no tiene por qué perderlo porque hayamos
 * cambiado el sistema por dentro, así que se sigue leyendo mientras no haya
 * una elección nueva.
 */
const LEGACY_THEME_COOKIE = "trading-registro-theme";

export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Lo que se lea de una cookie del tema vieja, en los valores de ahora. */
function fromLegacyTheme(value: string | undefined): string | undefined {
  if (value === "light") return "claro";
  if (value === "dark") return "oscuro";
  return undefined;
}

/**
 * Reconstruye la apariencia a partir de las cookies.
 *
 * Recibe un lector en lugar de leer por su cuenta para no atarse a
 * `next/headers`: así vale igual en el servidor, en un test y -- leyendo
 * `document.cookie` -- en el navegador.
 *
 * Cada eje se valida por separado contra el catálogo, de modo que una cookie
 * con basura, o con el nombre de una paleta que ya hemos quitado, cae al
 * valor de fábrica de *ese* eje sin arrastrar a los otros cuatro.
 */
export function readAppearance(read: (name: string) => string | undefined): Appearance {
  return {
    palette: parsePalette(read(APPEARANCE_COOKIES.palette)),
    theme: parseTheme(read(APPEARANCE_COOKIES.theme) ?? fromLegacyTheme(read(LEGACY_THEME_COOKIE))),
    surface: parseSurface(read(APPEARANCE_COOKIES.surface)),
    corners: parseCorners(read(APPEARANCE_COOKIES.corners)),
    density: parseDensity(read(APPEARANCE_COOKIES.density)),
  };
}

/**
 * La cookie de un eje, lista para `document.cookie`.
 *
 * Volver a fábrica escribe los valores de fábrica en vez de borrar las
 * cookies. Borrarlas parece más limpio y hace lo contrario de lo que promete:
 * sin la cookie nueva vuelve a leerse la vieja de claro/oscuro, y quien pulsa
 * «como viene de fábrica» se encontraría con la elección que hizo hace un
 * año.
 */
export function appearanceCookieValue(axis: keyof Appearance, value: string): string {
  return `${APPEARANCE_COOKIES[axis]}=${value}; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; samesite=lax`;
}

export { DEFAULT_APPEARANCE };
