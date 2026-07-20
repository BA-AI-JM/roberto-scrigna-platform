/**
 * Portal home — mobile-first patient dashboard (#27 Stage 1).
 *
 * Single-column, at-a-glance composition over the EXISTING portal queries:
 * - Greeting + coach
 * - Goals/progress strip (current vs starting weight + last check-in)
 * - Compact active-plan card (links to the "Piano" tab — full plan, no coach math)
 * - Check-in status
 * - Log weight (shadcn)
 * - Weight history + trend charts + weekly avg
 * - Plan version history (Storico piani)
 * - Training log shortcut
 * The bottom-tab nav lives in the (protected) layout.
 */

"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { TrendChart, totalDataPoints, type TrendSeries } from "@/components/charts/TrendChart";
import { LogWeightCard } from "@/components/portal/log-weight-card";
import { PlanHistorySection } from "@/components/portal/plan-history-section";
import { PlanSummaryCard, type ActivePlan } from "@/components/portal/active-plan-view";
import { GoalsStrip, computeProgressSummary } from "@/components/portal/progress-summary";
import { NotificationBell } from "@/components/portal/notification-bell";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}
function daysBetween(from: string | null | undefined, to: string): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}
const todayISO = new Date().toISOString().split("T")[0]!;

// ── Shared Styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  marginBottom: "16px",
} as const;
const sectionTitle = { fontSize: "16px", fontWeight: 700 as const, color: "#1a1a2e", marginBottom: "18px", marginTop: 0 };

function Skeleton({ width, height }: { width?: string; height?: string }) {
  return <div style={{ width: width ?? "100%", height: height ?? "18px", backgroundColor: "#e5e7eb", borderRadius: "6px" }} />;
}

// ── Check-In Section ──────────────────────────────────────────────────────────

type CheckInStatus = {
  latestCheckIn: {
    id: string;
    check_in_date: string | null; // null while pending — DB truth (G22)
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
            flexWrap: "wrap",
            marginBottom: latest ? "16px" : 0,
          }}
        >
          <div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#92400e", margin: "0 0 4px" }}>Check-in disponibile</p>
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
              whiteSpace: "nowrap",
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

      {latest && (
        <div>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "10px" }}>
            Ultimo check-in — {latest.check_in_date ? formatDate(latest.check_in_date) : "—"}
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {latest.weight_kg != null && (
              <div style={{ flex: "1 1 100px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e" }}>{latest.weight_kg}</div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Peso (kg)</div>
              </div>
            )}
            {latest.nutrition_adherence != null && (
              <div style={{ flex: "1 1 100px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#22c55e" }}>{latest.nutrition_adherence}%</div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Aderenza nutrizionale</div>
              </div>
            )}
            {latest.training_adherence != null && (
              <div style={{ flex: "1 1 100px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#3b82f6" }}>{latest.training_adherence}%</div>
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
    check_in_date: string | null; // null while pending — DB truth (G22)
    weight_kg: number | null;
    nutrition_adherence: number | null;
    training_adherence: number | null;
  }>;
  trainingLogs: unknown[];
  diaryEntries: unknown[];
  activePlan: { daily_targets: unknown; meals_per_day: number | null } | null;
};

