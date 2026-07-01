/**
 * Snapshot column derivation — shared by client.editSnapshot (#5).
 *
 * Pure functions that turn an intake input + client context into the exact
 * client_snapshot column payload, mirroring createSnapshot's mapping
 * (week_schedule, engine-readable skinfold_data, body composition via
 * computeSnapshotBodyComp, notes). Keeping this in one place means a retroactive
 * edit rebuilds the row identically to a fresh capture.
 */

import { computeSnapshotBodyComp } from "./body-comp";

export interface SnapshotSkinfolds {
  triceps?: number;
  chest?: number;
  abdomen?: number;
  suprailiac?: number;
  subscapular?: number;
  thigh?: number;
  midaxillary?: number;
}

export interface SnapshotTrainingSession {
  modality: string;
  duration_min: number;
  rpe: number;
  startTime?: string;
  endTime?: string;
}

export interface SnapshotIntakeInput {
  weightKg?: number;
  heightCm?: number;
  circumferences?: Record<string, number | undefined> | null;
  skinfolds?: SnapshotSkinfolds | null;
  medicalHistory?: {
    pathologies?: string;
    family_history?: string;
    allergies?: string;
    intolerances?: string;
    medications?: string;
    supplements?: string;
    digestion_issues?: string;
    intestine_issues?: string;
    sleep?: string;
    nutritional_history?: string;
  } | null;
  trainingSessions?: Record<string, SnapshotTrainingSession[]> | null;
  occupationalLevel?:
    | "sedentary"
    | "light"
    | "moderate"
    | "heavy"
    | "very_heavy"
    | null;
  lifestyle?: {
    daily_steps?: number;
    occupation?: string;
    hunger_timing?: string;
    meal_count?: number;
    preferred_training_time?: string;
  } | null;
  goal?: {
    goal?: "fat_loss" | "muscle_gain" | "maintenance" | "performance";
    target_weight_kg?: number;
    target_event?: string;
    target_event_date?: string;
  } | null;
}

export interface SnapshotDeriveContext {
  ageYears: number | null;
  clientSex: "male" | "female" | null;
}

export interface SnapshotColumns {
  weight_kg: number | null;
  height_cm: number | null;
  daily_steps: number | null;
  occupational_level: string | null;
  week_schedule: string[];
  skinfold_data: Record<string, unknown>;
  body_fat_method: string | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  bmr_kcal: number | null;
  notes: string | null;
}

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Dimagrimento",
  muscle_gain: "Aumento Massa",
  maintenance: "Mantenimento",
  performance: "Performance",
};

/**
 * Derive the client_snapshot column payload from an intake input + client
 * context. Pure; recomputes body composition. Mirrors createSnapshot.
 */
