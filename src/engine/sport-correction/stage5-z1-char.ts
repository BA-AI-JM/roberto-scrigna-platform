/**
 * Stage 5 — Z1 Character Classification
 *
 * Spec v4.4.1: Z1 in strength training is metabolically different from Z1
 * in cardio sessions. Heart rate in the lower zones during resistance work is
 * often driven by sympathetic nervous system activation (post-set HR lingering),
 * not active aerobic demand.
 *
 * Classification rules (from SportProfile.z1Character):
 *   "standing" — strength / grappling sessions where Z1 is standing recovery
 *                between sets. Net MET = z1Standing (spec: 1.0 for STRENGTH/GRAPPLING)
 *   "moving"   — cardio sessions where Z1 is active low-intensity movement
 *                (light jog, walk, drill). Net MET = z1Moving (spec: 1.3–1.8)
 *
 * The actual net MET values are stored on the SportProfile.netMETs object and
 * applied in Stage 8. Stage 5 only classifies minutes, not METs.
 *
 * Spec worked example A.5 (BJJ, Profile G):
 *   Z1 character = Moving → z1Moving net MET = 1.3  ✅
 *
 * Spec worked example A.7 (Hypertrophy, Profile G, STRENGTH):
 *   Z1 character = Standing → z1Standing net MET = 1.0  ✅
 */

import type { Z1Character, SportProfile } from "./types";

/**
 * Classify Z1 minutes into standing vs active sub-types.
 *
 * @param z1Min - Total Z1 minutes (from adjusted zone data index 1)
 * @param sportProfile - Sport profile (provides z1Character)
 * @returns Z1 character breakdown
 */
export function classifyZ1Character(
  z1Min: number,
  sportProfile: SportProfile
): Z1Character {
  if (z1Min <= 0) {
    return { standingMin: 0, activeZ1Min: 0, totalZ1Min: 0 };
  }

  if (sportProfile.z1Character === "standing") {
    return {
      standingMin: z1Min,
      activeZ1Min: 0,
      totalZ1Min: z1Min,
    };
  }

  // "moving" — active low-intensity
  return {
    standingMin: 0,
    activeZ1Min: z1Min,
    totalZ1Min: z1Min,
  };
}
