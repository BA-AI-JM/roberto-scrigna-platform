"use client";

/**
 * #27 Stage 1 — patient-facing active-plan view (meals + supplements + coach
 * notes, NO coach math). Extracted from the portal dashboard so it can power
 * both the home's compact summary link and the dedicated "Piano" tab route.
 * Presentational: the page owns the getActivePlan query and passes the plan.
 */

import Link from "next/link";
import { formatIngredientQuantity } from "@/lib/ingredient-display";
import { PeriWorkoutTimingCard } from "@/components/plan/peri-workout-timing-card";

// ── Helpers / styles (self-contained) ────────────────────────────────────────
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}
function daysBetween(from: string | null | undefined, to: string): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}
const todayISO = new Date().toISOString().split("T")[0]!;

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino",
  pre_workout: "Pre-allenamento",
  post_workout: "Spuntino proteico",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  marginBottom: "16px",
} as const;
const sectionTitle = { fontSize: "16px", fontWeight: 700 as const, color: "#1a1a2e", marginBottom: "18px", marginTop: 0 };
const pillStyle = (color: string, bg: string) => ({
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: "20px",
  fontSize: "12px",
  fontWeight: 600 as const,
  color,
  backgroundColor: bg,
});

// ── Types ─────────────────────────────────────────────────────────────────────
type MealSlot = {
  slot: string;
  primary: {
    template: { name: string };
    scaledIngredients: Array<{ name: string; grams: number; foodId?: string }>;
    actualMacros: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  };
};
type DayTypeMealPlan = { dayType: string; label: string; mealPlan?: { withinTolerance: boolean; slots: MealSlot[] } };
export type ActivePlan = {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  daily_targets?: Record<string, unknown> | null;
  meals_per_day?: number | null;
  mealPlan?: DayTypeMealPlan[] | null;
  // #18 → portal: representative training time so the patient sees the same
  // PeriWorkoutTimingCard the coach does. Additive; {} / absent → no box.
  trainingTime?: { startTime?: string; endTime?: string } | null;
  notes?: string | null;
  supplements?: Array<{
    name: string;
    dosage: string;
    timing: string;
    rationale?: string;
    notes?: string;
    frequency?: string;
    libraryId?: string;
    isCustom?: boolean;
  }> | null;
};

function Skeleton({ width, height }: { width?: string; height?: string }) {
  return <div style={{ width: width ?? "100%", height: height ?? "18px", backgroundColor: "#e5e7eb", borderRadius: "6px" }} />;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ActivePlanView({ plan, loading }: { plan: ActivePlan | null | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Piano Attivo</p>
        <Skeleton width="55%" height="22px" />
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <Skeleton height="60px" />
          <Skeleton height="60px" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Piano Attivo</p>
        <div style={{ padding: "28px", background: "#f8fafc", borderRadius: "10px", textAlign: "center", border: "1px dashed #cbd5e1" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Nessun piano attivo</p>
          <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Il tuo nutrizionista sta preparando il tuo piano.</p>
        </div>
      </div>
    );
  }

  const targets = plan.daily_targets as Record<string, number | null | undefined> | null;
  const daysOnPlan = daysBetween(plan.start_date, todayISO);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <p style={{ ...sectionTitle, marginBottom: 0 }}>Piano Attivo</p>
        <span style={pillStyle("#15803d", "#f0fdf4")}>In corso</span>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>{plan.name}</h3>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {plan.start_date && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>Inizio: <strong style={{ color: "#374151" }}>{formatDate(plan.start_date)}</strong></span>
          )}
          {plan.end_date && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>Fine: <strong style={{ color: "#374151" }}>{formatDate(plan.end_date)}</strong></span>
          )}
          <span style={{ fontSize: "13px", color: "#6b7280" }}>Giorni seguiti: <strong style={{ color: "#1a1a2e" }}>{daysOnPlan}</strong></span>
        </div>
      </div>

      {targets != null ? (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "16px", background: "#f8fafc", borderRadius: "10px", marginBottom: "20px" }}>
          {[
            { label: "Kcal", key: "kcal", unit: "" },
            { label: "Proteine", key: "protein_g", unit: "g" },
            { label: "Carboidrati", key: "carbs_g", unit: "g" },
            { label: "Grassi", key: "fat_g", unit: "g" },
          ].map(({ label, key, unit }) =>
            targets[key] != null ? (
              <div key={key} style={{ flex: "1 1 80px", minWidth: "70px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>{String(targets[key] ?? "")}{unit}</div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{label}</div>
              </div>
            ) : null
          )}
        </div>
      ) : null}

      {Array.isArray(plan.mealPlan) && plan.mealPlan.length > 0 && <MealPlanSection dayTypePlans={plan.mealPlan} trainingTime={plan.trainingTime} />}
      {Array.isArray(plan.supplements) && plan.supplements.length > 0 && <SupplementSection supplements={plan.supplements} />}

      {plan.notes && (
        <div style={{ marginTop: "16px", padding: "14px", background: "#fffbeb", borderLeft: "4px solid #f59e0b", borderRadius: "6px", fontSize: "13px", color: "#92400e" }}>
          <strong>Note del coach:</strong> {plan.notes}
        </div>
      )}
    </div>
  );
}

