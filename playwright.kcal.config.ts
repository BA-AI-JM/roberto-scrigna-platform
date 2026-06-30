import { defineConfig } from "@playwright/test";

/**
 * Dedicated Playwright config for the #10 session kcal estimate + override.
 * Drives the REAL <WeekSessionsEditor> via the env-gated harness route
 * (/kcal-e2e, NEXT_PUBLIC_E2E_KCAL=1) with the override tRPC call mocked —
 * headless, NO test DB / Supabase. Run with:
 *   bunx playwright test --config playwright.kcal.config.ts
 */
export default defineConfig({
  testDir: "./e2e-kcal",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3213", trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "NEXT_PUBLIC_E2E_KCAL=1 PORT=3213 bun run dev",
    url: "http://localhost:3213",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
