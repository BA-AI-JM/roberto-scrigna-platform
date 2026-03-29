/**
 * Guidance Block Selector
 *
 * Evaluates each of the 23 conditional guidance blocks against the client's
 * context and returns a sorted, rendered list of applicable blocks.
 *
 * Category sort order: body_composition → energy_balance → training
 *                       → lifestyle → dietary → disclosure
 * Within category: sorted by priority ascending (1 = first).
 */

import { GUIDANCE_BLOCKS } from "./blocks";
import type {
  GuidanceBlockContext,
  GuidanceBlockCategory,
  GuidanceSelectionResult,
  RenderedGuidanceBlock,
} from "./types";

// ── Category Sort Order ───────────────────────────────────────────────────────

const CATEGORY_ORDER: Record<GuidanceBlockCategory, number> = {
  body_composition: 0,
  energy_balance: 1,
  training: 2,
  lifestyle: 3,
  dietary: 4,
  disclosure: 5,
} as const;

// ── Token Interpolation ───────────────────────────────────────────────────────

/** Template tokens available for interpolation in block content */
interface TemplateTokens {
  name?: string;
  bf_pct?: string;
  lean_mass?: string;
  fat_mass?: string;
  weight?: string;
  avg_kcal?: string;
  training_days?: string;
  sleep_hours?: string;
}

/**
 * Build template token map from the guidance context.
 */
function buildTokens(ctx: GuidanceBlockContext): TemplateTokens {
  return {
    bf_pct: ctx.bodyComposition.bodyFatPct.toFixed(1),
    lean_mass: ctx.bodyComposition.leanMassKg.toFixed(1),
    fat_mass: ctx.bodyComposition.fatMassKg.toFixed(1),
    weight: ctx.snapshot.weightKg.toFixed(1),
    avg_kcal: Math.round(ctx.avgWeeklyTdeeKcal).toString(),
    training_days: ctx.trainingDaysPerWeek.toString(),
    sleep_hours: ctx.stileVita?.sleepHours?.toFixed(1),
  };
}

/**
 * Interpolate template tokens in a content string.
 * Tokens are in the format {token_name}.
 */
function interpolate(content: string, tokens: TemplateTokens): string {
  return content.replace(
    /\{(\w+)\}/g,
    (match, key: string) => {
      const value = tokens[key as keyof TemplateTokens];
      return value ?? match; // leave unresolved tokens as-is
    }
  );
}

// ── Main Selector ─────────────────────────────────────────────────────────────

/**
 * Select and render all guidance blocks applicable to the given client context.
 *
 * Evaluates each block's condition function, filters to matching blocks,
 * interpolates template tokens, and sorts by category + priority.
 *
 * @param ctx - Complete client guidance context
 * @returns Selection result with rendered blocks, count, and excluded IDs
 */
export function selectGuidanceBlocks(
  ctx: GuidanceBlockContext
): GuidanceSelectionResult {
  const tokens = buildTokens(ctx);
  const selected: RenderedGuidanceBlock[] = [];
  const excluded: string[] = [];

  for (const block of GUIDANCE_BLOCKS) {
    let applies = false;
    try {
      applies = block.condition(ctx);
    } catch {
      // If condition throws, exclude the block (defensive)
      applies = false;
    }

    if (applies) {
      selected.push({
        id: block.id,
        title: block.title,
        content: interpolate(block.content, tokens),
        category: block.category,
        priority: block.priority,
      });
    } else {
      excluded.push(block.id);
    }
  }

  // Sort: category order first, then priority ascending within category
  selected.sort((a, b) => {
    const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (catDiff !== 0) return catDiff;
    return a.priority - b.priority;
  });

  return {
    blocks: selected,
    count: selected.length,
    excluded,
  };
}

/**
 * Get guidance blocks for a specific category only.
 *
 * @param ctx - Client guidance context
 * @param category - Category to filter to
 * @returns Rendered blocks matching the category, sorted by priority
 */
export function getGuidanceBlocksByCategory(
  ctx: GuidanceBlockContext,
  category: GuidanceBlockCategory
): RenderedGuidanceBlock[] {
  const result = selectGuidanceBlocks(ctx);
  return result.blocks.filter((b) => b.category === category);
}

/**
 * Get a single guidance block by ID if its condition is met.
 *
 * @param ctx - Client guidance context
 * @param blockId - Block identifier
 * @returns The rendered block if condition is met, null otherwise
 */
export function getGuidanceBlockById(
  ctx: GuidanceBlockContext,
  blockId: string
): RenderedGuidanceBlock | null {
  const block = GUIDANCE_BLOCKS.find((b) => b.id === blockId);
  if (!block) return null;

  let applies = false;
  try {
    applies = block.condition(ctx);
  } catch {
    return null;
  }

  if (!applies) return null;

  const tokens = buildTokens(ctx);
  return {
    id: block.id,
    title: block.title,
    content: interpolate(block.content, tokens),
    category: block.category,
    priority: block.priority,
  };
}

/**
 * List all 23 block IDs and titles without evaluating conditions.
 * Useful for building selection UIs or debug views.
 *
 * @returns Array of {id, title, category} for all blocks
 */
export function listAllGuidanceBlocks(): Array<{
  id: string;
  title: string;
  category: GuidanceBlockCategory;
  priority: number;
}> {
  return GUIDANCE_BLOCKS.map((b) => ({
    id: b.id,
    title: b.title,
    category: b.category,
    priority: b.priority,
  }));
}