function WeightHistorySection({ data, planStartDate, loading, snapshots }: {
  data: DashboardData | undefined;
  planStartDate: string | null | undefined;
  loading: boolean;
  snapshots: Array<{ taken_at: string | null; weight_kg: number | null }> | undefined;
}) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Storico Peso</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height="40px" />)}
        </div>
      </div>
    );
  }

  const trend = data?.weightTrend ?? [];
  // Belt over the server filter: a null date must never reach the date math
  // (new Date(null) is epoch, not NaN — the old guard let it through, G22).
  const withWeight = trend.filter((e) => e.weight_kg != null && e.check_in_date != null);
  const recent = withWeight.slice(-5);

  if (recent.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={sectionTitle}>Storico Peso</p>
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>Nessun dato di peso registrato ancora.</p>
      </div>
    );
  }

  const daysOnPlan = daysBetween(planStartDate, todayISO);
  const adherenceValues = recent.map((e) => e.nutrition_adherence).filter((v): v is number => v != null);
  const avgAdherence =
    adherenceValues.length > 0 ? Math.round(adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length) : null;
  const latest = recent[recent.length - 1]!;

  return (
    <div style={cardStyle}>
      <p style={sectionTitle}>Statistiche Rapide</p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        {latest.weight_kg != null && <StatPill label="Peso attuale" value={`${latest.weight_kg} kg`} accent />}
        {daysOnPlan > 0 && <StatPill label="Giorni sul piano" value={String(daysOnPlan)} />}
        {avgAdherence != null && <StatPill label="Aderenza media" value={`${avgAdherence}%`} />}
      </div>

      {(() => {
        const checkinWeightPts = withWeight.map((e) => ({ date: e.check_in_date as string, value: e.weight_kg as number })); // non-null by withWeight filter (G22)
        const snapshotWeightPts = (snapshots ?? [])
          .filter((s) => s.weight_kg != null && s.taken_at != null)
          .map((s) => ({ date: s.taken_at as string, value: s.weight_kg as number }));
        const weightByDay = new Map<string, { date: string; value: number; t: number }>();
        for (const p of [...checkinWeightPts, ...snapshotWeightPts]) {
          const t = new Date(p.date).getTime();
          if (Number.isNaN(t)) continue;
          const day = p.date.slice(0, 10);
          const existing = weightByDay.get(day);
          if (!existing || t >= existing.t) weightByDay.set(day, { date: p.date, value: p.value, t });
        }
        const weightPoints = [...weightByDay.values()].sort((a, b) => a.t - b.t).map(({ date, value }) => ({ date, value }));

        const weightSeries: TrendSeries[] = [
          { key: "weight", label: "Peso", color: "#1a1a2e", unit: " kg", points: weightPoints },
        ];
        const adherenceSeries: TrendSeries[] = [
          { key: "nutrition", label: "Aderenza dieta", color: "#16a34a", unit: "%", points: trend.filter((e) => e.nutrition_adherence != null && e.check_in_date != null).map((e) => ({ date: e.check_in_date as string, value: e.nutrition_adherence as number })) },
          { key: "training", label: "Aderenza allenamento", color: "#3b82f6", unit: "%", points: trend.filter((e) => e.training_adherence != null && e.check_in_date != null).map((e) => ({ date: e.check_in_date as string, value: e.training_adherence as number })) },
        ];
        return (
          <>
            {totalDataPoints(weightSeries) >= 2 && (
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "2px" }}>Andamento peso</p>
                <TrendChart series={weightSeries} height={200} />
              </div>
            )}
            {totalDataPoints(adherenceSeries) >= 2 && (
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "2px" }}>Andamento aderenza</p>
                <TrendChart series={adherenceSeries} height={200} />
              </div>
            )}
          </>
        );
      })()}

      <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "10px" }}>Ultime rilevazioni peso</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {recent
          .slice()
          .reverse()
          .map((entry, idx) => {
            const prev = recent.slice().reverse()[idx + 1];
            const delta = prev?.weight_kg != null && entry.weight_kg != null ? entry.weight_kg - prev.weight_kg : null;
            const deltaStr = delta != null ? (delta > 0 ? `+${delta.toFixed(1)} kg` : `${delta.toFixed(1)} kg`) : null;
            const deltaColor = delta != null ? (delta > 0 ? "#ef4444" : "#22c55e") : "#9ca3af";
            return (
              <div key={entry.check_in_date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px" }}>
                <span style={{ fontSize: "13px", color: "#374151" }}>{formatDateShort(entry.check_in_date)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {deltaStr && <span style={{ fontSize: "12px", color: deltaColor, fontWeight: 600 }}>{deltaStr}</span>}
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a2e" }}>{entry.weight_kg} kg</span>
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
        textAlign: "center",
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
  const snapshotsQuery = trpc.portal.getSnapshots.useQuery({});
  const notifQuery = trpc.portal.getNotifications.useQuery(undefined, { staleTime: 30_000 });

  const profile = profileQuery.data;
  const plan = planQuery.data as ActivePlan | null | undefined;
  const checkIn = checkInQuery.data;
  const dashboard = dashboardQuery.data;

  const firstName = profile?.full_name?.split(" ")[0] ?? "Cliente";
  const progress = computeProgressSummary(snapshotsQuery.data, dashboard?.weightTrend);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      {/* ── Header ── */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
              {profileQuery.isLoading ? "Caricamento…" : `Ciao, ${firstName}!`}
            </h1>
            <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>Roberto Scrigna — Nutrizione Sportiva</p>
          </div>
          <NotificationBell unreadCount={notifQuery.data?.unreadCount ?? 0} />
        </div>
        {profile?.partner && !Array.isArray(profile.partner) && (
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
            Coach:{" "}
            <strong style={{ color: "#1a1a2e" }}>
              {(profile.partner as { full_name?: string }).full_name ?? "Roberto Scrigna"}
            </strong>
            {(profile.partner as { email?: string | null }).email && (
              <>
                {" · "}
                <a
                  href={`mailto:${(profile.partner as { email: string }).email}`}
                  style={{ color: "#6b7280", textDecoration: "underline" }}
                >
                  contatta
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {/* ── Goals / progress strip ── */}
      <GoalsStrip
        summary={progress}
        latestCheckInDate={checkIn?.latestCheckIn?.check_in_date}
        loading={snapshotsQuery.isLoading || dashboardQuery.isLoading}
      />

      {/* ── Compact active-plan card → Piano tab ── */}
      <PlanSummaryCard plan={plan} loading={planQuery.isLoading} />

      {/* ── Check-in ── */}
      <CheckInSection data={checkIn} loading={checkInQuery.isLoading} />

      {/* ── Log weight (shadcn) ── */}
      <div style={{ marginBottom: "16px" }}>
        <LogWeightCard />
      </div>

      {/* ── Weight history + charts + weekly avg ── */}
      <WeightHistorySection
        data={dashboard}
        planStartDate={plan?.start_date}
        loading={dashboardQuery.isLoading}
        snapshots={snapshotsQuery.data}
      />

      {/* ── Storico piani ── */}
      <PlanHistorySection />

      {/* ── Training log shortcut ── */}
      <Link
        href="/portal/training"
        style={{
          display: "block",
          padding: "16px 20px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          marginBottom: "16px",
          textDecoration: "none",
          color: "#1a1a2e",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>🏋️ I miei allenamenti</div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>Registra un nuovo allenamento o consulta lo storico.</div>
      </Link>

      {/* ── Urgent feedback / injury (#28) — quiet secondary action, not the hero ── */}
      <Link
        href="/portal/feedback"
        style={{
          display: "block",
          padding: "16px 20px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          marginBottom: "16px",
          textDecoration: "none",
          color: "#1a1a2e",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>🩹 Feedback urgente o infortunio</div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>Segnala qualcosa che non può aspettare il prossimo check-in.</div>
      </Link>

      <div style={{ marginTop: "8px", padding: "16px", textAlign: "center", fontSize: "12px", color: "#d1d5db" }}>
        Roberto Scrigna — Nutrizione Sportiva · Portale Clienti
      </div>
    </div>
  );
}
