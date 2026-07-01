/**
 * Guard: the BUNDLED food DB (food-data.generated.ts) must exactly match a fresh
 * parse of the source CSV. This is what makes the "no runtime readFileSync" fix
 * safe — the deployed serverless function ships FOOD_DATA (bundled), and this test
 * proves it equals what the old runtime `parseFoodV3Csv(readFileSync(CSV))` produced.
 *
 * If this fails after editing the CSV: regenerate with
 *   bun run scripts/gen-food-data.ts
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFoodV3Csv } from "../../parser";
import { FOOD_DATA } from "../food-data.generated";

// Fresh parse of the source CSV. The CSV exists on dev/CI disk; it is NOT read at
// runtime in production (that was the ENOENT bug) — only here, to verify sync.
const CSV_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "Macro_Database_v3_FINAL.csv"
);
const fresh = parseFoodV3Csv(readFileSync(CSV_PATH, "utf8"));

describe("food-data.generated stays in sync with the CSV", () => {
  test("bundled FOOD_DATA deep-equals a fresh parse of Macro_Database_v3_FINAL.csv", () => {
    // Byte-identical to the old runtime parse → foodByName/classifyFood/resolveFood
    // behave exactly as before. Regenerate if this drifts.
    expect(FOOD_DATA).toEqual(fresh);
  });

  test("food count matches the parsed CSV and is non-trivial", () => {
    expect(FOOD_DATA.length).toBe(fresh.length);
    expect(FOOD_DATA.length).toBeGreaterThan(100);
  });

  test("known foods are present (sanity)", () => {
    const names = new Set(FOOD_DATA.map((f) => f.name));
    for (const n of [
      "Egg white (raw)",
      "Avocado (flesh)",
      "Banana (peeled)",
      "Chicken breast (raw)",
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });
});
