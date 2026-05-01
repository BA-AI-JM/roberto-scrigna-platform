/**
 * Stage 6 — MET Assignment (Profile-Based)
 *
 * Spec v4.4.1: Assign net MET values per zone using the sport profile.
 *
 * The spec defines three metabolic profiles:
 *
 * Profile G (Grappling, MMA, Strength) — isometric-heavy
 *   Base gross METs: Z1=2.3, Z2=4.5, Z3=7.0, Z4=8.5, Z5=10.0
 *   Caps: Z4=8.0, Z5=8.5
 *   Net rule: gross - 1.0
 *   Resulting net: Z1(moving)=1.3, Z1(standing)=1.0, Z2=3.5, Z3=6.0, Z4=7.0, Z5=7.5
 *
 * Profile L (Striking, HIIT, Team, Racket) — locomotion-dominant
 *   Base gross METs: Z1=2.3, Z2=4.5, Z3=7.0, Z4=9.0, Z5=9.5 (higher caps)
 *   Net rule: gross - 0.5
 *   Resulting net: Z1(moving)=1.8, Z1(standing)=1.5, Z2=4.0, Z3=6.5, Z4=8.5, Z5=9.0
 *
 * Profile CYCLIC (running, cycling, rowing) — steady-state aerobic
 *   No caps, no subtraction, E=1.00 always
 *   Use gross METs directly: Z1=2.3, Z2=4.5, Z3=7.0, Z4=8.5, Z5=10.0
 *
 * STRENGTH Conservative Override (hypertrophy, strength, power, deload):
 *   Z3-Z5 all capped at 6.0 gross → 5.0 net
 *
 * Below-Z1 classification:
 *   Option C (warm-up/structured low-intensity): net MET 0.8–1.2 (use 1.0)
 *   Option D (planned rest/inter-set standing):  net MET 0.3–0.5 (use 0.4)
 *
 * STRENGTH Z1 standing character: gross 2.3 → net = 2.3 - 1.0 - 0.3 = 1.0
 *   (extra 0.3 reduction because HR in Z1 during strength is partly sympathetic,
 *    not metabolic demand — spec §5)
 */

import type { CategoryId, SessionType, SportProfile, MetabolicProfile } from "./types";

// ── MET Constants ─────────────────────────────────────────────────────────────

/** Base gross METs by zone — used by all profiles as starting point */
const BASE_GROSS_MET = {
  z1: 2.3,
  z2: 4.5,
  z3: 7.0,
  z4: 8.5,
  z5: 10.0,
} as const;

/** Profile G gross MET caps (isometric-heavy) */
const PROFILE_G_CAPS = { z4: 8.0, z5: 8.5 } as const;
/** Profile L gross MET caps (locomotion-dominant) */
const PROFILE_L_CAPS = { z4: 9.0, z5: 9.5 } as const;

/** Net subtraction per profile */
const NET_SUBTRACTION: Record<MetabolicProfile, number> = {
  G: 1.0,
  L: 0.5,
  CYCLIC: 0.0, // No subtraction — use gross directly
};

/** STRENGTH conservative override: Z3-Z5 gross MET cap */
const STRENGTH_CONSERVATIVE_GROSS_CAP = 6.0;

/** Below-Z1 net METs */
const BELOW_Z1_WARMUP_NET = 1.0;  // Option C
const BELOW_Z1_REST_NET = 0.4;    // Option D

/** Z1 standing extra reduction for STRENGTH (sympathetic drive correction) */
const STRENGTH_Z1_STANDING_EXTRA_REDUCTION = 0.3;

// ── Profile Resolver ──────────────────────────────────────────────────────────

/** Map category to metabolic profile */
const CATEGORY_PROFILE: Record<CategoryId, MetabolicProfile> = {
  GRAPPLING: "G",
  STRIKING:  "L",
  MMA:       "G",
  STRENGTH:  "G",
  HIIT:      "L",
  CYCLIC:    "CYCLIC",
  TEAM:      "L",
  RACKET:    "L",
};

