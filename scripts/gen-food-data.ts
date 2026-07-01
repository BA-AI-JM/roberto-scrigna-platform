/**
 * Generator: Macro_Database_v3_FINAL.csv → src/data/meals/food-data.generated.ts
 *
 * WHY: the meal engine used to load the food DB with readFileSync(CSV) at runtime,
 * with a path computed from import.meta.url. Next's file tracer can't resolve that
 * computed path, so the CSV was NOT bundled into the Vercel serverless function →
 * ENOENT at runtime → plan.generate / plan.foodCatalogue 500 in production.
 *
 * This script runs the REAL parseFoodV3Csv on the CSV at commit time and emits the
 * parsed rows as a bundled TS module, so the data ships inside the JS bundle (always
 * traced, no fs at runtime). The emitted array is exactly parseFoodV3Csv's output —
 * downstream (foodByName / classifyFood / resolveFood) behaves byte-identically.
 *
 * REGENERATE after editing the CSV:  bun run scripts/gen-food-data.ts
 * (a test asserts the generated file matches a fresh parse of the CSV, so a stale
 * regeneration fails CI.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFoodV3Csv } from "../src/data/parser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "src/data/Macro_Database_v3_FINAL.csv");
const OUT = join(ROOT, "src/data/meals/food-data.generated.ts");

const items = parseFoodV3Csv(readFileSync(CSV, "utf8"));

const header = `// AUTO-GENERATED from src/data/Macro_Database_v3_FINAL.csv by
// scripts/gen-food-data.ts. DO NOT EDIT BY HAND.
// Regenerate:  bun run scripts/gen-food-data.ts
//
// This bundles the v3 food database into the JS so it is always included in the
// serverless build (no runtime readFileSync of a computed path → no ENOENT).
import type { FoodItem } from "../types";

export const FOOD_DATA: FoodItem[] = ${JSON.stringify(items, null, 2)};
`;

writeFileSync(OUT, header, "utf8");
console.log(`Wrote ${OUT} — ${items.length} foods.`);
