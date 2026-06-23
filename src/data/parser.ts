/**
 * CSV parser for Roberto's macro food database.
 *
 * Handles:
 * - Italian decimal notation (commas instead of dots)
 * - Empty/TBD rows (skipped with warnings)
 * - Semicolon-delimited CSV format
 * - Rice cakes entry added if missing
 *
 * Expected CSV columns (semicolon separated):
 * Name;Kcal;Protein;Carbs;Fat[;Category]
 */

import type { FoodItem, ParseWarning, FoodDatabaseResult, FoodDataSource } from "./types";

// ── Italian Decimal Handling ──────────────────────────────────────────────────

/**
 * Parse an Italian-format number (uses comma as decimal separator).
 * "12,5" → 12.5
 * "100" → 100
 * "" or "TBD" → NaN
 */
export function parseItalianNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "tbd" || trimmed === "-" || trimmed === "n/a") {
    return NaN;
  }
  // Replace comma with dot for decimal
  return parseFloat(trimmed.replace(",", "."));
}

/**
 * Generate a stable ID from a food name.
 * "Petto di Pollo" → "petto-di-pollo"
 */
function nameToId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9àèéìòù\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Rice Cakes Default Entry ──────────────────────────────────────────────────

const RICE_CAKES_ENTRY: FoodItem = {
  id: "gallette-di-riso",
  name: "Gallette di Riso",
  kcalPer100g: 387,
  proteinPer100g: 8,
  carbsPer100g: 82,
  fatPer100g: 2.8,
  category: "cereali",
};

// ── CSV Parser ────────────────────────────────────────────────────────────────

export interface CsvParseOptions {
  /** Column delimiter (default: ";") */
  delimiter?: string;
  /** Whether the first row is a header (default: true) */
  hasHeader?: boolean;
  /** Add rice cakes entry if not found in data (default: true) */
  addRiceCakes?: boolean;
}

/**
 * Parse a CSV string containing Roberto's food database.
 *
 * @param csvContent - Raw CSV content
 * @param options - Parsing options
 * @returns Parsed food items with warnings
 */
export function parseFoodCsv(
  csvContent: string,
  options: CsvParseOptions = {}
): FoodDatabaseResult {
  const delimiter = options.delimiter ?? ";";
  const hasHeader = options.hasHeader ?? true;
  const addRiceCakes = options.addRiceCakes ?? true;

  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const items: FoodItem[] = [];
  const warnings: ParseWarning[] = [];
  let totalRowsProcessed = 0;

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;
    const row = i + 1; // 1-based row number
    totalRowsProcessed++;

    const cols = line.split(delimiter).map((c) => c.trim());

    // Need at least: Name, Kcal, Protein, Carbs, Fat
    if (cols.length < 5) {
      warnings.push({
        row,
        message: `Insufficient columns (${cols.length} < 5)`,
        rawData: line,
      });
      continue;
    }

    const name = cols[0]!;
    if (!name || name.toLowerCase() === "tbd" || name === "-") {
      warnings.push({
        row,
        message: "Empty or TBD name — skipping",
        rawData: line,
      });
      continue;
    }

    const kcal = parseItalianNumber(cols[1]!);
    const protein = parseItalianNumber(cols[2]!);
    const carbs = parseItalianNumber(cols[3]!);
    const fat = parseItalianNumber(cols[4]!);

    // Skip rows where any macro is missing/invalid
    if (isNaN(kcal) || isNaN(protein) || isNaN(carbs) || isNaN(fat)) {
      warnings.push({
        row,
        message: `Invalid numeric data: kcal=${cols[1]}, protein=${cols[2]}, carbs=${cols[3]}, fat=${cols[4]}`,
        rawData: line,
      });
      continue;
    }

    const category = cols.length > 5 ? cols[5] : undefined;

    items.push({
      id: nameToId(name),
      name,
      kcalPer100g: Math.round(kcal * 10) / 10,
      proteinPer100g: Math.round(protein * 10) / 10,
      carbsPer100g: Math.round(carbs * 10) / 10,
      fatPer100g: Math.round(fat * 10) / 10,
      category: category || undefined,
      sourceRow: row,
    });
  }

  // Add rice cakes if not found
  if (addRiceCakes) {
    const hasRiceCakes = items.some(
      (item) =>
        item.id === "gallette-di-riso" ||
        item.name.toLowerCase().includes("gallette") ||
        item.name.toLowerCase().includes("rice cake")
    );
    if (!hasRiceCakes) {
      items.push(RICE_CAKES_ENTRY);
    }
  }

  return { items, warnings, totalRowsProcessed };
}

// ── CSV Data Source Implementation ────────────────────────────────────────────

/**
 * File-based CSV data source.
 * Reads Roberto's CSV from the filesystem.
 */
export class CsvFileDataSource implements FoodDataSource {
  readonly name = "CSV File";

  constructor(
    private readonly filePath: string,
    private readonly options: CsvParseOptions = {}
  ) {}

