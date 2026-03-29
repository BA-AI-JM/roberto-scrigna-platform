/**
 * Types for the food/macro database.
 */

/** A single food item with macro nutritional data per 100g */
export interface FoodItem {
  /** Unique identifier (lowercase, hyphenated) */
  id: string;
  /** Display name (original Italian or translated) */
  name: string;
  /** Energy in kcal per 100g */
  kcalPer100g: number;
  /** Protein in grams per 100g */
  proteinPer100g: number;
  /** Carbohydrates in grams per 100g */
  carbsPer100g: number;
  /** Fat in grams per 100g */
  fatPer100g: number;
  /** Optional category tag */
  category?: string;
  /** Source row number in original CSV (for traceability) */
  sourceRow?: number;
}

/** Warning emitted during parsing (skipped rows, data issues) */
export interface ParseWarning {
  row: number;
  message: string;
  rawData?: string;
}

/** Result of parsing the food database */
export interface FoodDatabaseResult {
  items: FoodItem[];
  warnings: ParseWarning[];
  totalRowsProcessed: number;
}

/**
 * Swappable data source interface.
 * Implement this to pull food data from CSV, Google Sheets, or any other source.
 */
export interface FoodDataSource {
  /** Human-readable name for logging */
  readonly name: string;
  /** Load all food items from the source */
  load(): Promise<FoodDatabaseResult>;
}
