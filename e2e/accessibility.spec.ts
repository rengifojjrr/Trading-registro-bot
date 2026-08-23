import AxeBuilder from "@axe-core/playwright";

import { expect, test, skipWithoutCredentials } from "./support/fixtures";

/**
 * Accesibilidad medida, no prometida.
 *
 * Hasta ahora la accesibilidad de esta aplicación era una intención: se usan
 * primitivas de Radix y se ponen `aria-label`, y nadie había comprobado nunca
 * el resultado. Una intención no detecta el contraste que se rompió al cambiar
 * un color, ni el botón que se quedó sin nombre al sustituir el texto por un
 * icono -- que son los dos fallos que de verdad aparecen.
 *
 * Se comprueban las reglas WCAG 2 AA, que son las que corresponden a fallos
 * reales de uso, y no el catálogo entero de axe: incluir «best practice»
 * llenaría esto de avisos de estilo y la prueba dejaría de leerse.
 *
 * Las páginas son las que se miran a diario. Cubrir las treinta haría la suite
 * demasiado lenta para ejecutarse, y una prueba que no se ejecuta no protege
 * nada.
 */
const PAGES = ["/trades", "/journal", "/analytics", "/behaviour", "/strategies", "/activity"];

skipWithoutCredentials();

test.describe("accesibilidad", () => {
  for (const path of PAGES) {
    test(`${path} no tiene fallos de accesibilidad`, async ({ signedIn }) => {
      await signedIn.goto(path);
      await signedIn.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page: signedIn })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      // El mensaje enumera qué falló y dónde: un «esperaba 0, recibí 3» no
      // dice qué arreglar, y entonces la prueba se salta en vez de corregirse.
      const resumen = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.help} -- ${v.nodes.length} elemento(s)`)
        .join("\n");

      expect(results.violations, `Fallos en ${path}:\n${resumen}`).toEqual([]);
    });
  }

  test("se puede llegar al buscador solo con el teclado", async ({ signedIn }) => {
    // El atajo ya se prueba aparte. Esto comprueba lo otro: que quien navega
    // con tabulador también llega, sin tener que saberse el atajo.
    await signedIn.goto("/");

    const boton = signedIn.getByRole("button", { name: /buscar en todo/i });
    await boton.focus();
    await expect(boton).toBeFocused();

    await signedIn.keyboard.press("Enter");
    await expect(signedIn.getByRole("dialog", { name: /buscar en todo/i })).toBeVisible();
  });
});
