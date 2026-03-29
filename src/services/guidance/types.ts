/**
 * Types for the conditional guidance block system.
 *
 * Guidance blocks are conditional Italian-language content sections
 * selected for each client based on their body composition, training,
 * lifestyle, and dietary data. They appear in the PDF nutrition report.
 *
 * Part 1.7 of the build plan: 23 conditional blocks covering:
 * - Body composition status
 * - Energy balance phase
 * - Training profile
 * - Lifestyle factors
 * - Dietary adaptations
 * - Mandatory disclosures
 */

import type { BodyComposition, ClientSnapshot, DayType } from "../../engine/types";
import type {
  AnamnestiAllenamento,
  Obiettivo,
  StileVita,
} from "../../pdf/types";

// ── Context ──────────────────────────────────────────────────────────────────

/** All client data available when evaluating guidance block conditions */
export interface GuidanceBlockContext {
  /** Client measurement snapshot */
  snapshot: ClientSnapshot;
  /** Calculated body composition */
  bodyComposition: BodyComposition;
  /** Training profile */
  allenamento?: AnamnestiAllenamento;
  /** Lifestyle profile */
  stileVita?: StileVita;
  /** Client objective */
  obiettivo?: Obiettivo;
  /** Unique day types present in the week schedule */
  dayTypes: DayType[];
  /** Number of training days per week */
  trainingDaysPerWeek: number;
  /** Whether the plan is in a caloric deficit */
  isDeficit: boolean;
  /** Whether the plan is in a caloric surplus */
  isSurplus: boolean;
  /** Average weekly TDEE across all day types */
  avgWeeklyTdeeKcal: number;
  /** Allergens excluded from meal plan */
  excludedAllergens?: string[];
}

// ── Block Definition ─────────────────────────────────────────────────────────

/** Category grouping for guidance blocks */
export type GuidanceBlockCategory =
  | "body_composition"
  | "energy_balance"
  | "training"
  | "lifestyle"
  | "dietary"
  | "disclosure";

/** Priority order — lower number = higher priority in PDF */
export type GuidanceBlockPriority = 1 | 2 | 3;

/**
 * A single conditional guidance block.
 * Content is in Italian and uses Markdown formatting.
 */
export interface ConditionalGuidanceBlock {
  /** Unique identifier (snake_case) */
  id: string;
  /** Section title (Italian) */
  title: string;
  /**
   * Content body in Markdown (Italian).
   * May reference client data via template tokens: {name}, {bf_pct}, etc.
   * Actual interpolation is done by renderGuidanceBlock().
   */
  content: string;
  /** Category for PDF section grouping */
  category: GuidanceBlockCategory;
  /** Display priority within category */
  priority: GuidanceBlockPriority;
  /**
   * Inclusion condition — returns true if this block should appear.
   * Called with the client's complete context.
   */
  condition: (ctx: GuidanceBlockContext) => boolean;
}

/** A rendered guidance block with resolved content */
export interface RenderedGuidanceBlock {
  /** Block identifier */
  id: string;
  /** Section title */
  title: string;
  /** Rendered Markdown content */
  content: string;
  /** Category */
  category: GuidanceBlockCategory;
  /** Priority */
  priority: GuidanceBlockPriority;
}

/** Result of guidance block selection for a client */
export interface GuidanceSelectionResult {
  /** All blocks selected for this client, sorted by category and priority */
  blocks: RenderedGuidanceBlock[];
  /** Total number of blocks selected */
  count: number;
  /** IDs of blocks not included (condition evaluated to false) */
  excluded: string[];
}