/** Compute the net METs for a given profile and category */
function buildNetMETs(
  profile: MetabolicProfile,
  isStrengthCategory: boolean
): SportProfile["netMETs"] {
  const sub = NET_SUBTRACTION[profile];

  let grossZ3: number = BASE_GROSS_MET.z3;
  // Profile G: gross METs are capped DOWN (isometric-heavy, less aerobic demand)
  // Profile L: gross METs use higher profile-specific values for Z4/Z5 (locomotion-dominant)
  // Profile CYCLIC: use base gross METs directly
  let grossZ4: number = profile === "G"
    ? PROFILE_G_CAPS.z4          // 8.0 (base 8.5 capped down)
    : profile === "L"
    ? PROFILE_L_CAPS.z4          // 9.0 (higher than base 8.5)
    : BASE_GROSS_MET.z4;         // 8.5 for CYCLIC
  let grossZ5: number = profile === "G"
    ? PROFILE_G_CAPS.z5          // 8.5 (base 10.0 capped down)
    : profile === "L"
    ? PROFILE_L_CAPS.z5          // 9.5 (higher than base 10.0? no — 9.5 < 10.0)
    : BASE_GROSS_MET.z5;         // 10.0 for CYCLIC

  // STRENGTH conservative override: Z3-Z5 capped at 6.0 gross → 5.0 net
  if (isStrengthCategory && profile === "G") {
    grossZ3 = Math.min(grossZ3, STRENGTH_CONSERVATIVE_GROSS_CAP);
    grossZ4 = Math.min(grossZ4, STRENGTH_CONSERVATIVE_GROSS_CAP);
    grossZ5 = Math.min(grossZ5, STRENGTH_CONSERVATIVE_GROSS_CAP);
  }

  const z1GrossBase = BASE_GROSS_MET.z1;
  const netZ1Moving = z1GrossBase - sub;
  // STRENGTH standing Z1: additional 0.3 reduction for sympathetic drive
  const netZ1Standing = isStrengthCategory
    ? netZ1Moving - STRENGTH_Z1_STANDING_EXTRA_REDUCTION
    : netZ1Moving;

  return {
    belowZ1WarmUp: BELOW_Z1_WARMUP_NET,
    belowZ1Rest: BELOW_Z1_REST_NET,
    z1Standing: netZ1Standing,
    z1Moving: netZ1Moving,
    z2: BASE_GROSS_MET.z2 - sub,
    z3: grossZ3 - sub,
    z4: grossZ4 - sub,
    z5: grossZ5 - sub,
  };
}

// ── Session-Type Defaults ─────────────────────────────────────────────────────

/**
 * Per-session-type defaults for below-Z1 classification and Z1 character.
 *
 * Key format: `${CategoryId}/${sessionType}`
 *
 * belowZ1Default:
 *   "C" = Option C (warm-up / structured low-intensity)
 *   "D" = Option D (planned rest / inter-set standing)
 *
 * z1Character:
 *   "standing" = standing recovery between sets (strength / grappling sparring)
 *   "moving"   = active low-intensity movement (cardio)
 *
 * Spec §2 per-session defaults (representative rows — unspecified rows inherit
 * category defaults defined in the fallback functions below):
 *   GRAPPLING/sparring  → Z1=Standing, <Z1=D(0.4)
 *   GRAPPLING/mixed     → Z1=Moving,   <Z1=C(1.0)
 *   GRAPPLING/tech      → Z1=Moving,   <Z1=C(1.0)
 *   GRAPPLING/open      → Z1=Moving,   <Z1=C(1.0)
 *   GRAPPLING/comp      → Z1=Moving,   <Z1=C(1.0)
 *   STRENGTH/circuit    → Z1=Moving,   <Z1=D(0.5)  (higher aerobic demand)
 *   MMA/sparring        → Z1=Standing, <Z1=D(0.4)
 *   MMA/striking        → Z1=Moving,   <Z1=C(1.0)  (locomotion-dominant)
 *   MMA/grappling       → Z1=Standing, <Z1=D(0.4)
 */
