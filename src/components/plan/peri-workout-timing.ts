/**
 * #18 nutrient timing — pure helpers for the peri-workout display: the timed
 * training-session box + PRE / INTRA / POST grouping around it.
 *
 * DISPLAY-ONLY. No engine/generation change: the training time comes from intake
 * (_intake.training_sessions, PR #32) and the pre/post meals are identified from
 * the ALREADY-generated slots by slot id. Intra is fluid/electrolyte guidance
 * (prose), not a generated meal.
 */

/** Subset of an intake training session we read for timing. */
export interface RawSession {
  startTime?: string;
  endTime?: string;
  duration_min?: number;
}

/** Canonical peri-workout guidance (mirrors the blocks.ts prose table). */
export const PERI_WORKOUT_GUIDANCE = {
  pre: { label: "Pre-allenamento", window: "1–2h prima", text: "Carboidrati complessi + proteine" },
  intra: { label: "Intra-allenamento", window: ">90 min", text: "Carboidrati semplici + elettroliti" },
  post: { label: "Post-allenamento", window: "entro 60 min", text: "Proteine + carboidrati" },
} as const;

/** True for the base training day-type AND the #17 intensity tiers. */
export function isTrainingDayType(dayType: string): boolean {
  return dayType === "training" || dayType.startsWith("training_");
}

/** "18:00–19:30" | "18:00" | null. */
export function formatSessionClock(startTime?: string, endTime?: string): string | null {
  if (!startTime) return null;
  return endTime ? `${startTime}–${endTime}` : startTime;
}

/**
 * First session (Mon→Sun) carrying a startTime — the representative training
 * time shown on the (deduplicated) training day-type plan.
 */
export function firstTrainingTime(
  sessionsByDay: Record<string, RawSession[]> | undefined | null
): { startTime?: string; endTime?: string } {
  if (!sessionsByDay) return {};
  for (let i = 0; i < 7; i++) {
    const s = sessionsByDay[String(i)]?.find((x) => x?.startTime);
    if (s) return { startTime: s.startTime, endTime: s.endTime };
  }
  return {};
}

/** A meal slot (lite) for pre/post mapping. */
export interface SlotLite {
  slot: string;
  mealName?: string;
}

/**
 * The pre/post slot for a day, by slot id (display grouping only — never changes
 * generation). POST = the "post_workout" slot; PRE = an explicit "pre_workout"
 * slot, else the snack scheduled before training ("snack_2" in the 6-meal plan).
 */
export function periSlot(slots: SlotLite[], which: "pre" | "post"): SlotLite | undefined {
  if (which === "post") return slots.find((s) => s.slot === "post_workout");
  return slots.find((s) => s.slot === "pre_workout") ?? slots.find((s) => s.slot === "snack_2");
}

/** The full timing model for a day. `show=false` → render nothing (graceful). */
export interface PeriWorkoutModel {
  show: boolean;
  clock: string | null;
  preMeal?: string;
  postMeal?: string;
}

/**
 * Gate on BOTH a training day AND a known training time. No time (or a non-
 * training day) → show=false, so the caller renders the normal meal list with no
 * empty box.
 */
export function buildPeriWorkout(
  dayType: string,
  slots: SlotLite[],
  session?: { startTime?: string; endTime?: string }
): PeriWorkoutModel {
  const clock = formatSessionClock(session?.startTime, session?.endTime);
  if (!isTrainingDayType(dayType) || !clock) {
    return { show: false, clock: null };
  }
  return {
    show: true,
    clock,
    preMeal: periSlot(slots, "pre")?.mealName,
    postMeal: periSlot(slots, "post")?.mealName,
  };
}
