import { defineConfig } from "@playwright/test";

/**
 * Dedicated Playwright config for the reminder-settings card behaviour suite.
 *
 * Runs the REAL <ReminderSettingsCard> via the env-gated harness route
 * (/reminder-e2e/{clientId}, NEXT_PUBLIC_E2E_REMINDER=1) with the reminder tRPC
 * calls mocked by route interception — fully headless, NO test DB / Supabase.
 * Kept separate from playwright.config.ts (testDir ./e2e) so the default suite
 * never runs it without the harness env. Run with:
 *   bunx playwright test --config playwright.reminder.config.ts
 */
export default defineConfig({
  testDir: "./e2e-reminder",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3211", trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "NEXT_PUBLIC_E2E_REMINDER=1 PORT=3211 bun run dev",
    url: "http://localhost:3211",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
