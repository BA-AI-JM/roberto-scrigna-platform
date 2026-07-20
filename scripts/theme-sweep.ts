/**
 * T3-C — Theme regression harness (visual-regression NET for the T3 hex→token migration).
 *
 * Captures a fixed page list in BOTH themes (light/dark, via <html data-theme> — the app's
 * single theme switch, globals.css) at desktop (1440) + mobile (390), writing full-page PNGs
 * to docs/polish/theme-sweep/<git-short-sha>/. CAPTURE ONLY — it does not judge; Terminal 1
 * diffs before/after each UI wave. Coach pages authenticate as Roberto; portal pages use a
 * self-provisioned THROWAWAY client (Niccolò/Raphael stay READ-ONLY). Everything is torn down.
 *
 * Run: bun run scripts/theme-sweep.ts   (needs supabase local + dev server on :3001 + chromium)
 */
import { chromium, type Browser } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP, AUTH_COOKIE_NAME, coachCookie, devUp, provisionThrowaway, teardownThrowaway, type Throwaway,
} from "../e2e-live/_provision";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;

function shortSha(): string {
  const r = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
  return (r.stdout?.toString().trim() || "unknown") + (Bun.spawnSync(["git", "status", "--porcelain"]).stdout?.toString().trim() ? "-dirty" : "");
}

async function main() {
  if (!(await devUp())) {
    console.error("ABORT: dev server not reachable on :3001 — start it first.");
    process.exit(1);
  }

  const sha = shortSha();
  const outDir = join("docs", "polish", "theme-sweep", sha);
  mkdirSync(outDir, { recursive: true });
  console.log(`theme-sweep → ${outDir}`);

  let throwaway: Throwaway | null = null;
  let browser: Browser | null = null;
  const captured: string[] = [];
  const skipped: string[] = [];

  try {
    throwaway = await provisionThrowaway({ withPortalUser: true, withPlan: true, fullName: "T2 Sweep Test" });
    const coach = await coachCookie();

    const PAGES: Array<{ route: string; role: "none" | "coach" | "portal"; slug: string }> = [
      { route: "/login", role: "none", slug: "login" },
      { route: "/dashboard", role: "coach", slug: "dashboard" },
      { route: "/clients", role: "coach", slug: "clients" },
      { route: "/plans", role: "coach", slug: "plans" },
      { route: "/plans/generate", role: "coach", slug: "plans-generate" },
      ...(throwaway.planId ? [{ route: `/plans/${throwaway.planId}/review`, role: "coach" as const, slug: "plans-review" }] : []),
      { route: "/portal/dashboard", role: "portal", slug: "portal-dashboard" },
      { route: "/portal/plan", role: "portal", slug: "portal-plan" },
      { route: "/portal/progress", role: "portal", slug: "portal-progress" },
    ];

    const cookieFor = (role: string): { name: string; value: string; url: string }[] => {
      if (role === "coach" && coach) return [{ name: AUTH_COOKIE_NAME, value: coach.split("=").slice(1).join("="), url: APP }];
      if (role === "portal" && throwaway?.portalCookieValue) return [{ name: AUTH_COOKIE_NAME, value: throwaway.portalCookieValue, url: APP }];
      return [];
    };

    browser = await chromium.launch();

    for (const vp of VIEWPORTS) {
      for (const role of ["none", "coach", "portal"] as const) {
        const pages = PAGES.filter((p) => p.role === role);
        if (pages.length === 0) continue;
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
        const cookies = cookieFor(role);
        if (cookies.length) await ctx.addCookies(cookies);
        const page = await ctx.newPage();

        for (const p of pages) {
          for (const theme of THEMES) {
            const file = `${vp.name}-${theme}-${p.slug}.png`;
            try {
              await page.goto(`${APP}${p.route}`, { waitUntil: "networkidle", timeout: 20000 });
              await page.waitForTimeout(1200); // let client tRPC queries resolve
              await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
              await page.waitForTimeout(400); // repaint
              await page.screenshot({ path: join(outDir, file), fullPage: true });
              captured.push(file);
              console.log(`  ✓ ${file}`);
            } catch (e) {
              skipped.push(`${file} (${String(e).slice(0, 60)})`);
              console.warn(`  ✗ ${file} — ${String(e).slice(0, 80)}`);
            }
          }
        }
        await ctx.close();
      }
    }

    writeFileSync(
      join(outDir, "README.md"),
      [
        `# Theme sweep — ${sha}`,
        ``,
        `Captured ${captured.length} full-page screenshots (${skipped.length} skipped) across`,
        `${VIEWPORTS.map((v) => v.name).join(" + ")} × ${THEMES.join("/")} themes.`,
        ``,
        `Filename: \`<viewport>-<theme>-<page>.png\`. Theme is set via \`<html data-theme>\`,`,
        `the app's single switch (globals.css). Pages still on hardcoded hex won't change`,
        `between light/dark — that visible non-response is exactly the migration signal.`,
        ``,
        `Regenerate: \`bun run scripts/theme-sweep.ts\` (needs dev :3001 + supabase local + chromium).`,
        `Coach pages auth as Roberto; portal pages use a self-provisioned throwaway (torn down).`,
        skipped.length ? `\n## Skipped\n${skipped.map((s) => `- ${s}`).join("\n")}` : ``,
      ].join("\n")
    );
    console.log(`\nDONE: ${captured.length} captured, ${skipped.length} skipped → ${outDir}`);
  } finally {
    if (browser) await browser.close();
    if (throwaway) await teardownThrowaway(throwaway);
  }
}

await main();