export function deriveSnapshotColumns(
  input: SnapshotIntakeInput,
  ctx: SnapshotDeriveContext
): SnapshotColumns {
  // week_schedule: days with >=1 training session = "training", else "rest".
  const weekSchedule: string[] = Array(7).fill("rest");
  if (input.trainingSessions) {
    for (let i = 0; i < 7; i++) {
      const sessions = input.trainingSessions[String(i)];
      if (sessions && sessions.length > 0) weekSchedule[i] = "training";
    }
  }

  // Engine-readable skinfold_data (method + mapped measurement keys).
  let bodyFatMethod: string | null = null;
  let engineSkinfoldData: Record<string, unknown> | null = null;
  const sf = input.skinfolds ?? undefined;
  if (sf) {
    const filledSites = Object.values(sf).filter((v) => v != null && v > 0).length;
    if (filledSites >= 7) {
      bodyFatMethod = "7site";
      engineSkinfoldData = {
        method: "7site",
        chest: sf.chest,
        midaxillary: sf.midaxillary,
        tricep: sf.triceps,
        subscapular: sf.subscapular,
        abdominal: sf.abdomen,
        suprailiac: sf.suprailiac,
        thigh: sf.thigh,
      };
    } else if (filledSites >= 3) {
      bodyFatMethod = "3site";
      engineSkinfoldData = {
        method: "3site",
        chest: sf.chest,
        abdominal: sf.abdomen,
        thigh: sf.thigh,
        tricep: sf.triceps,
        suprailiac: sf.suprailiac,
      };
    }
  }

  // Body composition — sex-appropriate skinfold set; helper returns null when only
  // a BMI heuristic would be possible.
  const has7 =
    sf != null &&
    sf.chest != null &&
    sf.midaxillary != null &&
    sf.triceps != null &&
    sf.subscapular != null &&
    sf.abdomen != null &&
    sf.suprailiac != null &&
    sf.thigh != null;
  const hasMaleTrio =
    sf != null && sf.chest != null && sf.abdomen != null && sf.thigh != null;
  const hasFemaleTrio =
    sf != null && sf.triceps != null && sf.suprailiac != null && sf.thigh != null;

  const bodyComp = computeSnapshotBodyComp({
    sex: ctx.clientSex,
    ageYears: ctx.ageYears,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    skinfold7:
      has7 && sf
        ? {
            chest: sf.chest!,
            midaxillary: sf.midaxillary!,
            tricep: sf.triceps!,
            subscapular: sf.subscapular!,
            abdominal: sf.abdomen!,
            suprailiac: sf.suprailiac!,
            thigh: sf.thigh!,
          }
        : undefined,
    skinfold3:
      has7 || sf == null
        ? undefined
        : ctx.clientSex === "male" && hasMaleTrio
          ? { chest: sf.chest!, abdominal: sf.abdomen!, thigh: sf.thigh! }
          : ctx.clientSex === "female" && hasFemaleTrio
            ? { tricep: sf.triceps!, suprailiac: sf.suprailiac!, thigh: sf.thigh! }
            : undefined,
  });

  // skinfold_data JSONB: engine keys at top level + _intake preserving all fields.
  const skinfoldData: Record<string, unknown> = {
    ...(engineSkinfoldData ?? {}),
    _intake: {
      circumferences: input.circumferences ?? null,
      skinfolds: input.skinfolds ?? null,
      medical_history: input.medicalHistory ?? null,
      training_sessions: input.trainingSessions ?? null,
      lifestyle: input.lifestyle ?? null,
      goal: input.goal ?? null,
    },
  };

  // notes from medical history + goal (readability).
  const noteLines: string[] = [];
  if (input.medicalHistory?.pathologies) {
    noteLines.push(`Patologie: ${input.medicalHistory.pathologies}`);
  }
  if (input.goal?.goal) {
    noteLines.push(`Obiettivo: ${GOAL_LABELS[input.goal.goal] ?? input.goal.goal}`);
  }
  if (input.goal?.target_weight_kg) {
    noteLines.push(`Peso target: ${input.goal.target_weight_kg} kg`);
  }

  return {
    weight_kg: input.weightKg ?? null,
    height_cm: input.heightCm ?? null,
    daily_steps: input.lifestyle?.daily_steps ?? null,
    occupational_level: input.occupationalLevel ?? null,
    week_schedule: weekSchedule,
    skinfold_data: skinfoldData,
    body_fat_method: bodyFatMethod,
    body_fat_pct: bodyComp?.body_fat_pct ?? null,
    lean_mass_kg: bodyComp?.lean_mass_kg ?? null,
    fat_mass_kg: bodyComp?.fat_mass_kg ?? null,
    bmr_kcal: bodyComp?.bmr_kcal ?? null,
    notes: noteLines.length > 0 ? noteLines.join("\n") : null,
  };
}

/** The client_snapshot columns an edit can change (for the audit diff). */
export const AUDIT_COLUMNS = [
  "weight_kg",
  "height_cm",
  "daily_steps",
  "occupational_level",
  "week_schedule",
  "skinfold_data",
  "body_fat_method",
  "body_fat_pct",
  "lean_mass_kg",
  "fat_mass_kg",
  "bmr_kcal",
  "notes",
] as const;

/**
 * Compute the changed-only before -> after diff between an existing snapshot row
 * and the freshly-derived columns. Deep-compares via JSON so JSONB/array columns
 * are handled. Returns {} when nothing changed.
 */
export function diffSnapshotColumns(
  before: Record<string, unknown>,
  after: SnapshotColumns
): Record<string, { before: unknown; after: unknown }> {
  const afterRec = after as unknown as Record<string, unknown>;
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const col of AUDIT_COLUMNS) {
    const b = before[col] ?? null;
    const a = afterRec[col] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changed[col] = { before: b, after: a };
    }
  }
  return changed;
}
