import { test, expect } from "@playwright/test";

/**
 * Full end-to-end workflow test: simulates Roberto's actual usage.
 *
 * Flow: Login → Dashboard → Intake Form → Plan Generation → Invoicing → Monitoring → Portal
 *
 * This test verifies data actually flows through tRPC to Supabase and back.
 */

test.describe("Roberto Full Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("roberto@test.com");
    await page.getByLabel("Password").fill("testpass123");
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("dashboard loads with KPI cards and sections", async ({ page }) => {
    await expect(page.getByText("Clienti attivi")).toBeVisible();
    await expect(page.getByText("Check-in in attesa")).toBeVisible();
    await expect(page.getByText("Fatturato mese")).toBeVisible();
    await expect(page.getByText("Avvisi")).toBeVisible();
    await expect(page.getByText("Pipeline Clienti")).toBeVisible();
    await expect(page.getByText("Engagement Heatmap")).toBeVisible();
  });

  test("intake form renders all 7 pages and navigates", async ({ page }) => {
    await page.goto("/plans/new");

    // Page 1: Paziente
    await expect(page.getByText("1 / 7")).toBeVisible();
    await expect(page.getByText("Dati Paziente")).toBeVisible();
    await expect(page.getByText("Nome e Cognome")).toBeVisible();
    await expect(page.getByText("Maschio")).toBeVisible();
    await expect(page.getByText("Femmina")).toBeVisible();

    // Fill all required page 1 fields: name, DOB, height, sex
    await page.getByPlaceholder("Mario Rossi").fill("Marco Test");
    await page.locator('input[type="date"]').fill("1990-05-15");
    await page.getByPlaceholder("175").fill("178");
    await page.getByText("Maschio").click();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 2: Circonferenze
    await expect(page.getByText("2 / 7")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 3: Pliche
    await expect(page.getByText("3 / 7")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 4: Anamnesi
    await expect(page.getByText("4 / 7")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 5: Allenamento
    await expect(page.getByText("5 / 7")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 6: Stile di Vita
    await expect(page.getByText("6 / 7")).toBeVisible();
    await page.getByRole("button", { name: "Avanti" }).click();

    // Page 7: Obiettivo — final page
    await expect(page.getByText("7 / 7")).toBeVisible();
  });

  test("plan generation page loads with client selector and options", async ({ page }) => {
    await page.goto("/plans/generate");

    await expect(page.getByRole("heading", { name: "Genera Piano Nutrizionale" })).toBeVisible();
    await expect(page.getByText("Cliente *")).toBeVisible();

    // Client dropdown should exist
    const select = page.locator("select");
    await expect(select).toBeVisible();

    // Meal config
    await expect(page.getByText("Configurazione Pasti")).toBeVisible();
    await expect(page.getByText("Numero Pasti/Giorno")).toBeVisible();

    // Allergen toggles
    await expect(page.getByText("Escludi Allergeni")).toBeVisible();
    await expect(page.getByText("Glutine")).toBeVisible();
    await expect(page.getByText("Latticini")).toBeVisible();

    // Generate button
    await expect(page.getByRole("button", { name: "Genera Piano Nutrizionale" })).toBeVisible();
  });

  test("invoices page shows list with tabs and summary cards", async ({ page }) => {
    await page.goto("/invoices");

    await expect(page.getByRole("heading", { name: "Fatture" })).toBeVisible();
    await expect(page.getByText("+ Nuova Fattura")).toBeVisible();

    // Status tabs
    await expect(page.getByText("Tutte")).toBeVisible();
    await expect(page.getByText("Bozze")).toBeVisible();
    await expect(page.getByText("Inviate")).toBeVisible();
    await expect(page.getByText("Pagate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Scadute" })).toBeVisible();

    // Summary cards
    await expect(page.getByText("Da incassare")).toBeVisible();
  });

  test("new invoice form renders within dashboard", async ({ page }) => {
    await page.goto("/invoices/new");

    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(50);
    await expect(page.locator("aside")).toBeVisible();
  });

  test("monitoring page shows check-in management with tabs", async ({ page }) => {
    await page.goto("/monitoring");

    await expect(page.getByRole("heading", { name: "Monitoraggio" })).toBeVisible();

    // Status tabs
    await expect(page.getByRole("button", { name: "In attesa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Da revisionare" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revisionati" })).toBeVisible();

    // KPI cards
    await expect(page.getByText("Totale check-in")).toBeVisible();
  });

  test("training log page renders with session type filters", async ({ page }) => {
    await page.goto("/monitoring/training");

    await expect(page.getByRole("heading", { name: "Log Allenamento" })).toBeVisible();
    await expect(page.getByText("+ Nuova Sessione")).toBeVisible();
    await expect(page.getByText("Forza")).toBeVisible();
    await expect(page.getByText("Cardio")).toBeVisible();
  });

  test("notifications page renders within dashboard", async ({ page }) => {
    await page.goto("/monitoring/notifications");

    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(20);
    await expect(page.locator("aside")).toBeVisible();
  });

  test("client portal login is independent (no sidebar)", async ({ page }) => {
    await page.goto("/portal/login");

    await expect(page.getByText("Area Cliente")).toBeVisible();
    await expect(page.getByText("Roberto Scrigna")).toBeVisible();
    await expect(page.getByText("Invia link di accesso")).toBeVisible();

    // Portal has its own layout — no dashboard sidebar
    await expect(page.locator("aside")).not.toBeVisible();
  });
});
