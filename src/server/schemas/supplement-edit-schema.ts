/**
 * Zod schema for a single editable supplement in plan.saveEdits.
 *
 * Widened (#23) to carry the extended SupplementEntry fields
 * (notes / frequency / libraryId / isCustom) so the Integratori library + custom
 * picker round-trips them into daily_targets.plan_bundle.supplements instead of
 * Zod stripping them on save. Additive: name/dosage/timing/rationale unchanged.
 *
 * Kept standalone (zod-only, no router/server-only imports) so it is unit-testable.
 */
import { z } from "zod/v4";

export const supplementEditItemSchema = z.object({
  name: z.string().max(200),
  dosage: z.string().max(200),
  timing: z.string().max(500),
  rationale: z.string().max(2000).optional(),
  // ── #23 additive (match the extended SupplementEntry shape) ──
  notes: z.string().max(2000).optional(),
  frequency: z.string().max(200).optional(),
  libraryId: z.string().max(200).optional(),
  isCustom: z.boolean().optional(),
});

export type SupplementEdit = z.infer<typeof supplementEditItemSchema>;
