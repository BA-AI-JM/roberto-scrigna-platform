/**
 * Plan-wizard shared constants (T3.4a extraction — moved verbatim from
 * plans/generate/page.tsx; zero behavior change).
 */
import type { DayType } from "../../engine/types";

export const DAY_LABELS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "ON",
  rest: "OFF",
  refeed: "Refeed",
  deload: "Deload",
  // #17 periodization intensity tiers (modes 3-4)
  training_light: "Leggero",
  training_medium: "Medio",
  training_intense: "Intenso",
  training_double: "Doppia",
};

// Every day-type, in display order — the manual per-day editing vocabulary
// (base types + the #17 intensity tiers). Shared by the per-day select, the
// macro-override rows, and the macro-override payload so all three stay in sync.

export const ALL_DAY_TYPES: DayType[] = [
  "training",
  "rest",
  "refeed",
  "deload",
  "training_light",
  "training_medium",
  "training_intense",
  "training_double",
];

export const DAY_TYPE_COLORS: Record<DayType, { bg: string; text: string; border: string }> = {
  training: { bg: "#18181b", text: "#ffffff", border: "#18181b" },
  rest:     { bg: "#f4f4f5", text: "#71717a", border: "#d4d4d8" },
  refeed:   { bg: "#fffbeb", text: "#b45309", border: "#fcd34d" },
  deload:   { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
  // #17 periodization intensity tiers (modes 3-4) — blue family, graded.
  training_light:   { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
  training_medium:  { bg: "#dbeafe", text: "#1e40af", border: "#60a5fa" },
  training_intense: { bg: "#bfdbfe", text: "#1e3a8a", border: "#3b82f6" },
  training_double:  { bg: "#e0e7ff", text: "#3730a3", border: "#818cf8" },
};

export const WEEK_PRESETS: Record<string, DayType[]> = {
  // Mode 1 — uniform week (every day the same type): no training/rest
  // differentiation, so the plan resolves to a single weekly target.
  "Media settimanale": ["training", "training", "training", "training", "training", "training", "training"],
  "3/sett": ["training", "rest",     "training", "rest",     "training", "rest", "rest"],
  "4/sett": ["training", "training", "rest",     "training", "training", "rest", "rest"],
  "5/sett": ["training", "training", "rest",     "training", "training", "training", "rest"],
  "6/sett": ["training", "training", "training", "rest",     "training", "training", "training"],
};

// ── Form State ───────────────────────────────────────────────────────────────
