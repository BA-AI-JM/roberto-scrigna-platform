/**
 * Services Module
 *
 * Exports the plan generation pipeline, supplement protocol system,
 * and narrative generation service.
 */

// Plan Generation Pipeline
export { generatePlan, serializePlanResult, deserializePlanResult } from "./plan-generator";
export type {
  PlanGenerationInput,
  PlanGenerationResult,
  SerializedPlanResult,
} from "./plan-generator";

// Supplement Protocol
export {
  generateSupplementProtocol,
  buildSupplementContext,
  getMasterSupplements,
  MASTER_SUPPLEMENTS,
} from "./supplements";
export type {
  SupplementContext,
  MasterSupplement,
  SupplementCategory,
} from "./supplements";

// Narrative Generation
export { generateNarratives, generateMonitoringConfig } from "./narrative";
export type { NarrativeContext } from "./narrative";
