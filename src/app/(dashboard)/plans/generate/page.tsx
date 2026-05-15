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
import type { Allergen, MealTag } from "../../../../engine/meal-plan/types";
import {
  computeGoalRate,
  weeksUntil,
  type AggressivenessBand,
  type GoalDirection,
} from "../../../../engine/goal-rate";

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
}

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
  post_workout: "Post Allenamento",
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
  });
  const [error, setError] = useState<string | null>(null);

  // Load active clients for the selector
  const { data: clientsData, isLoading: clientsLoading } =
    trpc.client.list.useQuery({ status: "active", limit: 100 });

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

  // Generate mutation
  const generateMutation = trpc.plan.generate.useMutation({
    onSuccess: (result) => {
      router.push(`/plans/${result.planId}/review`);
    },
    onError: (err) => {
      setError(err.message);
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
    });
  }, [form, generateMutation, belowFloor, effectiveDeficitKcal]);

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
    <div style={{ padding: "32px", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <a
          href="/plans"
          style={{ fontSize: "13px", color: "#71717a", textDecoration: "none" }}
        >
          ← Torna ai Piani
        </a>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginTop: "8px",
            marginBottom: 0,
            color: "#18181b",
          }}
        >
          Genera Piano Nutrizionale
        </h1>
        <p style={{ fontSize: "13px", color: "#71717a", marginTop: "4px" }}>
          Seleziona un cliente con misurazione di partenza e configura le preferenze.
          Il piano viene calcolato e salvato automaticamente.
        </p>
      </div>

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
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#18181b", minWidth: "80px", textAlign: "right" }}>
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

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !form.clientId || belowFloor}
        style={{
          width: "100%",
          padding: "14px",
          backgroundColor:
            isGenerating || !form.clientId || belowFloor ? "#a1a1aa" : "#18181b",
          color: "#ffffff",
          border: "none",
          borderRadius: "10px",
          fontSize: "16px",
          fontWeight: 700,
          cursor:
            isGenerating || !form.clientId || belowFloor ? "not-allowed" : "pointer",
        }}
      >
        {isGenerating
          ? "Generazione in corso..."
          : belowFloor
          ? "Sotto la soglia minima — riduci il deficit"
          : "Genera Piano Nutrizionale"}
      </button>
    </div>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: "#18181b" }}>
        {value}
      </div>
    </div>
  );
}
