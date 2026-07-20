/**
 * Plan Generation Page.
 *
 * Allows Roberto to select a client and configure plan parameters,
 * then calls trpc.plan.generate. On success it navigates to the review page.
 *
 * The client must already exist with at least one snapshot (from the intake
 * form at /plans/new). This page is separate from the intake form.
 */

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "../../../../lib/trpc/client";
import { humanizeTrpcError } from "../../../../lib/human-error";
import type { Allergen, MealTag } from "../../../../engine/meal-plan/types";
import { isTrainingLikeDayType, type DayType } from "../../../../engine/types";
import { SourceSwapCard } from "../../../../components/plan/source-swap-card";
import {
  WeekStructureCard,
  MacroOverridesCard,
  type WeekPreviewData,
} from "../../../../components/plan-wizard/cards";
import {
  ALL_DAY_TYPES,
  DAY_LABELS_IT,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  WEEK_PRESETS,
} from "../../../../components/plan-wizard/constants";
import { PeriodizationModeSelector } from "../../../../components/plan/periodization-mode-selector";
import {
  EMPTY_SELECTIONS,
  buildSourcePinsPayload,
  type SourceSwapSelections,
} from "../../../../components/plan/source-swap-helpers";
import {
  computeGoalRate,
  weeksUntil,
  type AggressivenessBand,
  type GoalDirection,
} from "../../../../engine/goal-rate";
import { groupedSportOptions } from "../../../../engine/sport-taxonomy";

/**
 * Per-day training session shape sent to the server. Matches
 * IntakeTrainingSession from services/training-modality.
 */
interface DaySession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
}

// Every day-type, in display order — the manual per-day editing vocabulary
// (base types + the #17 intensity tiers). Shared by the per-day select, the
// macro-override rows, and the macro-override payload so all three stay in sync.
// ── Form State ───────────────────────────────────────────────────────────────

interface GeneratePlanFormState {
  clientId: string;
  mealCount: number;
  excludeAllergens: Allergen[];
  preferTags: MealTag[];
  maintenanceKcalEstimate: string;
  notes: string;
  /** Goal override for this plan only (doesn't mutate the client snapshot). */
  goalType: "fat_loss" | "muscle_gain" | "maintenance" | "performance" | "";
  targetWeightKg: string;
  targetEventDate: string;
  /**
   * Daily deficit (kcal). When `null`, use the value the goal-rate calculator
   * proposes; when a number, the coach has manually overridden it via the slider.
   */
  deficitOverride: number | null;
  /**
   * Per-plan override of the snapshot's 7-day schedule. `null` means
   * "use the snapshot's schedule" — server falls back to the stored value.
   */
  weekSchedule: DayType[] | null;
  /**
   * Per-weekday training-session override (length-7, Mon-Sun). Each entry
   * is an array of sessions for that day (or empty for "no extra session
   * — fall back to the global average").
   */
  perDaySessions: (DaySession[] | null)[];
  /**
   * Per-day-type absolute macro overrides (grams). Empty strings mean
   * "leave blank → use formula". The render layer converts to numbers
   * before sending.
   */
  macroOverrides: Record<DayType, { proteinG: string; fatG: string; carbG: string }>;
  /**
   * #16b source pins — GLOBAL per-category food source ("" = Automatico / no
   * pin). Applied to every present day-type when sent. All-Automatico → omitted.
   */
  sourcePins: SourceSwapSelections;
}

const EMPTY_MACRO_ROW = { proteinG: "", fatG: "", carbG: "" } as const;

const GOAL_LABELS: Record<Exclude<GeneratePlanFormState["goalType"], "">, string> = {
  fat_loss: "Dimagrimento",
  muscle_gain: "Aumento massa",
  maintenance: "Mantenimento",
  performance: "Performance sportiva",
};

