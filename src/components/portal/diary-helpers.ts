/**
 * #27 Stage 2 — pure helpers for the patient food diary (manual entry, no 3rd-
 * party sync per scope). Kept separate from the React page so totals/date logic
 * is unit-testable in the node-only vitest env.
 */

export interface DiaryFoodItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiaryEntry {
  id: string;
  meal_slot: string | null;
  food_items: DiaryFoodItem[] | null;
  total_kcal: number | null;
  total_protein_g: number | null;
  total_carbs_g: number | null;
  total_fat_g: number | null;
  notes: string | null;
  created_at: string;
}

export const MEAL_SLOT_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino",
  pre_workout: "Pre-allenamento",
  post_workout: "Spuntino proteico",
};

export function mealSlotLabel(slot: string | null | undefined): string {
  if (!slot) return "Pasto";
  return MEAL_SLOT_LABELS[slot] ?? slot.replace(/_/g, " ");
}

export interface DayTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Sum a day's diary entries (prefers the stored totals; falls back to items). */
export function sumDayTotals(entries: DiaryEntry[] | undefined): DayTotals {
  const acc: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries ?? []) {
    if (e.total_kcal != null || e.total_protein_g != null) {
      acc.kcal += e.total_kcal ?? 0;
      acc.protein += e.total_protein_g ?? 0;
      acc.carbs += e.total_carbs_g ?? 0;
      acc.fat += e.total_fat_g ?? 0;
    } else {
      for (const f of e.food_items ?? []) {
        acc.kcal += f.kcal ?? 0;
        acc.protein += f.protein ?? 0;
        acc.carbs += f.carbs ?? 0;
        acc.fat += f.fat ?? 0;
      }
    }
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein * 10) / 10,
    carbs: Math.round(acc.carbs * 10) / 10,
    fat: Math.round(acc.fat * 10) / 10,
  };
}

/** ISO (YYYY-MM-DD) for today, local. */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

/** Shift an ISO date by N days (pure; safe for negatives). */
export function shiftDateISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

/** Human day label, e.g. "lun 23 giu". */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}