  async load(): Promise<FoodDatabaseResult> {
    const file = Bun.file(this.filePath);
    const content = await file.text();
    return parseFoodCsv(content, this.options);
  }
}

// ── v3 CSV Parser (RFC-4180, comma-delimited, 9 columns) ──────────────────────
//
// Separate from the dormant v2 `parseFoodCsv` above (which stays unchanged).
// v3 is the delivered Macro_Database_v3_FINAL.csv: comma-delimited, dot decimals,
// and — critically — RFC-4180 QUOTED (43 rows have commas inside quoted Food
// Names, e.g. "Couscous, durum wheat semolina (dry)"), so fields must be parsed
// quote-aware, never via a naive split(",").

/** Exact v3 header names (columns are mapped by name, not fixed index). */
const V3_HEADERS = [
  "Category",
  "Item Number",
  "Food Name",
  "Calories (kcal)",
  "Protein (g)",
  "Carbs (g)",
  "Fat (g)",
  "Sodium (mg)",
  "Fibre (g)",
] as const;

/**
 * Tokenise one RFC-4180 CSV line: comma-separated, double-quoted fields may
 * contain commas; `""` is an escaped quote. (v3 has no newlines inside fields,
 * so line-by-line tokenising is safe.)
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parse a numeric v3 cell with plain parseFloat (dot decimals). Throws on any
 * comma inside the cell — the v2 European-decimal trap guard: v3 numeric fields
 * must be comma-free (a comma here means columns were mis-split or the file is
 * v2-style).
 */
function parseV3Number(raw: string, row: number, column: string): number {
  if (raw.includes(",")) {
    throw new Error(
      `v3 CSV row ${row}: comma in numeric column "${column}" ("${raw}") — European-decimal trap; v3 numerics must be comma-free.`
    );
  }
  const n = parseFloat(raw);
  if (Number.isNaN(n)) {
    throw new Error(`v3 CSV row ${row}: non-numeric "${column}" ("${raw}").`);
  }
  return n;
}

/**
 * Parse the v3 food database CSV into FoodItem[] (per-100g, incl. fibreG +
 * sodiumMg + verbatim category). Columns mapped by header name. Requires ≥ 9
 * columns. For the 4 cross-category duplicate names (Banana/Apple/Blueberries/
 * Kiwi, present in both Carbohydrate Sources and Fruit) the Fruit-category row
 * is preferred. Throws on malformed input (rather than skipping with warnings)
 * — this is a known, clean, delivered file.
 */
export function parseFoodV3Csv(csvContent: string): FoodItem[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("v3 CSV: no data rows.");
  }

  const header = parseCsvLine(lines[0]!);
  if (header.length < 9) {
    throw new Error(`v3 CSV: header has ${header.length} columns (< 9).`);
  }
  const idx: Record<string, number> = {};
  for (const name of V3_HEADERS) {
    const at = header.indexOf(name);
    if (at === -1) {
      throw new Error(`v3 CSV: missing required column "${name}".`);
    }
    idx[name] = at;
  }

  // Fruit-preferred dedup keyed by exact Food Name.
  const byName = new Map<string, FoodItem>();

  for (let i = 1; i < lines.length; i++) {
    const row = i + 1; // 1-based
    const cols = parseCsvLine(lines[i]!);
    if (cols.length < 9) {
      throw new Error(`v3 CSV row ${row}: ${cols.length} columns (< 9).`);
    }

    const name = cols[idx["Food Name"]!]!;
    const category = cols[idx["Category"]!]!;
    const item: FoodItem = {
      id: nameToId(name),
      name,
      kcalPer100g: parseV3Number(cols[idx["Calories (kcal)"]!]!, row, "Calories (kcal)"),
      proteinPer100g: parseV3Number(cols[idx["Protein (g)"]!]!, row, "Protein (g)"),
      carbsPer100g: parseV3Number(cols[idx["Carbs (g)"]!]!, row, "Carbs (g)"),
      fatPer100g: parseV3Number(cols[idx["Fat (g)"]!]!, row, "Fat (g)"),
      sodiumMg: parseV3Number(cols[idx["Sodium (mg)"]!]!, row, "Sodium (mg)"),
      fibreG: parseV3Number(cols[idx["Fibre (g)"]!]!, row, "Fibre (g)"),
      category,
      sourceRow: row,
    };

    const existing = byName.get(name);
    // Keep the Fruit row when a name appears in two categories.
    if (!existing || category === "Fruit") {
      byName.set(name, item);
    }
  }

  return [...byName.values()];
}

/**
 * In-memory CSV data source (useful for testing or embedded data).
 */
export class InMemoryCsvDataSource implements FoodDataSource {
  readonly name = "In-Memory CSV";

  constructor(
    private readonly csvContent: string,
    private readonly options: CsvParseOptions = {}
  ) {}

  async load(): Promise<FoodDatabaseResult> {
    return parseFoodCsv(this.csvContent, this.options);
  }
}