const BAND_THEMES: Record<AggressivenessBand, { bg: string; text: string; label: string }> = {
  comfortable: { bg: "#f0fdf4", text: "#15803d", label: "Confortevole" },
  moderate: { bg: "#eff6ff", text: "#1d4ed8", label: "Moderato" },
  aggressive: { bg: "#fffbeb", text: "#b45309", label: "Aggressivo" },
  extreme: { bg: "#fef2f2", text: "#b91c1c", label: "Estremo" },
};

const DIRECTION_LABELS: Record<GoalDirection, string> = {
  fat_loss: "Deficit",
  muscle_gain: "Surplus",
  maintenance: "Mantenimento",
};

// ── Options ──────────────────────────────────────────────────────────────────

const ALLERGEN_OPTIONS: readonly Allergen[] = [
  "gluten",
  "dairy",
  "eggs",
  "nuts",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;

const TAG_OPTIONS: readonly MealTag[] = [
  "high_protein",
  "low_fat",
  "low_carb",
  "high_carb",
  "vegetarian",
  "vegan",
  "quick_prep",
  "meal_prep_friendly",
  "italian",
] as const;

const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Glutine",
  dairy: "Latticini",
  eggs: "Uova",
  nuts: "Frutta a guscio",
  soy: "Soia",
  fish: "Pesce",
  shellfish: "Crostacei",
  sesame: "Sesamo",
} as const;

const TAG_LABELS: Record<MealTag, string> = {
  high_protein: "Alto Proteine",
  low_fat: "Basso Grassi",
  low_carb: "Basso Carboidrati",
  high_carb: "Alto Carboidrati",
  vegetarian: "Vegetariano",
  vegan: "Vegano",
  quick_prep: "Preparazione Rapida",
  meal_prep_friendly: "Meal Prep",
  italian: "Cucina Italiana",
  post_workout: "Spuntino proteico",
  pre_workout: "Pre Allenamento",
} as const;

// ── Page Component ───────────────────────────────────────────────────────────