interface SessionDefaults {
  belowZ1Default: "C" | "D";
  z1Character: "standing" | "moving";
}

const SESSION_DEFAULTS: Partial<Record<string, SessionDefaults>> = {
  // GRAPPLING — sparring is isometric/standing; all other types are active/moving
  "GRAPPLING/sparring": { belowZ1Default: "D", z1Character: "standing" },
  "GRAPPLING/mixed":    { belowZ1Default: "C", z1Character: "moving" },
  "GRAPPLING/tech":     { belowZ1Default: "C", z1Character: "moving" },
  "GRAPPLING/open":     { belowZ1Default: "C", z1Character: "moving" },
  "GRAPPLING/comp":     { belowZ1Default: "C", z1Character: "moving" },

  // STRENGTH — circuit has higher aerobic demand; other types are conventional rest-based
  "STRENGTH/circuit":      { belowZ1Default: "D", z1Character: "moving" },
  "STRENGTH/hypertrophy":  { belowZ1Default: "D", z1Character: "standing" },
  "STRENGTH/strength":     { belowZ1Default: "D", z1Character: "standing" },
  "STRENGTH/power":        { belowZ1Default: "D", z1Character: "standing" },

  // MMA — sparring and grappling-focused are isometric; striking-focused is locomotion
  "MMA/sparring":   { belowZ1Default: "D", z1Character: "standing" },
  "MMA/grappling":  { belowZ1Default: "D", z1Character: "standing" },
  "MMA/striking":   { belowZ1Default: "C", z1Character: "moving" },
  "MMA/mixed":      { belowZ1Default: "C", z1Character: "moving" },
  "MMA/comp":       { belowZ1Default: "C", z1Character: "moving" },
};

/**
 * Resolve below-Z1 default and Z1 character for a given category + session type.
 * Falls back to category-level defaults when no per-session row exists.
 */
function resolveSessionDefaults(
  categoryId: CategoryId,
  sessionType: SessionType
): SessionDefaults {
  const key = `${categoryId}/${sessionType}`;
  const perSession = SESSION_DEFAULTS[key];
  if (perSession != null) return perSession;

  // Category-level fallbacks
  const categoryBelowZ1Default: "C" | "D" = categoryId === "STRENGTH" ? "D" : "C";
  const categoryZ1Character: "standing" | "moving" =
    categoryId === "STRENGTH" ? "standing" : "moving";

  return {
    belowZ1Default: categoryBelowZ1Default,
    z1Character: categoryZ1Character,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the sport profile for a given category and session type.
 * This is Stage 6 of the SCP pipeline.
 *
 * @param categoryId - The sport category (GRAPPLING, STRENGTH, etc.)
 * @param sessionType - The specific session type within the category
 * @returns Fully resolved SportProfile with spec-correct net METs
 */
export function getSportProfile(
  categoryId: CategoryId,
  sessionType: SessionType
): SportProfile {
  let profile = CATEGORY_PROFILE[categoryId];
  const isStrengthCategory = categoryId === "STRENGTH";

  // Finding 5 — MMA striking-focus sessions override to Profile L
  // Spec: MMA with session_type "striking" uses locomotion-dominant METs
  if (categoryId === "MMA" && sessionType === "striking") {
    profile = "L";
  }

  const sessionDefs = resolveSessionDefaults(categoryId, sessionType);

  return {
    categoryId,
    sessionType,
    metabolicProfile: profile,
    isStrengthCategory,
    netMETs: buildNetMETs(profile, isStrengthCategory),
    belowZ1Default: sessionDefs.belowZ1Default,
    z1Character: sessionDefs.z1Character,
  };
}

/** Expose category→profile mapping for consumers */
export { CATEGORY_PROFILE };
