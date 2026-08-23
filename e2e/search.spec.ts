import { expect, test, skipWithoutCredentials } from "./support/fixtures";

/**
 * El buscador global, probado con teclado porque es como se va a usar.
 *
 * Un buscador al que solo se llega con el ratón no ahorra nada: el atajo es
 * la mitad de la función. Y una cuenta recién creada no tiene datos, así que
 * lo que se comprueba aquí es lo que tiene que funcionar de todas formas --
 * abrir, encontrar páginas, navegar y cerrar.
 */
skipWithoutCredentials();

test.describe("buscador global", () => {
  test("se abre con el atajo y se cierra con Escape", async ({ signedIn }) => {
    await signedIn.goto("/");

    await signedIn.keyboard.press("ControlOrMeta+k");
    const dialog = signedIn.getByRole("dialog", { name: /buscar en todo/i });
    await expect(dialog).toBeVisible();

    await signedIn.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("encuentra una página por una palabra que no está en su nombre", async ({ signedIn }) => {
    // «drawdown» tiene que llevar a Riesgo. Es el caso que justifica que el
    // buscador también busque páginas y no solo filas.
    await signedIn.goto("/");
    await signedIn.keyboard.press("ControlOrMeta+k");

    await signedIn.getByRole("searchbox", { name: /qué buscar/i }).fill("drawdown");
    await expect(signedIn.getByRole("button", { name: /riesgo/i }).first()).toBeVisible();
  });

  test("Enter abre el primer resultado", async ({ signedIn }) => {
    await signedIn.goto("/");
    await signedIn.keyboard.press("ControlOrMeta+k");

    await signedIn.getByRole("searchbox", { name: /qué buscar/i }).fill("estrategias");
    await expect(signedIn.getByRole("button", { name: /estrategias/i }).first()).toBeVisible();
    await signedIn.keyboard.press("Enter");

    await signedIn.waitForURL("**/strategies", { timeout: 15_000 });
    await expect(signedIn.getByRole("heading", { name: /estrategias/i }).first()).toBeVisible();
  });

  test("lo dice cuando no encuentra nada, en vez de quedarse en blanco", async ({ signedIn }) => {
    await signedIn.goto("/");
    await signedIn.keyboard.press("ControlOrMeta+k");

    await signedIn.getByRole("searchbox", { name: /qué buscar/i }).fill("zzzzqqqxx");
    await expect(signedIn.getByText(/nada encaja con/i)).toBeVisible({ timeout: 15_000 });
  });
});
