/**
 * Plan Review Page.
 *
 * Loads a plan via trpc.plan.getById, renders the full review UI,
 * and wires the Approva and Scarica PDF actions.
 *
 * Sections (tabbed):
 * - Panoramica: body comp summary, energy balance, assumptions
 * - Macro: day-type macro cards + TDEE + editable plan narrative (#3: the
 *   "Note e strategia" fields relocated here from the removed "Guida" tab)
 * - Pasti: meal plan per day type
 * - Integratori: editable supplement list
 * - Monitoraggio: check-in config
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { trpc } from "../../../../../lib/trpc/client";
import type { DayType, MacroTargets } from "../../../../../engine/types";
import { computeSlotDeviation as slotDeviation } from "../../../../../engine/meal-plan/types";
import type {
  SupplementEntry,
  GuidanceSection,
  MonitoringConfig,
  DayTypePlanSummary,
} from "../../../../../pdf/types";
import type { SerializedPlanResult } from "../../../../../services/plan-generator";
import { formatIngredientQuantity } from "../../../../../lib/ingredient-display";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { VersionsTab } from "@/components/plan/versions-tab";
import { buildCreateVersionInput } from "@/components/plan/version-helpers";
import { SupplementsEditor } from "@/components/plan/supplements-editor";
import { PlanNotesSection } from "@/components/plan/plan-notes-section";

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
  | "monitoring"
  | "versions";

const TABS: readonly { key: ReviewTab; label: string }[] = [
  { key: "overview", label: "Panoramica" },
  { key: "macros", label: "Macro" },
  { key: "meals", label: "Pasti" },
  { key: "supplements", label: "Integratori" },
  { key: "monitoring", label: "Monitoraggio" },
  { key: "versions", label: "Versioni" },
] as const;

// ── Labels ───────────────────────────────────────────────────────────────────

const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "Giorno di Allenamento",
  rest: "Giorno di Riposo",
  refeed: "Giorno di Refeed",
  deload: "Giorno di Deload",
};

// Compact day-type names for the scannable daily-totals summary (Item #16).
const DAY_TYPE_SHORT_LABELS: Record<DayType, string> = {
  training: "Allenamento",
  rest: "Riposo",
  refeed: "Refeed",
  deload: "Deload",
};

// Macro accent colours — mirror the per-day-type MacroCard palette below so the
// summary reads as native to the rest of the review UI.
const MACRO_ACCENTS = {
  kcal: "#f59e0b",
  protein: "#3b82f6",
  carb: "#8b5cf6",
  fat: "#10b981",
} as const;

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino",
  snack_1: "Spuntino 1",
  snack_2: "Spuntino 2",
  snack_3: "Spuntino 3",
  pre_workout: "Pre-Allenamento",
  post_workout: "Spuntino proteico",
};

const EXERCISE_METHOD_LABELS: Record<string, string> = {
  sport_correction_protocol: "Sport Correction Protocol (zone FC)",
  heart_rate: "Frequenza cardiaca (Keytel)",
  met_value: "METs (da sessioni inserite)",
  session_estimate: "Stima per sessione",
  default_estimate: "Stima predefinita (300 kcal)",
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

  // Save edits mutation (persists supplement + guidance changes)
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saveEditsMutation = trpc.plan.saveEdits.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setSaveError("");
      setTimeout(() => setSaveSuccess(false), 2500);
    },
    onError: (err) => setSaveError(err.message ?? "Errore nel salvataggio."),
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

  // ── Plan versioning ──────────────────────────────────────────────────────────
  const router = useRouter();
  const queryClient = useQueryClient();

  // PR #12: getById returns rootPlanId, so the chain resolves in ONE query.
  const versionRoot = data?.rootPlanId ?? null;
  const versionsQuery = trpc.plan.listVersions.useQuery(
    { rootPlanId: versionRoot ?? "" },
    { enabled: Boolean(versionRoot) }
  );
  const versions = versionsQuery.data?.versions ?? [];
  const versionsLoading = versionsQuery.isLoading;

  const createVersionMutation = trpc.plan.createVersion.useMutation({
    onSuccess: (res) => {
      void queryClient.invalidateQueries({
        queryKey: getQueryKey(trpc.plan.listVersions),
      });
      router.push(`/plans/${res.planId}/review`);
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

  const addSupplementEntries = useCallback((entries: SupplementEntry[]) => {
    setReview((prev) => ({
      ...prev,
      supplements: [...prev.supplements, ...entries],
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

  const handleSaveEdits = useCallback(async () => {
    if (!planId) return;
    setSaveError("");
    await saveEditsMutation.mutateAsync({
      planId,
      supplements: review.supplements.map((s) => ({
        name: s.name,
        dosage: s.dosage,
        timing: s.timing,
        rationale: s.rationale ?? "",
      })),
      guidance: review.guidance,
    });
  }, [planId, review.supplements, review.guidance, saveEditsMutation]);

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

          {(saveSuccess || saveError) && (
            <span
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                color: saveError ? "#dc2626" : "#16a34a",
                fontWeight: 600,
                alignSelf: "center",
              }}
            >
              {saveError ? saveError : "Modifiche salvate"}
            </span>
          )}

          <button
            onClick={handleSaveEdits}
            disabled={saveEditsMutation.isPending}
            title="Salva le modifiche a integratori e testi guida"
            style={{
              padding: "8px 20px",
              border: "1px solid #e4e4e7",
              borderRadius: "8px",
              backgroundColor: saveEditsMutation.isPending ? "#f4f4f5" : "#ffffff",
              color: saveEditsMutation.isPending ? "#a1a1aa" : "#3f3f46",
              cursor: saveEditsMutation.isPending ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {saveEditsMutation.isPending ? "Salvataggio…" : "Salva modifiche"}
          </button>

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

      {/* Post-approval: how the client receives the plan */}
      {(review.status === "active" || approveSuccess) && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 18px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
            fontSize: "13px",
            color: "#166534",
            lineHeight: "1.6",
          }}
        >
          <strong>Piano attivo.</strong> Il cliente lo vede nel suo portale all'indirizzo{" "}
          <a
            href={`${typeof window !== "undefined" ? window.location.origin : ""}/portal/login`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#15803d", fontWeight: 600 }}
          >
            {(typeof window !== "undefined" ? window.location.origin : "")}/portal/login
          </a>
          . Usa <em>“Condividi con Cliente”</em> per inviargli un'email con il riepilogo e il link.
          Se il cliente non ha ancora accesso, invitalo dalla sua scheda (pulsante <em>“Invita al portale”</em>).
        </div>
      )}

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
        <MacrosTab
          dayTypePlans={review.dayTypePlans}
          cardStyle={cardStyle}
          guidance={review.guidance}
          onUpdateGuidance={updateGuidance}
          textareaStyle={textareaStyle}
        />
      )}
      {activeTab === "meals" && (
        <MealsTab dayTypePlans={review.dayTypePlans} cardStyle={cardStyle} planId={planId} />
      )}
      {activeTab === "supplements" && (
        <SupplementsTab
          supplements={review.supplements}
          onUpdate={updateSupplement}
          onRemove={removeSupplement}
          onAddEntries={addSupplementEntries}
        />
      )}
      {activeTab === "monitoring" && (
        <MonitoringTab monitoring={review.monitoring} cardStyle={cardStyle} />
      )}
      {activeTab === "versions" && (
        <VersionsTab
          versions={versions}
          loading={versionsLoading}
          currentPlanId={planId}
          isRegenerating={createVersionMutation.isPending}
          regenerateError={createVersionMutation.error?.message ?? null}
          onRegenerate={(reason) =>
            createVersionMutation.mutate(buildCreateVersionInput(planId, reason))
          }
          onOpenVersion={(id) => router.push(`/plans/${id}/review`)}
        />
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
      <DailyTotalsTable dayTypePlans={review.dayTypePlans} cardStyle={cardStyle} />
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
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
  guidance,
  onUpdateGuidance,
  textareaStyle,
}: {
  dayTypePlans: DayTypePlanSummary[];
  cardStyle: React.CSSProperties;
  guidance: GuidanceSection;
  onUpdateGuidance: (field: keyof GuidanceSection, value: string) => void;
  textareaStyle: React.CSSProperties;
}) {
  return (
    <div>
      {dayTypePlans.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>
            Nessun dato macro disponibile.
          </p>
        </div>
      ) : (
        <>
          <DailyTotalsTable dayTypePlans={dayTypePlans} cardStyle={cardStyle} />
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
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
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
          {/* Per-day energy-expenditure breakdown (BMR + NEAT + Exercise + TEF) */}
          <div
            style={{
              fontSize: "12px",
              color: "#52525b",
              padding: "10px 12px",
              backgroundColor: "#fafafa",
              borderRadius: "6px",
              marginBottom: "8px",
            }}
          >
            <div style={{ fontWeight: 600, color: "#3f3f46", marginBottom: "6px" }}>
              Composizione del fabbisogno (TDEE)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: "8px",
                textAlign: "center",
              }}
            >
              {[
                { k: "Metabolismo basale", v: plan.tdee.bmr.bmrKcal },
                { k: "NEAT (passi + lavoro)", v: plan.tdee.neat.totalNeatKcal },
                { k: "Esercizio", v: plan.tdee.exercise.exerciseKcal },
                { k: "Termogenesi (TEF)", v: plan.tdee.tef.tefKcal },
                { k: "TDEE totale", v: plan.tdee.totalTdeeKcal, strong: true },
              ].map((c) => (
                <div key={c.k}>
                  <div style={{ fontSize: "10px", color: "#a1a1aa", marginBottom: "2px" }}>
                    {c.k}
                  </div>
                  <div
                    style={{
                      fontSize: c.strong ? "15px" : "13px",
                      fontWeight: c.strong ? 700 : 600,
                      color: c.strong ? "#18181b" : "#3f3f46",
                    }}
                  >
                    {Math.round(c.v)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#a1a1aa" }}>
              Esercizio stimato con:{" "}
              {EXERCISE_METHOD_LABELS[plan.tdee.exercise.methodUsed] ??
                plan.tdee.exercise.methodUsed}
            </div>
          </div>

          {/* Energy Availability — per v4.4 spec §Step 9 */}
          {(() => {
            const ffm = plan.tdee.bmr.bodyComposition.leanMassKg;
            const exercise = plan.tdee.exercise.exerciseKcal;
            const intake = plan.macros.totalKcal;
            if (!ffm || ffm <= 0) return null;
            const ea = Math.round(((intake - exercise) / ffm) * 10) / 10;
            const band =
              ea >= 45
                ? { label: "Ottimale", colour: "#15803d", bg: "#f0fdf4" }
                : ea >= 30
                ? { label: "Adeguata", colour: "#2563eb", bg: "#eff6ff" }
                : ea >= 20
                ? { label: "Bassa", colour: "#b45309", bg: "#fffbeb" }
                : { label: "Critica", colour: "#b91c1c", bg: "#fef2f2" };
            return (
              <div
                style={{
                  marginBottom: "8px",
                  padding: "8px 12px",
                  backgroundColor: band.bg,
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: band.colour,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  Energy Availability: {ea} kcal/kg massa magra
                </span>
                <span
                  style={{
                    padding: "1px 8px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    fontWeight: 600,
                    fontSize: "11px",
                  }}
                >
                  {band.label}
                </span>
                <span style={{ fontSize: "11px", opacity: 0.8 }}>
                  (intake {Math.round(intake)} − esercizio {exercise} ÷ FFM {ffm.toFixed(1)} kg)
                </span>
              </div>
            );
          })()}

          <div
            style={{
              fontSize: "12px",
              color: "#71717a",
              padding: "8px 12px",
              backgroundColor: "#fafafa",
              borderRadius: "6px",
            }}
          >
            Apporto pianificato: {Math.round(plan.macros.totalKcal)} kcal &nbsp;|&nbsp;
            Acqua: {plan.hydration.waterMl} ml &nbsp;|&nbsp;
            Sale: {plan.hydration.saltG.toFixed(1)} g
          </div>
        </div>
      ))}
        </>
      )}
      {/* #3 — guidance narrative relocated here from the removed "Guida" tab. */}
      <PlanNotesSection
        guidance={guidance}
        onUpdate={onUpdateGuidance}
        textareaStyle={textareaStyle}
        cardStyle={cardStyle}
      />
    </div>
  );
}

