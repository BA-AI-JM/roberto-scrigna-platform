/**
 * Portal Dashboard — client-facing overview page.
 *
 * Sections:
 * - Header: client name greeting + last login
 * - Active Plan: plan name/status + today's meals with ingredients
 * - Check-in: next check-in / history
 * - Quick Stats: current weight, days on plan, adherence
 */

"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}

function daysBetween(from: string | null | undefined, to: string): number {
  if (!from) return 0;
  const msPerDay = 86400000;
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / msPerDay));
}

const todayISO = new Date().toISOString().split("T")[0]!;

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Spuntino",
  pre_workout: "Pre-allenamento",
  post_workout: "Post-allenamento",
};

// ── Shared Styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "24px",
  marginBottom: "24px",
} as const;

const sectionTitle = {
  fontSize: "16px",
  fontWeight: 700 as const,
  color: "#1a1a2e",
  marginBottom: "18px",
  marginTop: 0,
};

const pillStyle = (color: string, bg: string) => ({
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: "20px",
  fontSize: "12px",
  fontWeight: 600 as const,
  color,
  backgroundColor: bg,
});

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ width, height }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width ?? "100%",
        height: height ?? "18px",
        backgroundColor: "#e5e7eb",
        borderRadius: "6px",
      }}
    />
  );
}

// ── Active Plan Section ───────────────────────────────────────────────────────

type MealSlot = {
  slot: string;
  primary: {
    template: { name: string };
    scaledIngredients: Array<{ name: string; grams: number }>;
    actualMacros: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  };
};

type DayTypeMealPlan = {
  dayType: string;
  label: string;
  mealPlan?: {
    withinTolerance: boolean;
    slots: MealSlot[];
  };
};

type ActivePlan = {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  daily_targets?: Record<string, unknown> | null;
  meals_per_day?: number | null;
  meal_distribution?: unknown | null;
  mealPlan?: DayTypeMealPlan[] | null;
  notes?: string | null;
  supplement_protocol?: Array<{
    id: string;
    name: string;
    is_active: boolean;
    supplement_item?: Array<{
      id: string;
      name: string;
      dosage: string;
      timing: string;
      frequency: string;
      sort_order?: number;
    }>;
  }> | null;
};

function ActivePlanSection({ plan, loading }: { plan: ActivePlan | null | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Piano Attivo</p>
        <Skeleton width="55%" height="22px" />
        <div style={{ marginTop: "12px" }}>
          <Skeleton width="35%" height="14px" />
        </div>
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column" as const, gap: "12px" }}>
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
        <div
          style={{
            padding: "28px",
            background: "#f8fafc",
            borderRadius: "10px",
            textAlign: "center" as const,
            border: "1px dashed #cbd5e1",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            Nessun piano attivo
          </p>
          <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>
            Il tuo nutrizionista sta preparando il tuo piano.
          </p>
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

      {/* Plan meta */}
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>
          {plan.name}
        </h3>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" as const }}>
          {plan.start_date && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              Inizio: <strong style={{ color: "#374151" }}>{formatDate(plan.start_date)}</strong>
            </span>
          )}
          {plan.end_date && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              Fine: <strong style={{ color: "#374151" }}>{formatDate(plan.end_date)}</strong>
            </span>
          )}
          <span style={{ fontSize: "13px", color: "#6b7280" }}>
            Giorni seguiti: <strong style={{ color: "#1a1a2e" }}>{daysOnPlan}</strong>
          </span>
        </div>
      </div>

      {/* Daily macro targets */}
      {targets != null ? (
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap" as const,
            padding: "16px",
            background: "#f8fafc",
            borderRadius: "10px",
            marginBottom: "20px",
          }}
        >
          {[
            { label: "Kcal", key: "kcal", unit: "" },
            { label: "Proteine", key: "protein_g", unit: "g" },
            { label: "Carboidrati", key: "carbs_g", unit: "g" },
            { label: "Grassi", key: "fat_g", unit: "g" },
          ].map(({ label, key, unit }) =>
            targets[key] != null ? (
              <div
                key={key}
                style={{
                  flex: "1 1 80px",
                  minWidth: "80px",
                  textAlign: "center" as const,
                }}
              >
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>
                  {String(targets[key] ?? "")}{unit}
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>{label}</div>
              </div>
            ) : null
          )}
        </div>
      ) : null}

      {/* Meal plan — show meals with scaled ingredients from plan bundle */}
      {Array.isArray(plan.mealPlan) && plan.mealPlan.length > 0 && (
        <MealPlanSection dayTypePlans={plan.mealPlan} />
      )}

      {/* Supplements */}
      {Array.isArray(plan.supplement_protocol) && plan.supplement_protocol.length > 0 && (
        <SupplementSection protocols={plan.supplement_protocol} />
      )}

      {plan.notes && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            background: "#fffbeb",
            borderLeft: "4px solid #f59e0b",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#92400e",
          }}
        >
          <strong>Note del coach:</strong> {plan.notes}
        </div>
      )}
    </div>
  );
}

