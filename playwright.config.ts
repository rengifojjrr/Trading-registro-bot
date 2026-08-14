import { defineConfig, devices } from "@playwright/test";

import { E2E_ENV } from "./e2e/support/env";

/**
 * End-to-end configuration.
 *
 * Runs against a production build rather than `next dev`: the dev server
 * compiles routes on first request, which turns real assertions into
 * timing races and hides the behaviour that actually ships. Point
 * `E2E_BASE_URL` at an already-running server to skip the build.
 *
 * Every page is exercised at both widths. The app uses CSS-only responsive
 * behaviour in several places (`hidden md:block`), which jsdom can't
 * evaluate at all -- this is the only layer that verifies the mobile
 * layout is really there.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false, // One shared account: parallel specs would race on its data.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: E2E_ENV.baseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Escape hatch for sandboxes and images that ship their own Chromium
    // under a name Playwright's downloader doesn't recognise. Unset in CI,
    // where `playwright install` puts the matching build in place.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
