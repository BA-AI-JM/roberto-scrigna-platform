/**
 * Guidance Block System — Public API
 *
 * Exports the 23 conditional guidance blocks, selection logic,
 * and all associated types for use in the PDF pipeline and tRPC routers.
 */

// Types
export type {
  GuidanceBlockContext,
  GuidanceBlockCategory,
  GuidanceBlockPriority,
  ConditionalGuidanceBlock,
  RenderedGuidanceBlock,
  GuidanceSelectionResult,
} from "./types";

// Block library
export { GUIDANCE_BLOCKS } from "./blocks";

// Selection logic
export {
  selectGuidanceBlocks,
  listAllGuidanceBlocks,
} from "./selector";