function MealsTab({
  dayTypePlans,
  cardStyle,
  planId,
}: {
  dayTypePlans: DayTypePlanSummary[];
  cardStyle: React.CSSProperties;
  planId: string;
}) {
  const adjustMutation = trpc.plan.adjustPortions.useMutation({
    onSuccess: (result) => {
      alert(`Porzioni aggiustate: ${result.previousKcal} \u2192 ${result.newKcal} kcal (\xd7${result.scaleFactor.toFixed(2)})`);
      window.location.reload();
    },
    onError: (err) => {
      alert(`Errore: ${err.message}`);
    },
  });

  // Which slot currently has its "Alternative" panel expanded (one at a time per page).
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [swappingId, setSwappingId] = useState<string | null>(null);

  const swapMutation = trpc.plan.swapMealSelection.useMutation({
    onSettled: () => setSwappingId(null),
    onSuccess: () => window.location.reload(),
    onError: (err) => alert(`Errore: ${err.message}`),
  });

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
              <>
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
              {!plan.mealPlan.withinTolerance && (
                <button
                  onClick={() => adjustMutation.mutate({ planId, dayType: plan.dayType })}
                  disabled={adjustMutation.isPending}
                  title="Riscala automaticamente le porzioni di questo giorno per centrare il target calorico"
                  style={{
                    marginLeft: "8px",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    backgroundColor: adjustMutation.isPending ? "#e5e7eb" : "#dbeafe",
                    color: adjustMutation.isPending ? "#9ca3af" : "#1d4ed8",
                    border: "none",
                    cursor: adjustMutation.isPending ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {adjustMutation.isPending ? "Aggiustando…" : "Aggiusta Porzioni"}
                </button>
              )}
              </>
            )}
          </div>

          {plan.mealPlan?.slots.map((slot) => {
            // Per-meal tolerance check (spec §10.8.3: ±5 g P, ±5 g F, ±10 g C, ±50 kcal)
            const dev = slotDeviation(slot.primary.actualMacros, slot.targetMacros);
            const slotOOT =
              Math.abs(dev.proteinG) > 5 ||
              Math.abs(dev.fatG) > 5 ||
              Math.abs(dev.carbsG) > 10 ||
              Math.abs(dev.kcal) > 50;
            return (
            <div
              key={slot.slot}
              style={{
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: "#fafafa",
                marginBottom: "8px",
                border: slotOOT ? "1px solid #fde68a" : "1px solid #f4f4f5",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
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
                  {slotOOT && (
                    <span
                      title={`Deviazione vs target: ${dev.kcal > 0 ? "+" : ""}${dev.kcal} kcal · P ${
                        dev.proteinG > 0 ? "+" : ""
                      }${dev.proteinG}g · C ${dev.carbsG > 0 ? "+" : ""}${
                        dev.carbsG
                      }g · F ${dev.fatG > 0 ? "+" : ""}${dev.fatG}g`}
                      style={{
                        marginLeft: "8px",
                        padding: "1px 8px",
                        borderRadius: "10px",
                        backgroundColor: "#fef9c3",
                        color: "#854d0e",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}
                    >
                      Fuori tolleranza pasto
                    </span>
                  )}
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
                        {formatIngredientQuantity(ing.foodId, ing.grams)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {slot.substitutions.length > 0 && (() => {
                const expandedKey = `${plan.dayType}::${slot.slot}`;
                const isExpanded = expandedSlot === expandedKey;
                return (
                  <div style={{ marginTop: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedSlot(isExpanded ? null : expandedKey)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#3b82f6",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "▾" : "▸"} {slot.substitutions.length} alternativ
                      {slot.substitutions.length === 1 ? "a" : "e"}{" "}
                      {!isExpanded && (
                        <span style={{ color: "#a1a1aa", fontWeight: 400 }}>
                          ({slot.substitutions
                            .map((s) => s.template.name)
                            .slice(0, 3)
                            .join(", ")}
                          {slot.substitutions.length > 3 ? ", …" : ""})
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                        {slot.substitutions.map((sub) => (
                          <div
                            key={sub.template.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "8px",
                              backgroundColor: "#ffffff",
                              border: "1px solid #e4e4e7",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "8px",
                                alignItems: "flex-start",
                                marginBottom: "4px",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "#18181b",
                                  }}
                                >
                                  {sub.template.name}
                                </div>
                                <div style={{ fontSize: "11px", color: "#71717a" }}>
                                  {Math.round(sub.actualMacros.kcal)} kcal · P{" "}
                                  {Math.round(sub.actualMacros.proteinG)}g · C{" "}
                                  {Math.round(sub.actualMacros.carbsG)}g · F{" "}
                                  {Math.round(sub.actualMacros.fatG)}g
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSwappingId(sub.template.id);
                                  swapMutation.mutate({
                                    planId,
                                    dayType: plan.dayType,
                                    slot: slot.slot,
                                    substitutionTemplateId: sub.template.id,
                                  });
                                }}
                                disabled={
                                  swapMutation.isPending && swappingId === sub.template.id
                                }
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  backgroundColor:
                                    swapMutation.isPending && swappingId === sub.template.id
                                      ? "#e5e7eb"
                                      : "#1a1a2e",
                                  color:
                                    swapMutation.isPending && swappingId === sub.template.id
                                      ? "#9ca3af"
                                      : "#ffffff",
                                  border: "none",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor:
                                    swapMutation.isPending && swappingId === sub.template.id
                                      ? "not-allowed"
                                      : "pointer",
                                  flexShrink: 0,
                                }}
                              >
                                {swapMutation.isPending && swappingId === sub.template.id
                                  ? "Cambio…"
                                  : "Usa come principale"}
                              </button>
                            </div>
                            {sub.scaledIngredients.length > 0 && (
                              <ul
                                style={{
                                  margin: "6px 0 0 0",
                                  padding: 0,
                                  listStyle: "none",
                                }}
                              >
                                {sub.scaledIngredients.map((ing, idx) => (
                                  <li
                                    key={idx}
                                    style={{
                                      fontSize: "12px",
                                      color: "#52525b",
                                      padding: "1px 0",
                                      display: "flex",
                                      justifyContent: "space-between",
                                    }}
                                  >
                                    <span>{ing.name}</span>
                                    <span
                                      style={{ fontWeight: 600, color: "#3f3f46" }}
                                    >
                                      {formatIngredientQuantity(ing.foodId, ing.grams)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SupplementsTab({
  supplements,
  onUpdate,
  onRemove,
  onAddEntries,
}: {
  supplements: SupplementEntry[];
  onUpdate: (index: number, field: keyof SupplementEntry, value: string) => void;
  onRemove: (index: number) => void;
  onAddEntries: (entries: SupplementEntry[]) => void;
}) {
  return (
    <SupplementsEditor
      supplements={supplements}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onAddEntries={onAddEntries}
    />
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

/**
 * Daily targets summary (Item #16).
 *
 * A compact, scannable comparison of per-day-type calorie + macro targets:
 * rows = the day types present in the plan, columns = Kcal · Proteine ·
 * Carboidrati · Grassi. Under each macro gram value we show its share of total
 * kcal (protein/carb at 4 kcal·g⁻¹, fat at 9 kcal·g⁻¹) as a muted sub-value.
 *
 * Reads only `review.dayTypePlans[].macros` / `.dayType` / `.label` — no new
 * data or query. Renders cleanly for a single day type (weekly-average mode)
 * through to all four; horizontal scroll keeps it intact on narrow screens.
 */
function DailyTotalsTable({
  dayTypePlans,
  cardStyle,
}: {
  dayTypePlans: DayTypePlanSummary[];
  cardStyle: React.CSSProperties;
}) {
  if (dayTypePlans.length === 0) return null;

  const headerCellStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
    padding: "0 12px 8px 12px",
    textAlign: "right",
  };

  const pctOfKcal = (macroKcal: number, totalKcal: number) =>
    totalKcal > 0 ? Math.round((macroKcal / totalKcal) * 100) : null;

  return (
    <div style={cardStyle}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "14px",
          marginTop: 0,
        }}
      >
        Target Giornalieri
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "440px",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, textAlign: "left" }}>Giorno</th>
              <th style={headerCellStyle}>Kcal</th>
              <th style={headerCellStyle}>Proteine</th>
              <th style={headerCellStyle}>Carboidrati</th>
              <th style={headerCellStyle}>Grassi</th>
            </tr>
          </thead>
          <tbody>
            {dayTypePlans.map((plan) => {
              const m = plan.macros;
              return (
                <tr key={plan.dayType} style={{ borderTop: "1px solid #f4f4f5" }}>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#18181b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {DAY_TYPE_SHORT_LABELS[plan.dayType] ?? plan.label}
                  </td>
                  <MacroValueCell
                    value={Math.round(m.totalKcal)}
                    unit="kcal"
                    colour={MACRO_ACCENTS.kcal}
                  />
                  <MacroValueCell
                    value={Math.round(m.proteinG)}
                    unit="g"
                    colour={MACRO_ACCENTS.protein}
                    pct={pctOfKcal(m.proteinG * 4, m.totalKcal)}
                  />
                  <MacroValueCell
                    value={Math.round(m.carbG)}
                    unit="g"
                    colour={MACRO_ACCENTS.carb}
                    pct={pctOfKcal(m.carbG * 4, m.totalKcal)}
                  />
                  <MacroValueCell
                    value={Math.round(m.fatG)}
                    unit="g"
                    colour={MACRO_ACCENTS.fat}
                    pct={pctOfKcal(m.fatG * 9, m.totalKcal)}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MacroValueCell({
  value,
  unit,
  colour,
  pct,
}: {
  value: number;
  unit: string;
  colour: string;
  pct?: number | null;
}) {
  return (
    <td style={{ padding: "10px 12px", textAlign: "right", verticalAlign: "top" }}>
      <div style={{ whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "18px", fontWeight: 700, color: colour }}>
          {value}
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "#a1a1aa",
            marginLeft: "2px",
          }}
        >
          {unit}
        </span>
      </div>
      {pct != null && (
        <div style={{ fontSize: "11px", color: "#a1a1aa", marginTop: "2px" }}>
          {pct}%
        </div>
      )}
    </td>
  );
}
