import { defineConfig } from "@playwright/test";

/**
 * Dedicated Playwright config for the urgent-feedback screen behaviour suite.
 *
 * Runs the REAL <UrgentFeedbackScreen> via the env-gated harness route
 * (/portal/feedback-e2e, NEXT_PUBLIC_E2E_FEEDBACK=1) with the feedback tRPC calls
 * mocked by route interception — fully headless, NO test DB / Supabase. Kept
 * separate from playwright.config.ts (testDir ./e2e). Run with:
 *   bunx playwright test --config playwright.feedback.config.ts
 */
export default defineConfig({
  testDir: "./e2e-feedback",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3212", trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "NEXT_PUBLIC_E2E_FEEDBACK=1 PORT=3212 bun run dev",
    url: "http://localhost:3212",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
