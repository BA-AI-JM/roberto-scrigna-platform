import { defineConfig } from "@playwright/test";

/**
 * Dedicated Playwright config for the signing-screen behaviour suite.
 *
 * Runs the REAL <SignScreen> via the env-gated harness route
 * (/portal/firma-e2e/{id}, NEXT_PUBLIC_E2E_SIGN=1) with the tRPC HTTP layer
 * mocked by route interception — so it runs fully headless WITHOUT a test DB or
 * Supabase session. A true end-to-end run against a real DB is a separate
 * (v1.5) staging/test-DB item.
 *
 * Kept separate from playwright.config.ts (testDir ./e2e) so the default suite
 * never picks up this spec without the harness env. Run with:
 *   bunx playwright test --config playwright.sign.config.ts
 */
export default defineConfig({
  testDir: "./e2e-sign",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "NEXT_PUBLIC_E2E_SIGN=1 PORT=3210 bun run dev",
    url: "http://localhost:3210",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