export default function GeneratePlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") ?? "";

  const [form, setForm] = useState<GeneratePlanFormState>({
    clientId: preselectedClientId,
    mealCount: 4,
    excludeAllergens: [],
    preferTags: [],
    maintenanceKcalEstimate: "",
    notes: "",
    goalType: "",
    targetWeightKg: "",
    targetEventDate: "",
    deficitOverride: null,
    weekSchedule: null,
    perDaySessions: [null, null, null, null, null, null, null],
    macroOverrides: {
      training: { ...EMPTY_MACRO_ROW },
      rest: { ...EMPTY_MACRO_ROW },
      refeed: { ...EMPTY_MACRO_ROW },
      deload: { ...EMPTY_MACRO_ROW },
      // #17 periodization intensity tiers (modes 3-4)
      training_light: { ...EMPTY_MACRO_ROW },
      training_medium: { ...EMPTY_MACRO_ROW },
      training_intense: { ...EMPTY_MACRO_ROW },
      training_double: { ...EMPTY_MACRO_ROW },
    },
    sourcePins: { ...EMPTY_SELECTIONS },
  });
  const [error, setError] = useState<string | null>(null);
  // T3 Wave A — 4-step wizard shell (concept 2). Sections themselves unchanged.
  const [step, setStep] = useState(1);
  const STEP_TITLES = ["Cliente e dati", "Obiettivo e deficit", "Struttura settimana", "Rivedi e genera"];

  // Load active clients for the selector
  const { data: clientsData, isLoading: clientsLoading } =
    trpc.client.list.useQuery({ status: "active", limit: 100 });
  const selectedClientName =
    (clientsData?.clients ?? []).find((c) => c.id === form.clientId)?.full_name ?? null;
  const canContinue = form.clientId !== "";

  // Engine preview for the selected client — drives the "Obiettivo & deficit"
  // card readouts. Fetched once per client change.
  const { data: estimate } = trpc.plan.estimateForClient.useQuery(
    { clientId: form.clientId },
    { enabled: Boolean(form.clientId), staleTime: 60_000 }
  );

  // When the estimate arrives, pre-fill goal/target/date from the saved
  // intake blob — but only if the coach hasn't already typed something.
  useEffect(() => {
    if (!estimate?.savedGoal) return;
    setForm((prev) => {
      // Only auto-fill empty fields; never overwrite coach edits.
      if (prev.goalType || prev.targetWeightKg || prev.targetEventDate) return prev;
      return {
        ...prev,
        goalType:
          (estimate.savedGoal!.goal as GeneratePlanFormState["goalType"]) ?? "",
        targetWeightKg:
          estimate.savedGoal!.target_weight_kg != null
            ? String(estimate.savedGoal!.target_weight_kg)
            : "",
        targetEventDate: estimate.savedGoal!.target_event_date ?? "",
      };
    });
  }, [estimate]);

  // Pre-fill weekSchedule + perDaySessions from the intake snapshot once,
  // when the estimate first lands and the form hasn't been edited yet.
  useEffect(() => {
    if (!estimate) return;
    setForm((prev) => {
      if (prev.weekSchedule) return prev; // coach already edited
      const intake = estimate.intakeTrainingSessions ?? {};
      const perDay: (DaySession[] | null)[] = Array.from({ length: 7 }, (_, i) => {
        const list = intake[String(i)] as DaySession[] | undefined;
        return list && list.length > 0 ? list : null;
      });
      return {
        ...prev,
        weekSchedule: estimate.weekSchedule as DayType[],
        perDaySessions: perDay,
      };
    });
  }, [estimate]);


  // Live goal-rate computation. Returns null when we don't have enough data
  // (no estimate yet, or no target weight + date pair).
  const goalRate = useMemo(() => {
    if (!estimate || estimate.leanMassKg <= 0 || estimate.avgTdeeKcal <= 0) return null;
    const targetKg = parseFloat(form.targetWeightKg);
    if (!Number.isFinite(targetKg) || targetKg <= 0) return null;
    const weeks = form.targetEventDate ? weeksUntil(form.targetEventDate) : 0;
    if (weeks <= 0) return null;
    return computeGoalRate({
      currentKg: estimate.weightKg,
      targetKg,
      weeks,
      tdeeKcal: estimate.avgTdeeKcal,
      leanMassKg: estimate.leanMassKg,
    });
  }, [estimate, form.targetWeightKg, form.targetEventDate]);

  /**
   * Effective deficit that will be sent to the server. Slider override (if
   * set) wins; otherwise we use whatever the calculator proposes.
   */
  const effectiveDeficitKcal: number | null = useMemo(() => {
    if (form.deficitOverride != null) return form.deficitOverride;
    return goalRate ? goalRate.dailyDeficitKcal : null;
  }, [form.deficitOverride, goalRate]);

  /**
   * Implied daily intake (rounded). When set, this is the number the
   * macros engine will target instead of pure TDEE.
   */
  const targetDailyKcal: number | null = useMemo(() => {
    if (!estimate) return null;
    if (effectiveDeficitKcal == null) return null;
    return estimate.avgTdeeKcal - effectiveDeficitKcal;
  }, [estimate, effectiveDeficitKcal]);

  const belowFloor =
    targetDailyKcal != null && goalRate != null && targetDailyKcal < goalRate.kcalFloor;

  // Build the macroOverrides payload (or undefined if all fields blank).
  // Empty strings parse to NaN → dropped; only finite numbers reach the server.
  const macroOverridesPayload = useMemo(() => {
    let any = false;
    const out: Record<string, { proteinG?: number; fatG?: number; carbG?: number }> = {};
    for (const dt of ALL_DAY_TYPES) {
      const row = form.macroOverrides[dt];
      const p = Number(row.proteinG);
      const f = Number(row.fatG);
      const c = Number(row.carbG);
      const entry: { proteinG?: number; fatG?: number; carbG?: number } = {};
      if (Number.isFinite(p) && row.proteinG !== "") entry.proteinG = p;
      if (Number.isFinite(f) && row.fatG !== "") entry.fatG = f;
      if (Number.isFinite(c) && row.carbG !== "") entry.carbG = c;
      if (Object.keys(entry).length > 0) {
        out[dt] = entry;
        any = true;
      }
    }
    return any
      ? (out as Partial<Record<DayType, { proteinG?: number; fatG?: number; carbG?: number }>>)
      : undefined;
  }, [form.macroOverrides]);

  // #16b — catalogue for the source-swap dropdowns (static food DB; load once).
  const { data: foodCatalogue } = trpc.plan.foodCatalogue.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Day-types present in the schedule (the GLOBAL pins are applied to each).
  const presentDayTypes = useMemo<DayType[]>(
    () => (form.weekSchedule ? Array.from(new Set(form.weekSchedule)) : []),
    [form.weekSchedule]
  );

  // Build the sourcePins payload (undefined when all Automatico). Absent =
  // byte-identical default behaviour (the engine regression depends on this).
  const sourcePinsPayload = useMemo(
    () => buildSourcePinsPayload(form.sourcePins, presentDayTypes),
    [form.sourcePins, presentDayTypes]
  );

  // Live week preview. Only fires when we have a schedule to send (i.e.
  // after the prefill from estimateForClient has run). Refetches whenever
  // schedule / per-day sessions / deficit change.
  const previewEnabled = Boolean(form.clientId && form.weekSchedule);
  const { data: weekPreview, isFetching: weekPreviewFetching } =
    trpc.plan.previewWeek.useQuery(
      {
        clientId: form.clientId,
        ...(form.weekSchedule
          ? { weekScheduleOverride: form.weekSchedule }
          : {}),
        ...(form.weekSchedule
          ? {
              perDayTrainingSession: form.perDaySessions.map((d) => d ?? null),
            }
          : {}),
        ...(effectiveDeficitKcal != null && effectiveDeficitKcal !== 0
          ? { dailyDeficitKcal: Math.round(effectiveDeficitKcal) }
          : {}),
        ...(macroOverridesPayload ? { macroOverrides: macroOverridesPayload } : {}),
        ...(sourcePinsPayload ? { sourcePins: sourcePinsPayload } : {}),
      },
      { enabled: previewEnabled, staleTime: 30_000 }
    );

  // Helper used by the Struttura card to mutate one day's slot.
  const updateDay = useCallback(
    (i: number, patch: { dayType?: DayType; sessions?: DaySession[] | null }) => {
      setForm((prev) => {
        const schedule = (prev.weekSchedule ?? Array(7).fill("rest")).slice() as DayType[];
        const sessions = prev.perDaySessions.slice();
        if (patch.dayType !== undefined) schedule[i] = patch.dayType;
        if (patch.sessions !== undefined) sessions[i] = patch.sessions;
        // Non-training-like days clear their session list to keep the engine
        // mapping honest (per-day sessions only apply on training-like days,
        // i.e. training + the #17 intensity tiers).
        if (patch.dayType !== undefined && !isTrainingLikeDayType(patch.dayType)) {
          sessions[i] = null;
        }
        return { ...prev, weekSchedule: schedule, perDaySessions: sessions };
      });
    },
    []
  );

  const applyPreset = useCallback((preset: DayType[]) => {
    setForm((prev) => ({
      ...prev,
      weekSchedule: preset.slice() as DayType[],
      // Drop sessions on days that flipped to non-training-like (tiers keep them).
      perDaySessions: prev.perDaySessions.map((s, i) =>
        isTrainingLikeDayType(preset[i]!) ? s : null
      ),
    }));
  }, []);

  // Generate mutation
  const generateMutation = trpc.plan.generate.useMutation({
    onSuccess: (result) => {
      router.push(`/plans/${result.planId}/review`);
    },
    onError: (err) => {
      setError(humanizeTrpcError(err.message));
    },
  });

  const toggleAllergen = useCallback((allergen: Allergen) => {
    setForm((prev) => ({
      ...prev,
      excludeAllergens: prev.excludeAllergens.includes(allergen)
        ? prev.excludeAllergens.filter((a) => a !== allergen)
        : [...prev.excludeAllergens, allergen],
    }));
  }, []);

  const toggleTag = useCallback((tag: MealTag) => {
    setForm((prev) => ({
      ...prev,
      preferTags: prev.preferTags.includes(tag)
        ? prev.preferTags.filter((t) => t !== tag)
        : [...prev.preferTags, tag],
    }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (!form.clientId) {
      setError("Seleziona un cliente.");
      return;
    }
    if (belowFloor) {
      setError(
        "L'apporto pianificato è sotto la soglia minima di sicurezza. Estendi la data target o riduci il deficit."
      );
      return;
    }
    const mk = form.maintenanceKcalEstimate;
    if (mk !== "" && (!Number.isFinite(Number(mk)) || Number(mk) <= 0)) {
      setError(
        "Stima kcal mantenimento: inserisci un numero positivo (es. 2500) oppure lascia il campo vuoto per il calcolo automatico."
      );
      return;
    }
    setError(null);
    const hasGoalEdit =
      form.goalType !== "" ||
      form.targetWeightKg !== "" ||
      form.targetEventDate !== "";
    generateMutation.mutate({
      clientId: form.clientId,
      mealCount: form.mealCount,
      excludeAllergens: form.excludeAllergens,
      preferTags: form.preferTags,
      maintenanceKcalEstimate: form.maintenanceKcalEstimate
        ? Number(form.maintenanceKcalEstimate)
        : undefined,
      notes: form.notes || undefined,
      ...(hasGoalEdit
        ? {
            goalOverride: {
              goal: form.goalType || undefined,
              targetWeightKg: form.targetWeightKg
                ? Number(form.targetWeightKg)
                : undefined,
              targetEventDate: form.targetEventDate || undefined,
            },
          }
        : {}),
      ...(effectiveDeficitKcal != null && effectiveDeficitKcal !== 0
        ? { dailyDeficitKcal: Math.round(effectiveDeficitKcal) }
        : {}),
      ...(form.weekSchedule
        ? { weekScheduleOverride: form.weekSchedule }
        : {}),
      ...(form.weekSchedule
        ? {
            perDayTrainingSession: form.perDaySessions.map((d) => d ?? null),
          }
        : {}),
      ...(macroOverridesPayload ? { macroOverrides: macroOverridesPayload } : {}),
      ...(sourcePinsPayload ? { sourcePins: sourcePinsPayload } : {}),
    });
  }, [form, generateMutation, belowFloor, effectiveDeficitKcal, macroOverridesPayload, sourcePinsPayload]);

  const isGenerating = generateMutation.isPending;

  // ── Styles ────────────────────────────────────────────────────────────────

  const sectionStyle: React.CSSProperties = {
    marginBottom: "20px",
    padding: "20px",
    border: "1px solid #e4e4e7",
    borderRadius: "12px",
    backgroundColor: "#ffffff",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#3f3f46",
    marginBottom: "6px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    color: "#18181b",
    boxSizing: "border-box",
  };

  return (
    <div className="coach-container">
      {/* Header */}
      <div className="mb-7">
        <a href="/plans" className="text-[13px] text-muted-foreground hover:text-ink">← Torna ai piani</a>
        <div className="mb-1 mt-3 text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-3">
          Nuovo piano{selectedClientName ? ` · ${selectedClientName}` : ""}
        </div>
        <h1 className="text-[32px] tracking-[-0.01em] text-ink">{STEP_TITLES[step - 1]}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Steps rail */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <ol className="space-y-1">
            {STEP_TITLES.map((title, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "on" : "todo";
              const clickable = n < step || (n === step + 0) || (canContinue && n <= 4);
              return (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => { if (n < step || (canContinue && n !== step)) setStep(n); }}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm transition-colors ${
                      state === "on"
                        ? "border border-border bg-card font-medium text-ink"
                        : state === "done"
                        ? "text-ink hover:bg-card"
                        : "text-ink-3"
                    } ${!clickable ? "cursor-default" : ""}`}
                  >
                    <span
                      className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border text-[11px] ${
                        state === "on"
                          ? "border-brand bg-brand text-primary-foreground"
                          : state === "done"
                          ? "border-brand-soft bg-brand-wash text-brand-deep"
                          : "border-border bg-card text-ink-3"
                      }`}
                    >
                      {state === "done" ? "✓" : n}
                    </span>
                    {title}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Step body — existing sections re-housed verbatim */}
        <div className="min-w-0 max-w-[820px]">
          {step === 1 && (
            <>
      {/* Client Selection */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Cliente *</label>
        {clientsLoading ? (
          <p style={{ fontSize: "13px", color: "#71717a", margin: 0 }}>
            Caricamento clienti...
          </p>
        ) : (
          <select
            value={form.clientId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, clientId: e.target.value }))
            }
            style={inputStyle}
          >
            <option value="">Seleziona cliente...</option>
            {(clientsData?.clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.email ? ` — ${c.email}` : ""}
              </option>
            ))}
          </select>
        )}
        {!clientsLoading && (clientsData?.clients ?? []).length === 0 && (
          <p
            style={{
              fontSize: "12px",
              color: "#d97706",
              margin: "6px 0 0 0",
            }}
          >
            Nessun cliente attivo trovato.{" "}
            <a
              href="/plans/new"
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              Aggiungi un cliente
            </a>{" "}
            prima di generare un piano.
          </p>
        )}
      </div>

            </>
          )}

          {step === 2 && (
            <>
      {/* Obiettivo & deficit (Phase A) */}
      {form.clientId && estimate && (
        <div style={sectionStyle}>
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "4px",
              marginTop: 0,
              color: "#18181b",
            }}
          >
            Obiettivo &amp; deficit
          </h2>
          <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
            Imposta peso target e data. L&apos;app calcola il deficit (o surplus) necessario,
            mostra l&apos;aggressività e blocca i piani sotto la soglia di sicurezza.
            Peso attuale {estimate.weightKg.toFixed(1)} kg · massa magra {estimate.leanMassKg.toFixed(1)} kg ·
            TDEE medio {estimate.avgTdeeKcal} kcal/giorno.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Tipo di obiettivo</label>
              <select
                value={form.goalType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    goalType: e.target.value as GeneratePlanFormState["goalType"],
                    deficitOverride: null,
                  }))
                }
                style={{ ...inputStyle, backgroundColor: "#ffffff" }}
              >
                <option value="">Non specificato</option>
                {Object.entries(GOAL_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Peso target (kg)</label>
              <input
                type="number"
                step="0.1"
                value={form.targetWeightKg}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    targetWeightKg: e.target.value,
                    deficitOverride: null,
                  }))
                }
                placeholder={`es. ${(estimate.weightKg - 5).toFixed(0)}`}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Data target</label>
              <input
                type="date"
                value={form.targetEventDate}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    targetEventDate: e.target.value,
                    deficitOverride: null,
                  }))
                }
                style={inputStyle}
              />
            </div>
          </div>

          {/* Live readout */}
          {goalRate ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "8px",
                  padding: "12px 14px",
                  background: "#fafafa",
                  borderRadius: "8px",
                  border: "1px solid #f4f4f5",
                }}
              >
                <Stat
                  label={DIRECTION_LABELS[goalRate.direction] === "Mantenimento" ? "Variazione" : "Da perdere"}
                  value={`${goalRate.totalDeltaKg > 0 ? "-" : "+"}${Math.abs(goalRate.totalDeltaKg).toFixed(1)} kg`}
                />
                <Stat label="Ritmo" value={`${goalRate.requiredKgPerWeek} kg/sett`} />
                <Stat
                  label="% peso/sett"
                  value={`${goalRate.percentBwPerWeek.toFixed(2)} %`}
                />
                <Stat
                  label={goalRate.direction === "muscle_gain" ? "Surplus" : "Deficit"}
                  value={`${Math.abs(goalRate.dailyDeficitKcal)} kcal/giorno`}
                />
                <Stat
                  label="Apporto pianificato"
                  value={`${goalRate.targetDailyKcal} kcal/giorno`}
                />
              </div>

              {/* Status badge + suggestion */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 12px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    backgroundColor: BAND_THEMES[goalRate.band].bg,
                    color: BAND_THEMES[goalRate.band].text,
                  }}
                >
                  {BAND_THEMES[goalRate.band].label}
                </span>
                {goalRate.band === "extreme" && goalRate.suggestedWeeks && (
                  <span style={{ fontSize: "12px", color: "#71717a" }}>
                    Suggerimento: estendi la data a ~{goalRate.suggestedWeeks} settimane per restare entro i limiti.
                  </span>
                )}
              </div>

              {/* Below-floor warning */}
              {belowFloor && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    color: "#991b1b",
                    fontSize: "12px",
                  }}
                >
                  ⚠ Apporto pianificato sotto la soglia minima ({goalRate.kcalFloor} kcal/giorno). Estendi la
                  data target o riduci il deficit con lo slider.
                </div>
              )}

              {/* Manual override slider */}
              <div>
                <label style={{ ...labelStyle, marginTop: "8px" }}>
                  Affinamento manuale del {goalRate.direction === "muscle_gain" ? "surplus" : "deficit"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="range"
                    min={goalRate.direction === "muscle_gain" ? -800 : 0}
                    max={goalRate.direction === "muscle_gain" ? 0 : 1200}
                    step={25}
                    value={effectiveDeficitKcal ?? goalRate.dailyDeficitKcal}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, deficitOverride: Number(e.target.value) }))
                    }
                    style={{ flex: 1, accentColor: "#18181b" }}
                  />
                  <span className="tnum" style={{ fontSize: "13px", fontWeight: 600, color: "#18181b", minWidth: "80px", textAlign: "right" }}>
                    {effectiveDeficitKcal ?? goalRate.dailyDeficitKcal} kcal
                  </span>
                  {form.deficitOverride != null && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, deficitOverride: null }))}
                      style={{
                        fontSize: "11px",
                        color: "#3b82f6",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: "12px", color: "#a1a1aa", margin: 0 }}>
              Inserisci peso target e data per vedere il calcolo del deficit. Se non specifichi nulla,
              il piano viene generato a mantenimento.
            </p>
          )}
        </div>
      )}

            </>
          )}

          {step === 3 && form.clientId && form.weekSchedule && (
            <>
      {/* Struttura del piano (Phase B) */}
        <WeekStructureCard
          weekSchedule={form.weekSchedule}
          perDaySessions={form.perDaySessions}
          weekPreview={weekPreview}
          weekPreviewFetching={weekPreviewFetching}
          onPreset={applyPreset}
          onUpdateDay={updateDay}
          sectionStyle={sectionStyle}
          labelStyle={labelStyle}
          inputStyle={inputStyle}
        />
            </>
          )}

          {step === 4 && form.clientId && form.weekSchedule && (
            <>
      {/* Macro overrides (Phase C) */}
        <MacroOverridesCard
          weekSchedule={form.weekSchedule}
          macroOverrides={form.macroOverrides}
          weekPreview={weekPreview}
          onChange={(dt, field, value) =>
            setForm((prev) => ({
              ...prev,
              macroOverrides: {
                ...prev.macroOverrides,
                [dt]: { ...prev.macroOverrides[dt], [field]: value },
              },
            }))
          }
          onClear={(dt) =>
            setForm((prev) => ({
              ...prev,
              macroOverrides: {
                ...prev.macroOverrides,
                [dt]: { ...EMPTY_MACRO_ROW },
              },
            }))
          }
          sectionStyle={sectionStyle}
          labelStyle={labelStyle}
          inputStyle={inputStyle}
        />

      {/* Source swap (#16b) */}
      {form.clientId && form.weekSchedule && (
        <SourceSwapCard
          catalogue={foodCatalogue}
          selections={form.sourcePins}
          onChange={(category, foodId) =>
            setForm((prev) => ({
              ...prev,
              sourcePins: { ...prev.sourcePins, [category]: foodId },
            }))
          }
          sectionStyle={sectionStyle}
        />
      )}

      {/* Meal Configuration */}
      <div style={sectionStyle}>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
            color: "#18181b",
          }}
        >
          Configurazione Pasti
        </h2>

        <label style={labelStyle}>Numero Pasti/Giorno</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setForm((prev) => ({ ...prev, mealCount: n }))}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border:
                  form.mealCount === n
                    ? "2px solid #18181b"
                    : "1px solid #d4d4d8",
                backgroundColor: form.mealCount === n ? "#18181b" : "#ffffff",
                color: form.mealCount === n ? "#ffffff" : "#3f3f46",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Escludi Allergeni</label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "20px",
          }}
        >
          {ALLERGEN_OPTIONS.map((allergen) => {
            const selected = form.excludeAllergens.includes(allergen);
            return (
              <button
                key={allergen}
                onClick={() => toggleAllergen(allergen)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: selected
                    ? "2px solid #dc2626"
                    : "1px solid #d4d4d8",
                  backgroundColor: selected ? "#fef2f2" : "#ffffff",
                  color: selected ? "#dc2626" : "#71717a",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {selected ? "× " : ""}
                {ALLERGEN_LABELS[allergen]}
              </button>
            );
          })}
        </div>

        <label style={labelStyle}>Preferenze Alimentari</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TAG_OPTIONS.map((tag) => {
            const selected = form.preferTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: selected
                    ? "2px solid #16a34a"
                    : "1px solid #d4d4d8",
                  backgroundColor: selected ? "#f0fdf4" : "#ffffff",
                  color: selected ? "#16a34a" : "#71717a",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {TAG_LABELS[tag]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings */}
      <div style={sectionStyle}>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
            color: "#18181b",
          }}
        >
          Impostazioni Avanzate
        </h2>

        <label style={labelStyle}>
          Stima Kcal Mantenimento{" "}
          <span style={{ fontWeight: 400, color: "#a1a1aa" }}>(opzionale)</span>
        </label>
        <input
          type="number"
          min={0}
          value={form.maintenanceKcalEstimate}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              maintenanceKcalEstimate: e.target.value,
            }))
          }
          placeholder="Es: 2500"
          style={{
            ...inputStyle,
            maxWidth: "200px",
            marginBottom: "16px",
            display: "block",
          }}
        />

        <label style={labelStyle}>Note Aggiuntive</label>
        <textarea
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          placeholder="Note per la generazione del piano..."
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* Error */}
            </>
          )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}


          {/* Footer navigation */}
          <div className="mt-7 flex items-center justify-between gap-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded-full border border-border px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-secondary"
              >
                ← Indietro
              </button>
            ) : (
              <span />
            )}
            <div className="hidden items-center gap-2 text-[13px] text-ink-3 sm:flex">
              <span className="rounded-[6px] border border-b-2 border-border bg-secondary px-1.5 py-0.5 text-[11px]">⌘</span>
              <span className="rounded-[6px] border border-b-2 border-border bg-secondary px-1.5 py-0.5 text-[11px]">↵</span>
              {step < 4 ? "continua" : "genera"}
            </div>
            {step < 4 ? (
              <button
                type="button"
                onClick={() => canContinue && setStep(step + 1)}
                disabled={!canContinue}
                className="rounded-full bg-brand px-6 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continua →
              </button>
            ) : (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !form.clientId || belowFloor}
              className="rounded-full bg-brand px-6 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating
                ? "Generazione in corso…"
                : belowFloor
                ? "Sotto la soglia minima — riduci il deficit"
                : "Genera piano nutrizionale"}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Week structure wizard ────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#6b7280", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div className="tnum" style={{ fontSize: "14px", fontWeight: 700, color: "#18181b" }}>
        {value}
      </div>
    </div>
  );
}
