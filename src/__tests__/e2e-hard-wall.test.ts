/**
 * T2.4 / G23 — the *-e2e bypass pages must hard-wall against production.
 *
 * Each e2e harness route renders a real component WITHOUT the auth gate, guarded only
 * by a build-time NEXT_PUBLIC_E2E_* flag. Register G23: one such flag set in a prod
 * build = a live unauthenticated bypass. The durable fix is a `NODE_ENV === "production"`
 * → notFound() guard that runs FIRST, before the flag check — so a stray flag can never
 * expose the route in prod. This test asserts, by source position, that ordering on all
 * four pages (a positional guard is exactly what a future edit could silently reorder).
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROD_GUARD = 'process.env.NODE_ENV === "production"';

const PAGES = [
  { file: "src/app/kcal-e2e/page.tsx", flag: "NEXT_PUBLIC_E2E_KCAL" },
  { file: "src/app/reminder-e2e/[clientId]/page.tsx", flag: "NEXT_PUBLIC_E2E_REMINDER" },
  { file: "src/app/portal/feedback-e2e/page.tsx", flag: "NEXT_PUBLIC_E2E_FEEDBACK" },
  { file: "src/app/portal/firma-e2e/[requestId]/page.tsx", flag: "NEXT_PUBLIC_E2E_SIGN" },
];

describe("G23 — e2e bypass pages hard-wall against production", () => {
  for (const { file, flag } of PAGES) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    // Match the GUARD expression (not the docstring mention of the flag).
    const flagGuard = `process.env.${flag} !== "1"`;

    test(`${file}: production guard present, calls notFound, precedes the flag guard`, () => {
      const prodIdx = src.indexOf(PROD_GUARD);
      const flagIdx = src.indexOf(flagGuard);
      expect(prodIdx, "missing NODE_ENV production guard").toBeGreaterThanOrEqual(0);
      expect(flagIdx, "missing NEXT_PUBLIC_E2E flag guard").toBeGreaterThanOrEqual(0);
      // The production guard MUST come first — a flag can never win in prod.
      expect(prodIdx, "production guard must precede the flag guard").toBeLessThan(flagIdx);
      // Both guards 404 via notFound().
      expect(src).toMatch(/notFound\(\)/);
    });
  }
});
