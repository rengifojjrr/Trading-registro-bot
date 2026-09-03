/**
 * La paleta de un gráfico de <canvas>, leída de los tokens vivos del documento.
 *
 * Un canvas no entiende `var(--primary)`: hay que resolver cada token a un
 * color antes de pintar. Este módulo es el único sitio donde eso se hace y el
 * único donde viven los colores de último recurso, para que las gráficas de
 * operaciones y de bots cambien juntas cuando cambie la paleta y ninguna
 * tenga que copiarse los literales.
 *
 * Los respaldos sólo se usan cuando `getComputedStyle` no devuelve nada, que
 * en un navegador de verdad no pasa nunca: ocurre en pruebas sin hoja de
 * estilo. Da igual a qué paleta se parezcan; lo que importa es que el gráfico
 * se dibuje. Por eso este archivo está en la lista de excepciones del test de
 * colores a mano, con ese motivo y no otro.
 */

export interface TemaCanvas {
  fondo: string;
  texto: string;
  rejilla: string;
  sube: string;
  baja: string;
  entrada: string;
  salida: string;
}

export const TEMA_CANVAS_RESPALDO: TemaCanvas = {
  fondo: "hsl(222, 44%, 9%)",
  texto: "hsl(215, 20%, 65%)",
  rejilla: "hsl(217, 28%, 18%)",
  sube: "hsl(142, 71%, 45%)",
  baja: "hsl(0, 72%, 51%)",
  entrada: "hsl(199, 89%, 48%)",
  salida: "hsl(38, 92%, 50%)",
};

/** Qué token del tema alimenta cada color. Los mismos que usa el gráfico de operaciones. */
const TOKEN_DE: Record<keyof TemaCanvas, string> = {
  fondo: "--card",
  texto: "--muted-foreground",
  rejilla: "--border",
  sube: "--positive",
  baja: "--negative",
  entrada: "--primary",
  salida: "--warning",
};

export function resolverTemaCanvas(): TemaCanvas {
  if (typeof window === "undefined") return TEMA_CANVAS_RESPALDO;
  const estilos = getComputedStyle(document.documentElement);
  const tema = { ...TEMA_CANVAS_RESPALDO };
  for (const clave of Object.keys(TOKEN_DE) as (keyof TemaCanvas)[]) {
    const valor = estilos.getPropertyValue(TOKEN_DE[clave]).trim();
    if (valor) tema[clave] = valor;
  }
  return tema;
}
