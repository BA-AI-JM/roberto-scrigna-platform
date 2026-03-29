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