function MealPlanSection({ dayTypePlans }: { dayTypePlans: DayTypeMealPlan[] }) {
  const plansWithMeals = dayTypePlans.filter((p) => p.mealPlan && p.mealPlan.slots.length > 0);

  if (plansWithMeals.length === 0) return null;

  return (
    <div>
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#374151", marginBottom: "12px" }}>
        I tuoi pasti
      </p>
      {plansWithMeals.map((dayPlan) => (
        <div key={dayPlan.dayType} style={{ marginBottom: "20px" }}>
          {/* Day type label */}
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: "8px",
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
            }}
          >
            {dayPlan.label}
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px" }}>
            {dayPlan.mealPlan!.slots.map((slot) => {
              const macros = slot.primary.actualMacros;
              const ingredients = slot.primary.scaledIngredients;

              return (
                <div
                  key={slot.slot}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    overflow: "hidden",
                  }}
                >
                  {/* Slot header */}
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>
                      {MEAL_LABELS[slot.slot] ?? slot.slot.replace(/_/g, " ")}
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>{Math.round(macros.kcal)} kcal</span>
                      <span style={{ fontSize: "12px", color: "#3b82f6" }}>P {Math.round(macros.proteinG)}g</span>
                      <span style={{ fontSize: "12px", color: "#f59e0b" }}>C {Math.round(macros.carbsG)}g</span>
                      <span style={{ fontSize: "12px", color: "#ef4444" }}>G {Math.round(macros.fatG)}g</span>
                    </div>
                  </div>

                  {/* Meal template name */}
                  <div
                    style={{
                      padding: "10px 16px 4px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#374151",
                    }}
                  >
                    {slot.primary.template.name}
                  </div>

                  {/* Scaled ingredients */}
                  {ingredients.length > 0 ? (
                    <div style={{ padding: "4px 16px 12px" }}>
                      {ingredients.map((ing, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "5px 0",
                            borderBottom: idx < ingredients.length - 1 ? "1px solid #f1f5f9" : "none",
                          }}
                        >
                          <span style={{ fontSize: "13px", color: "#374151" }}>{ing.name}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a2e", whiteSpace: "nowrap" as const }}>
                            {ing.grams}g
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "8px 16px 12px" }}>
                      <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>
                        Nessun ingrediente specificato.
                      </p>
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

function SupplementSection({
  protocols,
}: {
  protocols: Array<{
    id: string;
    name: string;
    is_active: boolean;
    supplement_item?: Array<{
      id: string;
      name: string;
      dosage: string;
      timing: string;
      frequency: string;
      sort_order?: number;
    }>;
  }>;
}) {
  const activeProtocols = protocols.filter((p) => p.is_active);
  if (activeProtocols.length === 0) return null;

  const allItems = activeProtocols.flatMap((p) =>
    (p.supplement_item ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  );

  if (allItems.length === 0) return null;

  return (
    <div style={{ marginTop: "20px" }}>
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#374151", marginBottom: "12px" }}>
        Integratori
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "10px",
        }}
      >
        {allItems.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "12px 14px",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0c4a6e", marginBottom: "4px" }}>
              {item.name}
            </div>
            <div style={{ fontSize: "12px", color: "#0369a1" }}>{item.dosage} · {item.timing}</div>
            <div style={{ fontSize: "11px", color: "#7dd3fc", marginTop: "2px" }}>{item.frequency}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Check-In Section ──────────────────────────────────────────────────────────

type CheckInStatus = {
  latestCheckIn: {
    id: string;
    check_in_date: string;
    weight_kg: number | null;
    nutrition_adherence: number | null;
    training_adherence: number | null;
  } | null;
  pendingToken: string | null;
};

function CheckInSection({ data, loading }: { data: CheckInStatus | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Check-in</p>
        <Skeleton height="60px" />
      </div>
    );
  }

  const hasPending = Boolean(data?.pendingToken);
  const latest = data?.latestCheckIn;

  return (
    <div style={cardStyle}>
      <p style={sectionTitle}>Check-in</p>

      {/* Pending token — check-in available */}
      {hasPending ? (
        <div
          style={{
            padding: "18px 20px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap" as const,
            marginBottom: latest ? "16px" : 0,
          }}
        >
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#92400e", margin: "0 0 4px" }}>
              Check-in disponibile
            </p>
            <p style={{ fontSize: "13px", color: "#b45309", margin: 0 }}>
              Il tuo coach ha inviato un check-in settimanale. Completalo ora!
            </p>
          </div>
          <Link
            href={`/monitoring/checkin/${data!.pendingToken}`}
            style={{
              padding: "10px 20px",
              backgroundColor: "#f59e0b",
              color: "#ffffff",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 700,
              whiteSpace: "nowrap" as const,
            }}
          >
            Inizia check-in
          </Link>
        </div>
      ) : (
        <div
          style={{
            padding: "14px 18px",
            background: "#f8fafc",
            borderRadius: "10px",
            fontSize: "13px",
            color: "#6b7280",
            marginBottom: latest ? "16px" : 0,
          }}
        >
          Nessun check-in in attesa. Il tuo coach ti avviserà quando sarà il momento.
        </div>
      )}

      {/* Latest check-in summary */}
      {latest && (
        <div>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "10px" }}>
            Ultimo check-in — {formatDate(latest.check_in_date)}
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const }}>
            {latest.weight_kg != null && (
              <div
                style={{
                  flex: "1 1 100px",
                  padding: "12px 16px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  textAlign: "center" as const,
                }}
              >
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e" }}>
                  {latest.weight_kg}
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Peso (kg)</div>
              </div>
            )}
            {latest.nutrition_adherence != null && (
              <div
                style={{
                  flex: "1 1 100px",
                  padding: "12px 16px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  textAlign: "center" as const,
                }}
              >
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#22c55e" }}>
                  {latest.nutrition_adherence}%
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Aderenza nutrizionale</div>
              </div>
            )}
            {latest.training_adherence != null && (
              <div
                style={{
                  flex: "1 1 100px",
                  padding: "12px 16px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  textAlign: "center" as const,
                }}
              >
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#3b82f6" }}>
                  {latest.training_adherence}%
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Aderenza allenamento</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weight History / Quick Stats ──────────────────────────────────────────────

type DashboardData = {
  weightTrend: Array<{
    check_in_date: string;
    weight_kg: number | null;
    nutrition_adherence: number | null;
    training_adherence: number | null;
  }>;
  trainingLogs: unknown[];
  diaryEntries: unknown[];
  activePlan: { daily_targets: unknown; meals_per_day: number | null } | null;
};

function WeightHistorySection({ data, planStartDate, loading }: {
  data: DashboardData | undefined;
  planStartDate: string | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Storico Peso</p>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height="40px" />)}
        </div>
      </div>
    );
  }

  const trend = data?.weightTrend ?? [];
  const withWeight = trend.filter((e) => e.weight_kg != null);
  const recent = withWeight.slice(-5);

  if (recent.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Storico Peso</p>
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>
          Nessun dato di peso registrato ancora.
        </p>
      </div>
    );
  }

  const daysOnPlan = daysBetween(planStartDate, todayISO);

  // Compute avg adherence from last 5 check-ins
  const adherenceValues = recent
    .map((e) => e.nutrition_adherence)
    .filter((v): v is number => v != null);
  const avgAdherence =
    adherenceValues.length > 0
      ? Math.round(adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length)
      : null;

  const latest = recent[recent.length - 1]!;

  return (
    <div style={cardStyle}>
      <p style={sectionTitle}>Statistiche Rapide</p>

      {/* Quick stat row */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" as const, marginBottom: "24px" }}>
        {latest.weight_kg != null && (
          <StatPill label="Peso attuale" value={`${latest.weight_kg} kg`} accent />
        )}
        {daysOnPlan > 0 && (
          <StatPill label="Giorni sul piano" value={String(daysOnPlan)} />
        )}
        {avgAdherence != null && (
          <StatPill label="Aderenza media" value={`${avgAdherence}%`} />
        )}
      </div>

      {/* Mini weight history table */}
      <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "10px" }}>
        Ultime rilevazioni peso
      </p>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
        {recent
          .slice()
          .reverse()
          .map((entry, idx) => {
            const prev = recent.slice().reverse()[idx + 1];
            const delta =
              prev?.weight_kg != null && entry.weight_kg != null
                ? entry.weight_kg - prev.weight_kg
                : null;
            const deltaStr =
              delta != null
                ? delta > 0
                  ? `+${delta.toFixed(1)} kg`
                  : `${delta.toFixed(1)} kg`
                : null;
            const deltaColor = delta != null ? (delta > 0 ? "#ef4444" : "#22c55e") : "#9ca3af";

            return (
              <div
                key={entry.check_in_date}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                }}
              >
                <span style={{ fontSize: "13px", color: "#374151" }}>
                  {formatDateShort(entry.check_in_date)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {deltaStr && (
                    <span style={{ fontSize: "12px", color: deltaColor, fontWeight: 600 }}>
                      {deltaStr}
                    </span>
                  )}
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>
                    {entry.weight_kg} kg
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: "1 1 120px",
        padding: "16px",
        background: accent ? "#1a1a2e" : "#f8fafc",
        color: accent ? "#ffffff" : "#1a1a2e",
        borderRadius: "10px",
        textAlign: "center" as const,
        border: accent ? "none" : "1px solid #e2e8f0",
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "11px", opacity: 0.7 }}>{label}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PortalDashboardPage() {
  const profileQuery = trpc.portal.getMyProfile.useQuery();
  const planQuery = trpc.portal.getActivePlan.useQuery();
  const checkInQuery = trpc.portal.getCheckInStatus.useQuery();
  const dashboardQuery = trpc.portal.getDashboardData.useQuery();

  const profile = profileQuery.data;
  const plan = planQuery.data;
  const checkIn = checkInQuery.data;
  const dashboard = dashboardQuery.data;

  const firstName = profile?.full_name?.split(" ")[0] ?? "Cliente";

  return (
    <div
      style={{
        padding: "32px 24px",
        maxWidth: "860px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
              {profileQuery.isLoading ? "Caricamento…" : `Ciao, ${firstName}!`}
            </h1>
            <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0 }}>
              Roberto Scrigna — Nutrizione Sportiva
            </p>
          </div>

          {/* Coach info pill */}
          {profile?.partner && !Array.isArray(profile.partner) && (
            <div
              style={{
                padding: "10px 16px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {(profile.partner as { avatar_url?: string | null }).avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(profile.partner as { avatar_url: string }).avatar_url}
                  alt="Coach"
                  style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" as const }}
                />
              ) : (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "#1a1a2e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    color: "#ffffff",
                    fontWeight: 700,
                  }}
                >
                  {String((profile.partner as { full_name?: string }).full_name ?? "R").charAt(0)}
                </div>
              )}
              <div>
                <div style={{ fontSize: "12px", color: "#9ca3af" }}>Il tuo coach</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a2e" }}>
                  {(profile.partner as { full_name?: string }).full_name ?? "Roberto Scrigna"}
                </div>
                {(profile.partner as { email?: string | null }).email && (
                  <div style={{ marginTop: "3px" }}>
                    <a
                      href={`mailto:${(profile.partner as { email: string }).email}`}
                      style={{
                        fontSize: "11px",
                        color: "#6b7280",
                        textDecoration: "none",
                      }}
                    >
                      {(profile.partner as { email: string }).email}
                    </a>
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                  Contatta il tuo coach
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Date strip */}
        <div
          style={{
            marginTop: "16px",
            padding: "10px 16px",
            background: "#f0fdf4",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#15803d",
            display: "inline-block",
          }}
        >
          Oggi: {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* ── Active Plan ── */}
      <ActivePlanSection plan={plan} loading={planQuery.isLoading} />

      {/* ── Check-in ── */}
      <CheckInSection data={checkIn} loading={checkInQuery.isLoading} />

      {/* ── Weight History & Quick Stats ── */}
      <WeightHistorySection
        data={dashboard}
        planStartDate={plan?.start_date}
        loading={dashboardQuery.isLoading}
      />

      {/* ── Training log shortcut ── */}
      <Link
        href="/portal/training"
        style={{
          display: "block",
          padding: "16px 20px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          marginBottom: "24px",
          textDecoration: "none",
          color: "#1a1a2e",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>
          🏋️ I miei allenamenti
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Registra un nuovo allenamento o consulta lo storico.
        </div>
      </Link>

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: "8px",
          padding: "20px",
          textAlign: "center" as const,
          fontSize: "12px",
          color: "#d1d5db",
        }}
      >
        Roberto Scrigna — Nutrizione Sportiva · Portale Clienti
      </div>
    </div>
  );
}
