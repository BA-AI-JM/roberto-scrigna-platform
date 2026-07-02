import { defineConfig, devices } from "@playwright/test";

/**
 * Exercise-pass config — runs e2e/exercise-pass.spec.ts against a LIVE instance
 * (BASE_URL, defaults to production). No webServer: points at whatever is already
 * running (prod, a Vercel preview, or a local `next dev`). Kept separate from the
 * default playwright.config.ts so it never fights that config's localhost webServer.
 *
 * Native Italian locale — page-translation is never enabled, because Chrome
 * auto-translate rewrites text nodes under React and triggers a NotFoundError
 * reconciliation crash that is NOT an app bug.
 *
 *   BASE_URL=https://www.scrignanutrition.app npx playwright test --config playwright.exercise.config.ts
 *   # optional coach coverage: COACH_EMAIL=… COACH_PASSWORD=… (real coach creds)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/exercise-pass.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://www.scrignanutrition.app",
    locale: "it-IT",
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
