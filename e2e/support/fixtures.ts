import { test as base, expect, type Page } from "@playwright/test";

import { E2E_READY, SKIP_REASON, TEST_USER } from "./env";

/**
 * Shared test setup: skip cleanly without credentials, and hand every test
 * an already-signed-in page so no spec spends its first three lines
 * retyping the login form.
 */

export const test = base.extend<{ signedIn: Page }>({
  // The second argument is Playwright's "hand this value to the test"
  // callback. It's conventionally named `use`, but that trips the React
  // hooks lint rule, and it's positional -- so it gets a clearer name here.
  signedIn: async ({ page }, runTest) => {
    await signIn(page);
    await runTest(page);
  },
});

/**
 * Call at the top of every spec file, outside any describe.
 *
 * It has to happen at collection time, not in a beforeEach: skipping from
 * a hook runs *after* Playwright has already started a browser for the
 * worker, so a credential-less run would fail on browser startup instead
 * of reporting a clean skip.
 */
export function skipWithoutCredentials() {
  test.skip(!E2E_READY, SKIP_REASON);
}

export async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 30_000 });
}

/**
 * Fails when the page scrolls sideways. Worth asserting on every page:
 * it's the mobile break that is easiest to ship and hardest to notice from
 * a desktop browser.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "la página no debe desbordarse horizontalmente").toBeLessThanOrEqual(1);
}

export { expect };
