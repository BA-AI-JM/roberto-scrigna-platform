/**
 * Plan Review Page.
 *
 * Loads a plan via trpc.plan.getById, renders the full review UI,
 * and wires the Approva and Scarica PDF actions.
 *
 * Sections (tabbed):
 * - Panoramica: body comp summary, energy balance, assumptions
 * - Macro: day-type macro cards + TDEE
 * - Pasti: meal plan per day type
 * - Integratori: editable supplement list
 * - Guida: editable narrative fields
 * - Monitoraggio: check-in config
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { trpc } from "../../../../../lib/trpc/client";
import type { DayType, MacroTargets } from "../../../../../engine/types";
import type {
  SupplementEntry,
  GuidanceSection,
  MonitoringConfig,
  DayTypePlanSummary,
} from "../../../../../pdf/types";
import type { SerializedPlanResult } from "../../../../../services/plan-generator";

// ── Review State ─────────────────────────────────────────────────────────────

interface ReviewState {
  status: string;
  clientName: string;
  energyBalance: string;
  weeklyAvgKcal: number;
  weekSchedule: string[];
  dayTypePlans: DayTypePlanSummary[];
  supplements: SupplementEntry[];
  guidance: GuidanceSection;
  monitoring: MonitoringConfig;
  assumptions: string[];
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type ReviewTab =
  | "overview"
  | "macros"
  | "meals"
  | "supplements"
  | "guidance"
  | "monitoring";

const TABS: readonly { key: ReviewTab; label: string }[] = [
  { key: "overview", label: "Panoramica" },
  { key: "macros", label: "Macro" },
  { key: "meals", label: "Pasti" },
  { key: "supplements", label: "Integratori" },
  { key: "guidance", label: "Guida" },
  { key: "monitoring", label: "Monitoraggio" },
] as const;

// ── Labels ───────────────────────────────────────────────────────────────────

const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "Giorno di Allenamento",
  rest: "Giorno di Riposo",
  refeed: "Giorno di Refeed",
  deload: "Giorno di Deload",
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino",
  snack_1: "Spuntino 1",
  snack_2: "Spuntino 2",
  snack_3: "Spuntino 3",
  pre_workout: "Pre-Allenamento",
  post_workout: "Post-Allenamento",
};

const METRIC_LABELS: Record<string, string> = {
  weight_kg: "Peso",
  energy_level: "Energia",
  sleep_quality: "Qualità del sonno",
  stress_level: "Stress",
  hunger_level: "Fame",
  digestion: "Digestione",
  adherence_diet: "Aderenza dieta",
  adherence_training: "Aderenza allenamento",
};

const ENERGY_THEMES: Record<string, { label: string; colour: string; bg: string }> = {
  deficit: { label: "Deficit Calorico", colour: "#dc2626", bg: "#fef2f2" },
  surplus: { label: "Surplus Calorico", colour: "#16a34a", bg: "#f0fdf4" },
  maintenance: { label: "Mantenimento", colour: "#2563eb", bg: "#eff6ff" },
};

// ── Default empty state ──────────────────────────────────────────────────────

const EMPTY_STATE: ReviewState = {
  status: "draft",
  clientName: "",
  energyBalance: "maintenance",
  weeklyAvgKcal: 0,
  weekSchedule: [],
  dayTypePlans: [],
  supplements: [],
  guidance: {
    bodyCompAnalysis: "",
    nutritionStrategy: "",
    trainingNotes: "",
    coachNotes: "",
  },
  monitoring: {
    checkInFrequencyDays: 7,
    metrics: [],
    reassessmentNotes: "",
  },
  assumptions: [],
};

// ── Page Component ───────────────────────────────────────────────────────────

export default function PlanReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [planId, setPlanId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ReviewTab>("overview");
  const [isApproving, setIsApproving] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [review, setReview] = useState<ReviewState>(EMPTY_STATE);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState<string>("");
  const [shareSuccess, setShareSuccess] = useState(false);
  const [shareError, setShareError] = useState<string>("");

  // Resolve params promise (Next.js 16 app router)
  useEffect(() => {
    params.then(({ id }) => setPlanId(id));
  }, [params]);

  // Load plan data
  const { data, isLoading, error } = trpc.plan.getById.useQuery(
    { id: planId },
    { enabled: Boolean(planId) }
  );

  // Approve mutation
  const approveMutation = trpc.plan.approve.useMutation({
    onSuccess: () => {
      setApproveSuccess(true);
      setReview((prev) => ({ ...prev, status: "active" }));
    },
  });

  // Share mutation
  const shareMutation = trpc.plan.shareWithClient.useMutation({
    onSuccess: () => {
      setShareSuccess(true);
      setShareError("");
      setTimeout(() => {
        setShowShareModal(false);
        setShareSuccess(false);
      }, 2500);
    },
    onError: (err) => {
      setShareError(err.message ?? "Errore nell'invio. Riprova.");
    },
  });

  // Hydrate review state when plan data arrives
  useEffect(() => {
    if (!data?.planBundle) return;

    const bundle = data.planBundle as SerializedPlanResult;
    const rd = bundle.reportData;

    setReview({
      status: data.status,
      clientName: data.clientName,
      energyBalance: bundle.energyBalance,
      weeklyAvgKcal: bundle.weeklyPlan.weeklyAverageKcal,
      weekSchedule: bundle.weeklyPlan.days.map((d: { dayType: string }) => d.dayType),
      dayTypePlans: rd.dayTypePlans,
      supplements: bundle.supplements,
      guidance: bundle.guidance ?? EMPTY_STATE.guidance,
      monitoring: bundle.monitoring ?? EMPTY_STATE.monitoring,
      assumptions: bundle.assumptions,
    });
  }, [data]);

  // Pre-fill share email from loaded client data (macroPayload carries clientEmail if present)
  useEffect(() => {
    if (data && !shareEmail) {
      const email = (data.macroPayload as Record<string, unknown>)?.clientEmail as string | undefined;
      if (email) setShareEmail(email);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Supplement edit callbacks
  const updateSupplement = useCallback(
    (index: number, field: keyof SupplementEntry, value: string) => {
      setReview((prev) => {
        const updated = [...prev.supplements];
        const item = updated[index];
        if (item) updated[index] = { ...item, [field]: value };
        return { ...prev, supplements: updated };
      });
    },
    []
  );

  const removeSupplement = useCallback((index: number) => {
    setReview((prev) => ({
      ...prev,
      supplements: prev.supplements.filter((_, i) => i !== index),
    }));
  }, []);

  const addSupplement = useCallback(() => {
    setReview((prev) => ({
      ...prev,
      supplements: [
        ...prev.supplements,
        { name: "", dosage: "", timing: "", rationale: "" },
      ],
    }));
  }, []);

  const updateGuidance = useCallback(
    (field: keyof GuidanceSection, value: string) => {
      setReview((prev) => ({
        ...prev,
        guidance: { ...prev.guidance, [field]: value },
      }));
    },
    []
  );

  const handleApprove = useCallback(async () => {
    if (!planId) return;
    setIsApproving(true);
    try {
      await approveMutation.mutateAsync({ id: planId });
    } finally {
      setIsApproving(false);
    }
  }, [planId, approveMutation]);

  const handleDownloadPdf = useCallback(() => {
    if (!planId) return;
    window.open(`/api/pdf/${planId}`, "_blank");
  }, [planId]);

  const handleShare = useCallback(async () => {
    if (!planId) return;
    setShareError("");
    await shareMutation.mutateAsync({
      planId,
      email: shareEmail || undefined,
    });
  }, [planId, shareEmail, shareMutation]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const cardStyle = {
    padding: "20px",
    border: "1px solid #e4e4e7",
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    marginBottom: "16px",
  } as const;

  const textareaStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "vertical" as const,
    outline: "none",
    minHeight: "120px",
    lineHeight: "1.5",
    color: "#18181b",
    backgroundColor: "#ffffff",
    boxSizing: "border-box" as const,
    display: "block",
  } as const;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading || !planId) {
    return (
      <div
        style={{
          padding: "32px",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
          color: "#71717a",
        }}
      >
        <p style={{ fontSize: "14px", marginTop: "64px" }}>
          Caricamento piano...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
        <a
          href="/plans"
          style={{ fontSize: "13px", color: "#71717a", textDecoration: "none" }}
        >
          ← Torna ai Piani
        </a>
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px",
          }}
        >
          Errore nel caricamento del piano: {error.message}
        </div>
      </div>
    );
  }

  const energyTheme = ENERGY_THEMES[review.energyBalance] ?? ENERGY_THEMES.maintenance!;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
        }}
      >
        <div>
          <a
            href="/plans"
            style={{
              fontSize: "13px",
              color: "#71717a",
              textDecoration: "none",
            }}
          >
            ← Torna ai Piani
          </a>
          <h1
            style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", marginBottom: "4px" }}
          >
            Revisione Piano{review.clientName ? `: ${review.clientName}` : ""}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "3px 12px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: energyTheme.bg,
                color: energyTheme.colour,
              }}
            >
              {energyTheme.label}
            </span>
            {review.weeklyAvgKcal > 0 && (
              <span style={{ fontSize: "13px", color: "#71717a" }}>
                {review.weeklyAvgKcal.toLocaleString("it-IT")} kcal/giorno media
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {approveSuccess && (
            <span
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                color: "#16a34a",
                fontWeight: 600,
                alignSelf: "center",
              }}
            >
              Piano approvato
            </span>
          )}

          <button
            onClick={handleDownloadPdf}
            style={{
              padding: "8px 20px",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              backgroundColor: "#eff6ff",
              color: "#2563eb",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Scarica PDF
          </button>

          <button
            onClick={() => {
              setShowShareModal(true);
              setShareSuccess(false);
              setShareError("");
            }}
            style={{
              padding: "8px 20px",
              border: "1px solid #d9f99d",
              borderRadius: "8px",
              backgroundColor: "#f7fee7",
              color: "#3d7c0a",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>✉</span> Condividi con Cliente
          </button>

          {review.status !== "active" && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              style={{
                padding: "8px 20px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: isApproving ? "#6b7280" : "#16a34a",
                color: "#ffffff",
                cursor: isApproving ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {isApproving ? "Approvando..." : "Approva"}
            </button>
          )}

          {review.status === "active" && (
            <span
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                backgroundColor: "#f0fdf4",
                color: "#16a34a",
                fontSize: "13px",
                fontWeight: 600,
                border: "1px solid #bbf7d0",
              }}
            >
              Approvato
            </span>
          )}
        </div>
      </div>

      {/* Share modal */}
      {showShareModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShareModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "14px",
              padding: "28px 32px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: 0, marginBottom: "6px", color: "#18181b" }}>
              Condividi con Cliente
            </h2>
            <p style={{ fontSize: "13px", color: "#71717a", marginTop: 0, marginBottom: "20px" }}>
              Invia il piano al cliente via email con un riepilogo macro e il link al portale.
            </p>

            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#3f3f46", marginBottom: "6px" }}>
              Indirizzo email
            </label>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="email@cliente.it"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d4d4d8",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                color: "#18181b",
              }}
            />

            {shareError && (
              <p style={{ fontSize: "13px", color: "#dc2626", marginTop: "10px", marginBottom: 0 }}>
                {shareError}
              </p>
            )}

            {shareSuccess && (
              <p style={{ fontSize: "13px", color: "#16a34a", fontWeight: 600, marginTop: "10px", marginBottom: 0 }}>
                Piano condiviso con successo!
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowShareModal(false)}
                style={{
                  padding: "9px 18px",
                  border: "1px solid #e4e4e7",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  color: "#3f3f46",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleShare}
                disabled={shareMutation.isPending || shareSuccess}
                style={{
                  padding: "9px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: shareMutation.isPending || shareSuccess ? "#6b7280" : "#16a34a",
                  color: "#ffffff",
                  cursor: shareMutation.isPending || shareSuccess ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {shareMutation.isPending ? "Invio in corso..." : "Invia Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div
        style={{
          display: "flex",
          gap: "0",
          marginBottom: "24px",
          borderBottom: "2px solid #e4e4e7",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid #18181b"
                  : "2px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === tab.key ? "#18181b" : "#71717a",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeTab === tab.key ? 600 : 400,
              marginBottom: "-2px",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab review={review} cardStyle={cardStyle} />
      )}
      {activeTab === "macros" && (
        <MacrosTab dayTypePlans={review.dayTypePlans} cardStyle={cardStyle} />
      )}
      {activeTab === "meals" && (
        <MealsTab dayTypePlans={review.dayTypePlans} cardStyle={cardStyle} />
      )}
      {activeTab === "supplements" && (
        <SupplementsTab
          supplements={review.supplements}
          onUpdate={updateSupplement}
          onRemove={removeSupplement}
          onAdd={addSupplement}
          cardStyle={cardStyle}
        />
      )}
      {activeTab === "guidance" && (
        <GuidanceTab
          guidance={review.guidance}
          assumptions={review.assumptions}
          onUpdate={updateGuidance}
          textareaStyle={textareaStyle}
          cardStyle={cardStyle}
        />
      )}
      {activeTab === "monitoring" && (
        <MonitoringTab monitoring={review.monitoring} cardStyle={cardStyle} />
      )}
    </div>
  );
}

// ── Tab Components ────────────────────────────────────────────────────────────

function OverviewTab({
  review,
  cardStyle,
}: {
  review: ReviewState;
  cardStyle: React.CSSProperties;
}) {
  return (
    <div>
      <div style={cardStyle}>
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
          }}
        >
          Riepilogo Piano
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          <StatCard
            label="Media Settimanale"
            value={
              review.weeklyAvgKcal > 0
                ? `${review.weeklyAvgKcal.toLocaleString("it-IT")} kcal`
                : "—"
            }
          />
          <StatCard
            label="Tipologie Giornata"
            value={(() => {
              const trainingCount = review.weekSchedule.filter((d) => d === "training" || d === "deload").length;
              const restCount = review.weekSchedule.filter((d) => d === "rest" || d === "refeed").length;
              return review.weekSchedule.length > 0
                ? `${review.dayTypePlans.length} (${trainingCount} allenamento / ${restCount} riposo)`
                : String(review.dayTypePlans.length);
            })()}
          />
          <StatCard
            label="Integratori"
            value={String(review.supplements.length)}
          />
        </div>
      </div>

      {review.assumptions.length > 0 && (
        <div style={cardStyle}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "12px",
              marginTop: 0,
            }}
          >
            Assunzioni del Piano
          </h3>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            {review.assumptions.map((a, i) => (
              <li
                key={i}
                style={{
                  fontSize: "13px",
                  color: "#52525b",
                  marginBottom: "6px",
                  lineHeight: "1.5",
                }}
              >
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MacrosTab({
  dayTypePlans,
  cardStyle,
}: {
  dayTypePlans: DayTypePlanSummary[];
  cardStyle: React.CSSProperties;
}) {
  if (dayTypePlans.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>
          Nessun dato macro disponibile.
        </p>
      </div>
    );
  }

  return (
    <div>
      {dayTypePlans.map((plan) => (
        <div key={plan.dayType} style={cardStyle}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "14px",
              marginTop: 0,
            }}
          >
            {plan.label}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <MacroCard
              label="Kcal"
              value={Math.round(plan.macros.totalKcal)}
              unit="kcal"
              accentColour="#f59e0b"
            />
            <MacroCard
              label="Proteine"
              value={Math.round(plan.macros.proteinG)}
              unit="g"
              accentColour="#3b82f6"
            />
            <MacroCard
              label="Carboidrati"
              value={Math.round(plan.macros.carbG)}
              unit="g"
              accentColour="#8b5cf6"
            />
            <MacroCard
              label="Grassi"
              value={Math.round(plan.macros.fatG)}
              unit="g"
              accentColour="#10b981"
            />
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#71717a",
              padding: "8px 12px",
              backgroundColor: "#fafafa",
              borderRadius: "6px",
            }}
          >
            Target Calorico: {Math.round(plan.tdee.totalTdeeKcal)} kcal &nbsp;|&nbsp;
            Acqua: {plan.hydration.waterMl} ml &nbsp;|&nbsp;
            Sale: {plan.hydration.saltG.toFixed(1)} g
          </div>
        </div>
      ))}
    </div>
  );
}

function MealsTab({
  dayTypePlans,
  cardStyle,
}: {
  dayTypePlans: DayTypePlanSummary[];
  cardStyle: React.CSSProperties;
}) {
  const plansWithMeals = dayTypePlans.filter((p) => p.mealPlan);

  if (plansWithMeals.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>
          Nessun piano pasti generato.
        </p>
      </div>
    );
  }

  return (
    <div>
      {plansWithMeals.map((plan) => (
        <div key={plan.dayType} style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              {plan.label}
            </h3>
            {plan.mealPlan && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "12px",
                  backgroundColor: plan.mealPlan.withinTolerance
                    ? "#dcfce7"
                    : "#fef9c3",
                  color: plan.mealPlan.withinTolerance ? "#15803d" : "#854d0e",
                }}
              >
                {plan.mealPlan.withinTolerance ? (
                  "Entro tolleranza"
                ) : (
                  <span
                    title={`Deviazione: ${plan.mealPlan.deviation.kcal > 0 ? '+' : ''}${plan.mealPlan.deviation.kcal} kcal, P ${plan.mealPlan.deviation.proteinG > 0 ? '+' : ''}${plan.mealPlan.deviation.proteinG}g, C ${plan.mealPlan.deviation.carbsG > 0 ? '+' : ''}${plan.mealPlan.deviation.carbsG}g, F ${plan.mealPlan.deviation.fatG > 0 ? '+' : ''}${plan.mealPlan.deviation.fatG}g`}
                  >
                    Fuori tolleranza
                  </span>
                )}
              </span>
            )}
          </div>

          {plan.mealPlan?.slots.map((slot) => (
            <div
              key={slot.slot}
              style={{
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: "#fafafa",
                marginBottom: "8px",
                border: "1px solid #f4f4f5",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "#18181b",
                  }}
                >
                  {MEAL_LABELS[slot.slot] ?? slot.slot.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: "12px", color: "#71717a" }}>
                  {Math.round(slot.primary.actualMacros.kcal)} kcal &middot; P{" "}
                  {Math.round(slot.primary.actualMacros.proteinG)}g &middot; C{" "}
                  {Math.round(slot.primary.actualMacros.carbsG)}g &middot; F{" "}
                  {Math.round(slot.primary.actualMacros.fatG)}g
                </span>
              </div>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  margin: "0 0 6px 0",
                  color: "#3f3f46",
                }}
              >
                {slot.primary.template.name}
              </p>
              {slot.primary.scaledIngredients.length > 0 && (
                <ul
                  style={{
                    margin: "0 0 6px 0",
                    padding: 0,
                    listStyle: "none",
                  }}
                >
                  {slot.primary.scaledIngredients.map((ing, idx) => (
                    <li
                      key={idx}
                      style={{
                        fontSize: "13px",
                        color: "#52525b",
                        padding: "2px 0",
                        display: "flex",
                        justifyContent: "space-between",
                        borderBottom:
                          idx < slot.primary.scaledIngredients.length - 1
                            ? "1px solid #f4f4f5"
                            : "none",
                      }}
                    >
                      <span>{ing.name}</span>
                      <span style={{ fontWeight: 600, color: "#18181b" }}>
                        {Math.round(ing.grams)}g
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {slot.substitutions.length > 0 && (
                <p style={{ fontSize: "12px", color: "#a1a1aa", margin: 0 }}>
                  Alternative:{" "}
                  {slot.substitutions.map((s) => s.template.name).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SupplementsTab({
  supplements,
  onUpdate,
  onRemove,
  onAdd,
  cardStyle,
}: {
  supplements: SupplementEntry[];
  onUpdate: (index: number, field: keyof SupplementEntry, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  cardStyle: React.CSSProperties;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    fontSize: "13px",
    outline: "none",
    color: "#18181b",
    boxSizing: "border-box",
  };

  return (
    <div>
      {supplements.length === 0 && (
        <div style={{ ...cardStyle, color: "#71717a", fontSize: "14px" }}>
          Nessun integratore nel protocollo. Aggiungine uno con il pulsante qui sotto.
        </div>
      )}

      {supplements.map((s, i) => (
        <div
          key={i}
          style={{ ...cardStyle, position: "relative" }}
        >
          <button
            onClick={() => onRemove(i)}
            title="Rimuovi"
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              border: "none",
              background: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: 700,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ×
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "10px",
            }}
          >
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#71717a" }}>
              Nome
              <input
                value={s.name}
                onChange={(e) => onUpdate(i, "name", e.target.value)}
                style={{ ...inputStyle, marginTop: "4px" }}
              />
            </label>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#71717a" }}>
              Dosaggio
              <input
                value={s.dosage}
                onChange={(e) => onUpdate(i, "dosage", e.target.value)}
                style={{ ...inputStyle, marginTop: "4px" }}
              />
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#71717a" }}>
              Timing
              <input
                value={s.timing}
                onChange={(e) => onUpdate(i, "timing", e.target.value)}
                style={{ ...inputStyle, marginTop: "4px" }}
              />
            </label>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#71717a" }}>
              Razionale
              <input
                value={s.rationale ?? ""}
                onChange={(e) => onUpdate(i, "rationale", e.target.value)}
                style={{ ...inputStyle, marginTop: "4px" }}
              />
            </label>
          </div>
        </div>
      ))}

      <button
        onClick={onAdd}
        style={{
          width: "100%",
          padding: "14px",
          border: "2px dashed #d4d4d8",
          borderRadius: "12px",
          backgroundColor: "transparent",
          cursor: "pointer",
          fontSize: "14px",
          color: "#71717a",
          fontWeight: 500,
        }}
      >
        + Aggiungi Integratore
      </button>
    </div>
  );
}

function GuidanceTab({
  guidance,
  assumptions,
  onUpdate,
  textareaStyle,
  cardStyle,
}: {
  guidance: GuidanceSection;
  assumptions: string[];
  onUpdate: (field: keyof GuidanceSection, value: string) => void;
  textareaStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
}) {
  const fields: { key: keyof GuidanceSection; label: string }[] = [
    { key: "bodyCompAnalysis", label: "Analisi Composizione Corporea" },
    { key: "nutritionStrategy", label: "Strategia Nutrizionale" },
    { key: "trainingNotes", label: "Note Allenamento" },
    { key: "coachNotes", label: "Note del Coach" },
  ];

  return (
    <div>
      {fields.map((f) => (
        <div key={f.key} style={cardStyle}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "8px",
              color: "#18181b",
            }}
          >
            {f.label}
          </label>
          <textarea
            value={guidance[f.key] ?? ""}
            onChange={(e) => onUpdate(f.key, e.target.value)}
            style={textareaStyle}
            rows={6}
            placeholder={`${f.label}...`}
          />
        </div>
      ))}
    </div>
  );
}

function MonitoringTab({
  monitoring,
  cardStyle,
}: {
  monitoring: MonitoringConfig;
  cardStyle: React.CSSProperties;
}) {
  return (
    <div style={cardStyle}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "20px",
          marginTop: 0,
        }}
      >
        Configurazione Monitoraggio
      </h3>

      <div style={{ marginBottom: "20px" }}>
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#71717a",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 4px 0",
          }}
        >
          Frequenza Check-in
        </p>
        <p style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#18181b" }}>
          Ogni {monitoring.checkInFrequencyDays} giorni
        </p>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#71717a",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 8px 0",
          }}
        >
          Metriche Monitorate
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {monitoring.metrics.map((m) => (
            <span
              key={m}
              style={{
                padding: "4px 12px",
                borderRadius: "20px",
                backgroundColor: "#f4f4f5",
                fontSize: "12px",
                fontWeight: 500,
                color: "#3f3f46",
              }}
            >
              {METRIC_LABELS[m] ?? m.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {monitoring.reassessmentNotes && (
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#71717a",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: "0 0 4px 0",
            }}
          >
            Criteri Rivalutazione
          </p>
          <p
            style={{
              fontSize: "14px",
              margin: 0,
              color: "#3f3f46",
              lineHeight: "1.5",
            }}
          >
            {monitoring.reassessmentNotes}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "8px",
        backgroundColor: "#fafafa",
        border: "1px solid #f4f4f5",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          color: "#71717a",
          margin: "0 0 6px 0",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#18181b" }}
      >
        {value}
      </p>
    </div>
  );
}

function MacroCard({
  label,
  value,
  unit,
  accentColour,
}: {
  label: string;
  value: number;
  unit: string;
  accentColour: string;
}) {
  return (
    <div
      style={{
        padding: "14px",
        borderRadius: "8px",
        backgroundColor: "#fafafa",
        border: "1px solid #f4f4f5",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          color: "#71717a",
          margin: "0 0 6px 0",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0 }}>
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: accentColour,
          }}
        >
          {value}
        </span>
        <span
          style={{ fontSize: "12px", fontWeight: 400, color: "#a1a1aa", marginLeft: "2px" }}
        >
          {unit}
        </span>
      </p>
    </div>
  );
}