/**
 * Compact home-card summary of the active plan (name + macros) that links to the
 * full "Piano" tab — keeps the home an at-a-glance view without the full meal list.
 */
export function PlanSummaryCard({ plan, loading }: { plan: ActivePlan | null | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={{ ...sectionTitle, marginBottom: "12px" }}>Piano Attivo</p>
        <Skeleton width="60%" height="20px" />
      </div>
    );
  }
  if (!plan) {
    return (
      <div style={cardStyle}>
        <p style={{ ...sectionTitle, marginBottom: "12px" }}>Piano Attivo</p>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
          Nessun piano attivo. Il tuo nutrizionista sta preparando il tuo piano.
        </p>
      </div>
    );
  }
  const targets = plan.daily_targets as Record<string, number | null | undefined> | null;
  return (
    <Link href="/portal/plan" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "10px" }}>
          <p style={{ ...sectionTitle, marginBottom: 0 }}>Piano Attivo</p>
          <span style={pillStyle("#15803d", "#f0fdf4")}>In corso</span>
        </div>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>{plan.name}</h3>
        {targets != null && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
            {[
              { label: "Kcal", key: "kcal", unit: "" },
              { label: "P", key: "protein_g", unit: "g" },
              { label: "C", key: "carbs_g", unit: "g" },
              { label: "G", key: "fat_g", unit: "g" },
            ].map(({ label, key, unit }) =>
              targets[key] != null ? (
                <span key={key} style={{ fontSize: "13px", color: "#374151", background: "#f8fafc", borderRadius: "8px", padding: "6px 10px", fontWeight: 600 }}>
                  {label} {String(targets[key] ?? "")}{unit}
                </span>
              ) : null
            )}
          </div>
        )}
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8" }}>Vedi il piano completo →</span>
      </div>
    </Link>
  );
}

function MealPlanSection({
  dayTypePlans,
  trainingTime,
}: {
  dayTypePlans: DayTypeMealPlan[];
  trainingTime?: { startTime?: string; endTime?: string } | null;
}) {
  const plansWithMeals = dayTypePlans.filter((p) => p.mealPlan && p.mealPlan.slots.length > 0);
  if (plansWithMeals.length === 0) return null;

  return (
    <div>
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#374151", marginBottom: "12px" }}>I tuoi pasti</p>
      {plansWithMeals.map((dayPlan) => (
        <div key={dayPlan.dayType} style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {dayPlan.label}
          </div>
          {/* #18 nutrient timing — the same timed session box + pre/intra/post
              grouping the coach sees, on a training day when a time is set
              (else the component renders nothing, leaving the normal meal list). */}
          <div style={{ marginBottom: "10px" }}>
            <PeriWorkoutTimingCard
              compact
              dayType={dayPlan.dayType}
              slots={dayPlan.mealPlan!.slots.map((sl) => ({
                slot: sl.slot,
                mealName: sl.primary?.template?.name,
              }))}
              startTime={trainingTime?.startTime}
              endTime={trainingTime?.endTime}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {dayPlan.mealPlan!.slots.map((slot) => {
              const macros = slot.primary.actualMacros;
              const ingredients = slot.primary.scaledIngredients;
              return (
                <div key={slot.slot} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{MEAL_LABELS[slot.slot] ?? slot.slot.replace(/_/g, " ")}</span>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>{Math.round(macros.kcal)} kcal</span>
                      <span style={{ fontSize: "12px", color: "#3b82f6" }}>P {Math.round(macros.proteinG)}g</span>
                      <span style={{ fontSize: "12px", color: "#f59e0b" }}>C {Math.round(macros.carbsG)}g</span>
                      <span style={{ fontSize: "12px", color: "#ef4444" }}>G {Math.round(macros.fatG)}g</span>
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px 4px", fontSize: "13px", fontWeight: 600, color: "#374151" }}>{slot.primary.template.name}</div>
                  {ingredients.length > 0 ? (
                    <div style={{ padding: "4px 16px 12px" }}>
                      {ingredients.map((ing, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: idx < ingredients.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          <span style={{ fontSize: "13px", color: "#374151" }}>{ing.name}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a2e", whiteSpace: "nowrap" }}>{formatIngredientQuantity(ing.foodId, ing.grams)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "8px 16px 12px" }}>
                      <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Nessun ingrediente specificato.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupplementSection({ supplements }: { supplements: NonNullable<ActivePlan["supplements"]> }) {
  if (supplements.length === 0) return null;
  return (
    <div style={{ marginTop: "20px" }}>
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#374151", marginBottom: "12px" }}>Integratori</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
        {supplements.map((item, i) => (
          <div key={`${item.libraryId ?? item.name}-${i}`} style={{ padding: "12px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0c4a6e", marginBottom: "4px" }}>{item.name}</div>
            {(item.dosage || item.timing) && (
              <div style={{ fontSize: "12px", color: "#0369a1" }}>{[item.dosage, item.timing].filter(Boolean).join(" · ")}</div>
            )}
            {(item.frequency || item.notes) && (
              <div style={{ fontSize: "11px", color: "#7dd3fc", marginTop: "2px" }}>{[item.frequency, item.notes].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
