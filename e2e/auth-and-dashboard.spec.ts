import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page renders with form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
  });

  test("unauthenticated user is redirected from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("login with valid credentials reaches dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Accedi" }).click();

    // Should redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Accedi" }).click();

    // Should show error message
    await expect(page.getByText("non corretti")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Dashboard (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("dashboard shows sidebar with navigation", async ({ page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Clienti & Piani")).toBeVisible();
    await expect(sidebar.getByText("Fatturazione")).toBeVisible();
    await expect(sidebar.getByText("Monitoraggio")).toBeVisible();
  });

  test("sidebar navigation links work", async ({ page }) => {
    const sidebar = page.locator("aside");

    await sidebar.getByText("Clienti & Piani").click();
    await page.waitForURL("**/plans");
    expect(page.url()).toContain("/plans");

    await sidebar.getByText("Fatturazione").click();
    await page.waitForURL("**/invoices");
    expect(page.url()).toContain("/invoices");

    await sidebar.getByText("Monitoraggio").click();
    await page.waitForURL("**/monitoring");
    expect(page.url()).toContain("/monitoring");
  });

  test("logout button works", async ({ page }) => {
    await page.getByRole("button", { name: "Esci" }).click();
    await page.waitForURL("**/login", { timeout: 5000 });
    expect(page.url()).toContain("/login");
  });
});
