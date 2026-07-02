import { defineConfig } from "@playwright/test";

/**
 * SUPPLEMENTARY authed-coach exercise pass — complements e2e/exercise-pass.spec.ts
 * (which covers the unauth/guarded surface against a live instance but must SKIP
 * the authenticated coach interactions without operator creds).
 *
 * This one establishes a REAL coach session against a LOCAL Supabase using the
 * project's own e2e account (roberto@test.com, seeded locally) and drives the full
 * authenticated coach surface headless. Requires local Supabase running + seeded and
 * the env from e2e-exercise/.localenv — see e2e-exercise/README-exercise.md.
 *
 *   source e2e-exercise/.localenv && bunx playwright test --config playwright.exercise-local.config.ts
 */
export default defineConfig({
  testDir: "./e2e-exercise",
  globalSetup: "./e2e-exercise/global-setup.ts",
  timeout: 300_000,
  reporter: [["list"]],
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3220", trace: "off", screenshot: "off" },
  webServer: { command: "PORT=3220 bun run dev", url: "http://localhost:3220", reuseExistingServer: false, timeout: 180_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
