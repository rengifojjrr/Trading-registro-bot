import { E2E_READY, TEST_USER } from "./support/env";
import { expect, expectNoHorizontalOverflow, test, skipWithoutCredentials } from "./support/fixtures";

skipWithoutCredentials();

test.describe("autenticación", () => {
  test("una ruta protegida redirige a login", async ({ page }) => {
    await page.goto("/trades");
    await expect(page).toHaveURL(/\/login/);
  });

  test("una contraseña incorrecta no deja entrar y lo dice", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', "contraseña-que-no-es");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/credenciales|incorrect|inválid/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("las credenciales correctas llevan al dashboard", async ({ signedIn }) => {
    await expect(signedIn.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(signedIn);
  });

  test("la sesión sobrevive a una recarga", async ({ signedIn }) => {
    await signedIn.goto("/trades");
    await signedIn.reload();
    await expect(signedIn).toHaveURL(/\/trades/);
  });
});

test.describe("configuración de la suite", () => {
  test("hay credenciales para correr contra un proyecto real", async () => {
    // Guards the guard: if E2E_READY were ever true by accident, every
    // other test here would silently pass without touching the app.
    expect(E2E_READY).toBe(true);
  });
});
