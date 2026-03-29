/**
 * Food/Macro Database Module
 *
 * Provides:
 * - CSV parser for Roberto's 179-item food database
 * - Italian decimal notation handling
 * - Swappable data source interface for future Google Sheets support
 */

export type {
  FoodItem,
  ParseWarning,
  FoodDatabaseResult,
  FoodDataSource,
} from "./types";

export {
  parseFoodCsv,
  parseItalianNumber,
  CsvFileDataSource,
  InMemoryCsvDataSource,
  type CsvParseOptions,
} from "./parser";
