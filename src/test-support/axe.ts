import axe from "axe-core";

/**
 * Accesibilidad medida en jsdom, para lo que jsdom puede medir.
 *
 * La suite de verdad corre con Playwright sobre un navegador real, pero sólo
 * mira seis páginas de trading: cubrir las treinta la haría demasiado lenta
 * para ejecutarse, y una prueba que no se ejecuta no protege nada. Esto es la
 * otra mitad -- barata, sobre el componente suelto, y por tanto ejecutable en
 * cada `npm test`.
 *
 * Lo que aquí **no** se puede medir es el contraste: necesita un motor de
 * maquetación y en jsdom todo mide cero por cero. Lo que sí se mide es la
 * clase de fallo que de verdad aparece al escribir componentes -- el botón que
 * se queda sin nombre porque su texto se volvió un icono, el campo sin
 * etiqueta, la lista mal formada. Los tres han aparecido ya en este proyecto.
 */
const REGLAS = {
  runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: {
    // Sin maquetación, el resultado sería ruido. Lo cubre Playwright.
    "color-contrast": { enabled: false },
    // Aquí se renderiza un trozo suelto y no una página, así que las quejas
    // sobre landmarks del documento no aplican.
    region: { enabled: false },
  },
};

/**
 * Los fallos de accesibilidad de un trozo de pantalla, ya legibles.
 *
 * Devuelve frases y no el objeto de axe a propósito: un `esperaba 0, recibí 3`
 * no dice qué arreglar, y una prueba que no dice qué arreglar se salta en vez
 * de corregirse.
 */
export async function fallosDeAccesibilidad(elemento: HTMLElement): Promise<string[]> {
  const resultado = await axe.run(elemento, REGLAS);
  return resultado.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} -- ${v.nodes.length} elemento(s)`,
  );
}
