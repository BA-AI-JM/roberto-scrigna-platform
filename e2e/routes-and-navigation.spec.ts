import { test, expect } from "@playwright/test";

/**
 * Smoke test: public routes serve pages, protected routes redirect to login.
 */

const PUBLIC_ROUTES = [
  { path: "/login", expectText: "Accedi" },
  { path: "/register", expectText: "Crea account" },
  { path: "/portal/login", expectText: "login" },
];

const PROTECTED_ROUTES = [
  { path: "/dashboard", expectText: "Dashboard" },
  { path: "/plans", expectText: "Plan" },
  { path: "/plans/new", expectText: "Plan" },
  { path: "/invoices", expectText: "Invoic" },
  { path: "/invoices/new", expectText: "Invoic" },
  { path: "/monitoring", expectText: "Monitor" },
  { path: "/monitoring/training", expectText: "Train" },
  { path: "/monitoring/notifications", expectText: "Notif" },
];

test.describe("Public routes", () => {
  for (const { path, expectText } of PUBLIC_ROUTES) {
    test(`${path} loads without auth`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      const html = await page.content();
      expect(html.toLowerCase()).toContain(expectText.toLowerCase());
    });
  }
});

test.describe("Protected routes redirect when unauthenticated", () => {
  for (const { path } of PROTECTED_ROUTES) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL("**/login", { timeout: 5000 });
      expect(page.url()).toContain("/login");
    });
  }
});

test.describe("Protected routes load when authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  for (const { path, expectText } of PROTECTED_ROUTES) {
    test(`${path} loads with content`, async ({ page }) => {
      await page.goto(path);
      const bodyText = await page.textContent("body");
      expect(bodyText?.length).toBeGreaterThan(10);
      const html = await page.content();
      expect(html.toLowerCase()).toContain(expectText.toLowerCase());
      // Sidebar should be present on all protected routes
      const sidebar = page.locator("aside");
      await expect(sidebar).toBeVisible();
    });
  }
});

test.describe("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("login page renders at mobile width", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  });
});
