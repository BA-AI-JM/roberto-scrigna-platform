import { test } from "@playwright/test";
import { join } from "path";

const SCREENSHOT_DIR = join(__dirname, "../screenshots");

test.describe("App Preview Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("capture all pages", async ({ page }) => {
    // Dashboard
    await page.goto("/dashboard");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "01-dashboard.png"), fullPage: true });

    // Plans list
    await page.goto("/plans");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "02-plans-list.png"), fullPage: true });

    // New client intake form
    await page.goto("/plans/new");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "03-intake-form.png"), fullPage: true });

    // Plan generation page
    await page.goto("/plans/generate");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "04-plan-generate.png"), fullPage: true });

    // Invoices list
    await page.goto("/invoices");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "05-invoices-list.png"), fullPage: true });

    // New invoice
    await page.goto("/invoices/new");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "06-invoice-new.png"), fullPage: true });

    // Monitoring
    await page.goto("/monitoring");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "07-monitoring.png"), fullPage: true });

    // Training
    await page.goto("/monitoring/training");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "08-training.png"), fullPage: true });

    // Notifications
    await page.goto("/monitoring/notifications");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "09-notifications.png"), fullPage: true });
  });
});

test.describe("Public pages", () => {
  test("capture login and portal", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "00-login.png"), fullPage: true });

    await page.goto("/portal/login");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "10-portal-login.png"), fullPage: true });
  });
});
