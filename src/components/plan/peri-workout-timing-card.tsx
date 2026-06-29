"use client";

/**
 * #18 nutrient timing — the timed training-session box + PRE / INTRA / POST
 * grouping, shown on a training day when a training time is set. DISPLAY-ONLY.
 * Renders nothing when there's no training time (graceful). Shared by the coach
 * plan review (and reusable by the portal once it exposes the training time).
 */

import { buildPeriWorkout, PERI_WORKOUT_GUIDANCE, type SlotLite } from "./peri-workout-timing";

export interface PeriWorkoutTimingCardProps {
  dayType: string;
  slots: SlotLite[];
  startTime?: string;
  endTime?: string;
  /** Tighter spacing for the portal/mobile context. */
  compact?: boolean;
}

function PeriRow({
  label,
  window,
  guidance,
  meal,
}: {
  label: string;
  window: string;
  guidance: string;
  meal?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-zinc-100 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-800">
          {label} <span className="text-xs font-normal text-zinc-400">· {window}</span>
        </div>
        <div className="text-xs text-zinc-500">{meal ?? guidance}</div>
      </div>
    </div>
  );
}

export function PeriWorkoutTimingCard({
  dayType,
  slots,
  startTime,
  endTime,
  compact = false,
}: PeriWorkoutTimingCardProps) {
  const m = buildPeriWorkout(dayType, slots, { startTime, endTime });
  if (!m.show) return null;

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white ${compact ? "p-3" : "p-4"}`}
      data-testid="peri-workout-timing"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">
          Allenamento {m.clock}
        </span>
        <span className="text-xs text-zinc-400">Timing nutrizionale peri-workout</span>
      </div>
      <div>
        <PeriRow {...PERI_WORKOUT_GUIDANCE.pre} guidance={PERI_WORKOUT_GUIDANCE.pre.text} meal={m.preMeal} />
        {/* Intra is fluid/electrolyte guidance — prose only, never a generated meal. */}
        <PeriRow {...PERI_WORKOUT_GUIDANCE.intra} guidance={PERI_WORKOUT_GUIDANCE.intra.text} />
        <PeriRow {...PERI_WORKOUT_GUIDANCE.post} guidance={PERI_WORKOUT_GUIDANCE.post.text} meal={m.postMeal} />
      </div>
    </div>
  );
}
