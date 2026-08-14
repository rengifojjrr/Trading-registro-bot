import { E2E_ENV } from "./support/env";
import { expect, expectNoHorizontalOverflow, test, skipWithoutCredentials } from "./support/fixtures";

/**
 * The CSV importer, end to end: file in, trades out.
 *
 * This is the only test in the project that covers the complete chain --
 * parse, write raw fills, reconstruct, compute P&L, render. Unit tests
 * cover each link; this proves they're actually connected, and that the
 * numbers that reach the screen are the ones the engine produced.
 */

const PRODUCT = "E2E-TEST-PRODUCT";
const CONTRACT_SIZE = "0.01";

/** 68000 -> 68500 on 2 contracts of 0.01 BTC = 10.00 gross, less 3.00 fees. */
function fixtureCsv(runId: string) {
  return [
    "Entry ID,Trade Time,Side,Price,Size,Fee",
    `${runId}-1,2026-03-02T14:30:00Z,BUY,68000,2,1.50`,
    `${runId}-2,2026-03-02T15:10:00Z,SELL,68500,2,1.50`,
    `${runId}-3,2026-03-03T10:00:00Z,BUY,69000,1,0.00`,
    `${runId}-4,2026-03-03T10:30:00Z,???,69100,1,0.00`,
    `${runId}-1,2026-03-03T11:00:00Z,SELL,69200,1,0.00`,
  ].join("\n");
}

async function uploadFixture(page: import("@playwright/test").Page, runId: string) {
  await page.goto("/import");
  await page.setInputFiles('input[type="file"]', {
    name: "e2e-fills.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(fixtureCsv(runId), "utf8"),
  });
  await page.waitForSelector("text=4. Revisa antes de importar");
}

skipWithoutCredentials();

test.describe("importación CSV", () => {
  test("previsualiza, explica cada fila rechazada y no guarda nada todavía", async ({ signedIn }) => {
    const runId = `prev-${Date.now()}`;
    await uploadFixture(signedIn, runId);

    // 5 rows in: 3 good, 1 bad side, 1 duplicate id.
    await expect(signedIn.getByText("3 listos")).toBeVisible();
    await expect(signedIn.getByText("2 con problemas")).toBeVisible();
    await expect(signedIn.getByText(/Lado no reconocido: "\?\?\?"/)).toBeVisible();
    await expect(signedIn.getByText(/Identificador repetido en el archivo/)).toBeVisible();

    // The mapping was guessed from the headers, not typed by the test.
    await expect(signedIn.locator("#map_entryId")).toContainText("Entry ID");
    await expect(signedIn.locator("#map_commission")).toContainText("Fee");

    await expectNoHorizontalOverflow(signedIn);

    // Nothing may have been written just by previewing.
    await signedIn.goto("/trades");
    await expect(signedIn.getByText(/Todavía no hay operaciones reconstruidas/).first()).toBeVisible();
  });

  test("bloquea la importación si falta una columna obligatoria", async ({ signedIn }) => {
    await uploadFixture(signedIn, `req-${Date.now()}`);

    await signedIn.locator("#map_price").click();
    await signedIn.getByRole("option", { name: "Sin asignar" }).click();

    await expect(signedIn.getByText("Falta asignar: Precio.")).toBeVisible();
    await expect(signedIn.getByRole("button", { name: /^Importar/ })).toBeDisabled();
  });

  test("exige el multiplicador de un producto nuevo antes de calcular P&L", async ({ signedIn }) => {
    await uploadFixture(signedIn, `mult-${Date.now()}`);

    await signedIn.locator("#import_product").click();
    await signedIn.getByRole("option", { name: "Otro producto…" }).click();
    await signedIn.fill("#import_new_product", PRODUCT);

    // Without a contract size the P&L would be wrong by a constant factor,
    // so the wizard must refuse rather than assume 1.
    await expect(signedIn.locator("#import_contract_size")).toBeVisible();
    await expect(signedIn.getByRole("button", { name: /^Importar/ })).toBeDisabled();
  });

  /**
   * Importing writes through the service-role client, so these two need the
   * key in the *server's* environment. CI passes the same secret to the
   * runner and the app it starts, so checking it here is a reliable proxy.
   * Everything above this line runs without it.
   */
  const writesRequireServiceRole = !E2E_ENV.serviceRoleKey;
  const noServiceRole = "requiere SUPABASE_SERVICE_ROLE_KEY: la importación escribe con el cliente de servicio.";

  test("importa, reconstruye la operación y muestra el P&L calculado", async ({ signedIn }) => {
    test.skip(writesRequireServiceRole, noServiceRole);
    const runId = `imp-${Date.now()}`;
    await uploadFixture(signedIn, runId);

    await signedIn.locator("#import_product").click();
    await signedIn.getByRole("option", { name: "Otro producto…" }).click();
    await signedIn.fill("#import_new_product", `${PRODUCT}-${runId}`);
    await signedIn.fill("#import_contract_size", CONTRACT_SIZE);

    await signedIn.getByRole("button", { name: /Importar 3 fill/ }).click();
    await expect(signedIn.getByText(/Importación terminada/)).toBeVisible({ timeout: 30_000 });
    await expect(signedIn.getByText(/3 fill\(s\) nuevos/)).toBeVisible();

    // The round trip became one closed trade; the third fill is still open.
    await signedIn.goto("/trades");
    await expect(signedIn.getByText(`${PRODUCT}-${runId}`).first()).toBeVisible();

    // 500 points * 2 contracts * 0.01 = 10.00 gross, minus 3.00 commissions.
    await expect(signedIn.getByText(/7[.,]00/).first()).toBeVisible();
  });

  test("volver a subir el mismo archivo no duplica nada", async ({ signedIn }) => {
    test.skip(writesRequireServiceRole, noServiceRole);
    const runId = `dup-${Date.now()}`;

    for (const pass of [1, 2]) {
      await uploadFixture(signedIn, runId);
      await signedIn.locator("#import_product").click();
      await signedIn.getByRole("option", { name: "Otro producto…" }).click();
      await signedIn.fill("#import_new_product", `${PRODUCT}-${runId}`);
      await signedIn.fill("#import_contract_size", CONTRACT_SIZE);
      await signedIn.getByRole("button", { name: /Importar 3 fill/ }).click();
      await expect(signedIn.getByText(/Importación terminada/)).toBeVisible({ timeout: 30_000 });

      if (pass === 2) {
        // raw_fills is append-only and keyed by entry id, so the second
        // upload must be a no-op rather than a second copy of the history.
        await expect(signedIn.getByText(/0 fill\(s\) nuevos/)).toBeVisible();
        await expect(signedIn.getByText(/3 ya estaban registrados/)).toBeVisible();
      }
    }
  });
});
