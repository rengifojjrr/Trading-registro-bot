import { expect, test, skipWithoutCredentials } from "./support/fixtures";

/**
 * The two settings behaviours worth guarding: preferences must actually
 * persist, and automatic syncing must stay locked until the manual
 * validation has been done.
 */
skipWithoutCredentials();

test.describe("configuración", () => {
  test("la sincronización automática está bloqueada hasta validar", async ({ signedIn }) => {
    await signedIn.goto("/settings");

    const toggle = signedIn.locator("#auto_sync_toggle");
    await expect(toggle).toBeVisible();

    // A brand-new account has verified nothing, so the switch must be off
    // and unusable -- this is the gate that stops the cron job trusting
    // numbers nobody has checked against Coinbase.
    await expect(toggle).toBeDisabled();
    await expect(signedIn.getByRole("link", { name: /validación/i }).last()).toBeVisible();
  });

  test("la validación explica cuánto falta en vez de solo negarse", async ({ signedIn }) => {
    await signedIn.goto("/validation");

    await expect(signedIn.getByText("0/20")).toBeVisible();
    await expect(signedIn.getByText(/sin operaciones cerradas que revisar/i)).toBeVisible();
  });

  test("un cambio de zona horaria se guarda y sobrevive a la recarga", async ({ signedIn }) => {
    await signedIn.goto("/settings");

    // A Radix select, not a native one -- driven through the visible
    // trigger so the test exercises the same path a person does.
    const timezone = signedIn.locator("#timezone");
    await timezone.click();
    await signedIn.getByRole("option", { name: "America/Bogota", exact: true }).click();
    await expect(timezone).toContainText("America/Bogota");

    await signedIn.getByRole("button", { name: /guardar/i }).first().click();

    await signedIn.reload();
    await expect(signedIn.locator("#timezone")).toContainText("America/Bogota");
  });
});
