/**
 * Client detail page — /clients/[id]
 *
 * Displays:
 * - Header: name, status badge, email, phone, actions
 * - Tab sections: Panoramica, Cronologia Snapshot, Piani, Check-in
 * - Back link to /clients
 */

"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ChartControls } from "@/components/charts/ChartControls";
import { totalDataPoints, type TrendSeries } from "@/components/charts/TrendChart";
import { ClientPhotoGallery } from "@/components/client-photo-gallery";
import { FeedbackCard, type FeedbackCheckin } from "@/components/client/feedback-card";
import { NotificationsPanel, type NotificationItem } from "@/components/client/notifications-panel";
import { ReminderSettingsCard } from "@/components/client/reminder-settings-card";
import { EnergyPanel, type EnergyEstimate } from "@/components/client/energy-panel";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  paused: "In pausa",
  archived: "Archiviato",
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "Sedentario",
  light: "Leggermente attivo",
  moderate: "Moderatamente attivo",
  heavy: "Molto attivo",
  very_heavy: "Estremamente attivo",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#dcfce7", text: "#166534" },
  paused: { bg: "#fef3c7", text: "#92400e" },
  archived: { bg: "#f3f4f6", text: "#6b7280" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.archived!;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Sub-sections ───────────────────────────────────────────────────────────────

// ── Snapshot type (matches listSnapshots select) ───────────────────────────────

type SnapshotRow = {
  id: string;
  taken_at: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  body_fat_method: string | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  daily_steps: number | null;
  bmr_kcal: number | null;
};

// ── Weight trend helper ────────────────────────────────────────────────────────

function WeightTrend({ snapshots }: { snapshots: SnapshotRow[] }) {
  // snapshots are ordered DESC (newest first) — reverse for chronological display
  const withWeight = snapshots.filter((s) => s.weight_kg != null);

  if (withWeight.length === 0) return null;

  if (withWeight.length === 1) {
    return (
      <div
        style={{
          marginTop: "16px",
          padding: "14px 18px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          fontSize: "13px",
          color: "#6b7280",
        }}
      >
        <span style={{ fontWeight: 600, color: "#374151" }}>Trend peso: </span>
        Prima misurazione — trend disponibile dal prossimo check-in.
      </div>
    );
  }

  // Take last 5 in chronological order (oldest → newest)
  const last5 = withWeight.slice(0, 5).reverse();
  const first = last5[0]!.weight_kg!;
  const last = last5[last5.length - 1]!.weight_kg!;
  const delta = last - first;
  const deltaStr =
    delta === 0
      ? "0.0"
      : delta > 0
      ? `+${delta.toFixed(1)}`
      : delta.toFixed(1);
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  const arrowColor = delta < 0 ? "#16a34a" : delta > 0 ? "#dc2626" : "#6b7280";

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "14px 18px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        fontSize: "13px",
        color: "#374151",
      }}
    >
      <span style={{ fontWeight: 600, color: "#374151" }}>Trend peso: </span>
      {last5.map((s, i) => (
        <span key={s.id}>
          {s.weight_kg}
          {i < last5.length - 1 && (
            <span style={{ color: "#9ca3af", margin: "0 4px" }}>→</span>
          )}
        </span>
      ))}
      <span style={{ marginLeft: "10px", fontWeight: 700, color: arrowColor }}>
        {arrow} {Math.abs(delta).toFixed(1)} kg
      </span>
      <span style={{ color: "#9ca3af", marginLeft: "4px" }}>({deltaStr} kg)</span>
    </div>
  );
}

// ── Extended-intake rendering (medical / lifestyle / goal / training) ───────────
//
// The same data is stored in two shapes depending on how the client was created:
//   • Edit path (createSnapshot)   → structured in snapshot.skinfold_data._intake
//     with the "pathologies"-string schema.
//   • Intake form (submitIntakeForm, the primary path) → JSON-stringified into
//     client.notes with the "conditions[]"-array schema.
// We prefer the structured _intake blob and fall back to parsing client.notes,
// normalising both schemas onto one render path. Read-only, presentational only.

type InfoRow = { label: string; value: string };

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Perdita di grasso",
  weight_loss: "Perdita di peso",
  muscle_gain: "Aumento massa muscolare",
  recomposition: "Ricomposizione corporea",
  maintenance: "Mantenimento",
  performance: "Performance",
};

const ALCOHOL_LABELS: Record<string, string> = {
  never: "Mai",
  rare: "Raramente",
  weekly: "Settimanale",
  daily: "Quotidiano",
};

const COOKING_LABELS: Record<string, string> = {
  none: "Nessuna",
  basic: "Base",
  intermediate: "Intermedia",
  advanced: "Avanzata",
};

const DAYTYPE_LABELS: Record<string, string> = {
  training: "Allenamento",
  rest: "Riposo",
  refeed: "Refeed",
  deload: "Scarico",
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Coerce a string / number / string[] value to display text, else undefined. */
function asText(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const joined = v.map((x) => String(x).trim()).filter(Boolean).join(", ");
    return joined.length > 0 ? joined : undefined;
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Parse the intake-form blob embedded in client.notes. submitIntakeForm writes
 * "Anamnesi: {json}\n\nStile di vita: {json}\n\nObiettivo: {json}" (JSON is
 * single-line, so splitting on the blank line is safe). Never throws.
 */
function parseIntakeNotes(notes: unknown): {
  medical?: Record<string, unknown>;
  lifestyle?: Record<string, unknown>;
  goal?: Record<string, unknown>;
} {
  const out: {
    medical?: Record<string, unknown>;
    lifestyle?: Record<string, unknown>;
    goal?: Record<string, unknown>;
  } = {};
  if (typeof notes !== "string" || notes.length === 0) return out;

  const tryParse = (segment: string, label: string): Record<string, unknown> | undefined => {
    if (!segment.startsWith(label)) return undefined;
    try {
      const parsed = JSON.parse(segment.slice(label.length));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };

  for (const segment of notes.split("\n\n")) {
    out.medical ??= tryParse(segment, "Anamnesi: ");
    out.lifestyle ??= tryParse(segment, "Stile di vita: ");
    out.goal ??= tryParse(segment, "Obiettivo: ");
  }
  return out;
}

function buildMedicalRows(m: Record<string, unknown> | undefined): InfoRow[] {
  if (!m) return [];
  const rows: InfoRow[] = [];
  const push = (label: string, v: unknown) => {
    const t = asText(v);
    if (t) rows.push({ label, value: t });
  };
  push("Patologie", m.pathologies ?? m.conditions);
  push("Storia familiare", m.family_history ?? m.familyHistory);
  push("Allergie", m.allergies);
  push("Intolleranze", m.intolerances);
  push("Farmaci", m.medications);
  push("Integratori", m.supplements);
  push("Digestione", m.digestion_issues);
  push("Intestino", m.intestine_issues);
  push("Sonno", m.sleep);
  push("Storia nutrizionale", m.nutritional_history);
  return rows;
}

function buildLifestyleRows(l: Record<string, unknown> | undefined): InfoRow[] {
  if (!l) return [];
  const rows: InfoRow[] = [];
  const push = (label: string, v: unknown) => {
    const t = asText(v);
    if (t) rows.push({ label, value: t });
  };
  // Edit-path shape
  push("Occupazione", l.occupation);
  push("Passi al giorno", l.daily_steps);
  push("Numero pasti", l.meal_count);
  push("Orari di fame", l.hunger_timing);
  push("Orario allenamento preferito", l.preferred_training_time);
  // Intake-form shape
  if (l.sleepHours != null) push("Ore di sonno", `${asText(l.sleepHours)} h`);
  if (l.stressLevel != null) push("Livello di stress", `${asText(l.stressLevel)}/10`);
  if (l.waterIntakeMl != null) push("Acqua", `${asText(l.waterIntakeMl)} ml`);
  push("Alcol", ALCOHOL_LABELS[String(l.alcoholFrequency)] ?? l.alcoholFrequency);
  push("Preferenze alimentari", l.mealPreferences);
  push("Capacità in cucina", COOKING_LABELS[String(l.cookingAbility)] ?? l.cookingAbility);
  return rows;
}

function buildGoalRows(g: Record<string, unknown> | undefined): InfoRow[] {
  if (!g) return [];
  const rows: InfoRow[] = [];
  const push = (label: string, v: unknown) => {
    const t = asText(v);
    if (t) rows.push({ label, value: t });
  };
  const goalKey = (g.goal ?? g.primaryGoal) as string | undefined;
  if (goalKey) push("Obiettivo", GOAL_LABELS[goalKey] ?? goalKey);
  const targetW = g.target_weight_kg ?? g.targetWeightKg;
  if (targetW != null) push("Peso target", `${asText(targetW)} kg`);
  push("Evento target", g.target_event);
  if (g.target_event_date != null) push("Data evento", formatDate(g.target_event_date as string));
  push("Tempistica", g.timeline);
  push("Motivazione", g.motivation);
  push("Diete precedenti", g.previousDiets);
  return rows;
}

/** Card matching the "Ultima misurazione" pattern. */
function OverviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: "20px",
        background: "#ffffff",
        border: "0.5px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a2e", margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ rows }: { rows: InfoRow[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0" }}>
      {rows.map(({ label, value }, i) => (
        <div
          key={label}
          style={{
            padding: "16px 24px",
            borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
            borderRight: (i + 1) % 3 !== 0 ? "1px solid #f1f5f9" : "none",
          }}
        >
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>{label}</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a2e", whiteSpace: "pre-wrap" }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySection() {
  return (
    <div style={{ padding: "16px 24px", fontSize: "13px", color: "#9ca3af" }}>Non disponibile</div>
  );
}

/** Weekly training schedule + (edit-path only) per-day sessions. */
function TrainingSection({
  weekSchedule,
  sessions,
}: {
  weekSchedule: string[] | undefined;
  sessions: Record<string, Array<{ modality?: string; duration_min?: number; rpe?: number }>> | undefined;
}) {
  const hasSchedule = Array.isArray(weekSchedule) && weekSchedule.length > 0;
  const sessionEntries = sessions
    ? Object.entries(sessions).filter(([, v]) => Array.isArray(v) && v.length > 0)
    : [];

  if (!hasSchedule && sessionEntries.length === 0) return <EmptySection />;

  return (
    <div style={{ padding: "20px 24px" }}>
      {hasSchedule && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: sessionEntries.length > 0 ? "20px" : "0" }}>
          {weekSchedule!.slice(0, 7).map((dt, i) => {
            const isTraining = dt === "training";
            return (
              <div
                key={i}
                style={{
                  flex: "1 1 90px",
                  minWidth: "80px",
                  textAlign: "center",
                  padding: "10px 6px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  background: isTraining ? "#1a1a2e" : "#f8fafc",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 600, color: isTraining ? "#cbd5e1" : "#9ca3af", marginBottom: "4px" }}>
                  {WEEKDAY_LABELS[i] ?? `G${i + 1}`}
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: isTraining ? "#ffffff" : "#374151" }}>
                  {DAYTYPE_LABELS[dt] ?? dt}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sessionEntries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sessionEntries
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([dayIdx, list]) => (
              <div key={dayIdx} style={{ fontSize: "13px", color: "#374151" }}>
                <span style={{ fontWeight: 600, color: "#1a1a2e" }}>
                  {WEEKDAY_LABELS[Number(dayIdx)] ?? `Giorno ${Number(dayIdx) + 1}`}:{" "}
                </span>
                {list
                  .map((s) => {
                    const parts = [
                      asText(s.modality),
                      s.duration_min != null ? `${s.duration_min} min` : undefined,
                      s.rpe != null ? `RPE ${s.rpe}` : undefined,
                    ].filter(Boolean);
                    return parts.join(" · ");
                  })
                  .filter(Boolean)
                  .join("  |  ")}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── PanoramicaTab ──────────────────────────────────────────────────────────────

function PanoramicaTab({
  snapshot,
  client,
  clientId,
}: {
  snapshot: Record<string, unknown> | null;
  client: Record<string, unknown> | null;
  clientId: string;
}) {
  const { data: snapshots = [] } = trpc.client.listSnapshots.useQuery(
    { clientId },
    { staleTime: 60_000 }
  );

  if (!snapshot) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
        <p style={{ fontSize: "14px" }}>Nessuna misurazione disponibile per questo cliente.</p>
      </div>
    );
  }

  const rows: Array<{ label: string; value: string }> = [];

  if (snapshot.weight_kg != null)
    rows.push({ label: "Peso", value: `${snapshot.weight_kg} kg` });
  if (snapshot.height_cm != null)
    rows.push({ label: "Altezza", value: `${snapshot.height_cm} cm` });
  if (snapshot.age_years != null)
    rows.push({ label: "Età", value: `${snapshot.age_years} anni` });
  if (snapshot.daily_steps != null)
    rows.push({ label: "Passi al giorno", value: `${snapshot.daily_steps}` });
  if (snapshot.occupational_level != null) {
    const rawLevel = String(snapshot.occupational_level);
    rows.push({
      label: "Livello occupazionale",
      value: ACTIVITY_LABELS[rawLevel] ?? rawLevel,
    });
  }

  const skinfoldData = snapshot.skinfold_data as Record<string, unknown> | null;
  if (skinfoldData?.bodyFatPctOverride != null)
    rows.push({ label: "Grasso corporeo", value: `${skinfoldData.bodyFatPctOverride}%` });

  if (snapshot.taken_at != null)
    rows.push({ label: "Data misurazione", value: formatDateTime(snapshot.taken_at as string) });

  // Extended intake — prefer the structured _intake blob (edit path); fall back
  // to the JSON embedded in client.notes (intake-form path). Both schemas are
  // normalised onto one render path; missing data degrades to "Non disponibile".
  const intake = (skinfoldData?._intake as Record<string, unknown> | undefined) ?? undefined;
  const notesIntake = parseIntakeNotes(client?.notes);
  const medical =
    (intake?.medical_history as Record<string, unknown> | undefined) ?? notesIntake.medical;
  const lifestyle =
    (intake?.lifestyle as Record<string, unknown> | undefined) ?? notesIntake.lifestyle;
  const goal = (intake?.goal as Record<string, unknown> | undefined) ?? notesIntake.goal;
  const trainingSessions = intake?.training_sessions as
    | Record<string, Array<{ modality?: string; duration_min?: number; rpe?: number }>>
    | undefined;
  const weekSchedule = snapshot.week_schedule as string[] | undefined;

  const medicalRows = buildMedicalRows(medical);
  const lifestyleRows = buildLifestyleRows(lifestyle);
  const goalRows = buildGoalRows(goal);

  return (
    <div>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a2e", margin: 0 }}>
            Ultima misurazione
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0" }}>
          {rows.map(({ label, value }, i) => (
            <div
              key={label}
              style={{
                padding: "16px 24px",
                borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                borderRight: (i + 1) % 3 !== 0 ? "1px solid #f1f5f9" : "none",
              }}
            >
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>{label}</div>
              <div className="tnum" style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a2e" }}>{value}</div>
            </div>
          ))}
        </div>
        {snapshot.notes != null && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            <span style={{ fontWeight: 600, color: "#374151" }}>Note: </span>
            {String(snapshot.notes)}
          </div>
        )}
      </div>

      <OverviewCard title="Anamnesi">
        {medicalRows.length > 0 ? <InfoGrid rows={medicalRows} /> : <EmptySection />}
      </OverviewCard>

      <OverviewCard title="Stile di vita">
        {lifestyleRows.length > 0 ? <InfoGrid rows={lifestyleRows} /> : <EmptySection />}
      </OverviewCard>

      <OverviewCard title="Obiettivo">
        {goalRows.length > 0 ? <InfoGrid rows={goalRows} /> : <EmptySection />}
      </OverviewCard>

      <OverviewCard title="Programma di allenamento">
        <TrainingSection weekSchedule={weekSchedule} sessions={trainingSessions} />
      </OverviewCard>

      <WeightTrend snapshots={snapshots as SnapshotRow[]} />
    </div>
  );
}

function PhotoSection({ clientId }: { clientId: string }) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const partnerId = (session as { id?: string } | null | undefined)?.id;
  if (!partnerId) return null;
  return (
    <div
      style={{
        marginTop: "20px",
        background: "#ffffff",
        border: "0.5px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a2e", margin: 0 }}>
          Foto cliente
        </h3>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <ClientPhotoGallery clientId={clientId} partnerId={partnerId} />
      </div>
    </div>
  );
}

function PianiTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = trpc.plan.list.useQuery({ clientId, limit: 20 });
  const plans = data?.plans ?? [];

  if (isLoading)
    return <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>Caricamento piani...</div>;

  if (isError)
    return (
      <div style={{ padding: "16px", background: "#fef2f2", borderRadius: "8px", color: "#991b1b", fontSize: "14px" }}>
        Errore nel caricamento dei piani.
      </div>
    );

  if (plans.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📄</div>
        <p style={{ fontSize: "14px" }}>Nessun piano per questo cliente.</p>
        <Link
          href={`/plans/generate?clientId=${clientId}`}
          style={{
            display: "inline-block",
            marginTop: "12px",
            padding: "9px 18px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Genera piano
        </Link>
      </div>
    );
  }

  const PLAN_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    draft: { bg: "#f3f4f6", text: "#6b7280" },
    active: { bg: "#dcfce7", text: "#166534" },
    completed: { bg: "#dbeafe", text: "#1d4ed8" },
    archived: { bg: "#f3f4f6", text: "#9ca3af" },
  };
  const PLAN_STATUS_LABELS: Record<string, string> = {
    draft: "Bozza",
    active: "Attivo",
    completed: "Completato",
    archived: "Archiviato",
  };

  return (
    <div
      style={{
        background: "#ffffff",
        border: "0.5px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div className="table-scroll">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Nome piano", "Stato", "Creato il", ""].map((h) => (
              <th
                key={h}
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plans.map((plan, idx) => {
            const c = PLAN_STATUS_COLORS[plan.status] ?? PLAN_STATUS_COLORS.draft!;
            return (
              <tr
                key={plan.id}
                style={{
                  borderBottom: idx < plans.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                  {plan.name}
                  {plan.weeklyAvgKcal > 0 && (
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: "8px", fontSize: "13px" }}>
                      ~{Math.round(plan.weeklyAvgKcal)} kcal/giorno
                    </span>
                  )}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: c.bg,
                      color: c.text,
                    }}
                  >
                    {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                  </span>
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                  {formatDate(plan.createdAt)}
                </td>
                <td style={{ padding: "14px 16px", textAlign: "right" }}>
                  <Link
                    href={`/plans/${plan.id}/review`}
                    style={{
                      fontSize: "13px",
                      color: "#1a1a2e",
                      fontWeight: 500,
                      padding: "6px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      textDecoration: "none",
                    }}
                  >
                    Apri →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function CheckinTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = trpc.checkin.list.useQuery({
    clientId,
    limit: 20,
    offset: 0,
  });
  const checkins = data?.checkins ?? [];

  const [sentCheckinUrl, setSentCheckinUrl] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const sendCheckinMutation = trpc.checkin.sendCheckin.useMutation({
    onSuccess: (result) => {
      const appUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL ?? "");
      setSentCheckinUrl(`${appUrl}/portal/checkin/${result.token}`);
    },
  });

  const handleCopyLink = () => {
    if (!sentCheckinUrl) return;
    navigator.clipboard.writeText(sentCheckinUrl).then(() => {
      setCopyConfirmed(true);
      setTimeout(() => setCopyConfirmed(false), 2000);
    });
  };

  if (isLoading)
    return <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>Caricamento check-in...</div>;

  if (isError)
    return (
      <div style={{ padding: "16px", background: "#fef2f2", borderRadius: "8px", color: "#991b1b", fontSize: "14px" }}>
        Errore nel caricamento dei check-in.
      </div>
    );

  const SendCheckinPanel = (
    <div style={{ marginBottom: "20px" }}>
      {/* Send button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={() => {
            setSentCheckinUrl(null);
            setCopyConfirmed(false);
            sendCheckinMutation.mutate({ clientId });
          }}
          disabled={sendCheckinMutation.isPending}
          style={{
            padding: "9px 20px",
            backgroundColor: sendCheckinMutation.isPending ? "#6b7280" : "#1a1a2e",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: sendCheckinMutation.isPending ? "not-allowed" : "pointer",
          }}
        >
          {sendCheckinMutation.isPending ? "Invio in corso..." : "Invia Check-in"}
        </button>

        {sendCheckinMutation.isError && (
          <span style={{ fontSize: "13px", color: "#991b1b" }}>
            {sendCheckinMutation.error?.message ?? "Errore nell'invio."}
          </span>
        )}
      </div>

      {/* Success: show URL + copy button */}
      {sentCheckinUrl && (
        <div
          style={{
            marginTop: "14px",
            padding: "14px 16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
          }}
        >
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#15803d", margin: "0 0 8px" }}>
            Link inviato al cliente
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <code
              style={{
                fontSize: "12px",
                color: "#374151",
                background: "#ffffff",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #d1fae5",
                wordBreak: "break-all",
                flex: 1,
              }}
            >
              {sentCheckinUrl}
            </code>
            <button
              onClick={handleCopyLink}
              style={{
                padding: "6px 14px",
                backgroundColor: copyConfirmed ? "#15803d" : "#ffffff",
                color: copyConfirmed ? "#ffffff" : "#15803d",
                border: "1px solid #15803d",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copyConfirmed ? "Copiato!" : "Copia link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (checkins.length === 0) {
    return (
      <div>
        {SendCheckinPanel}
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "#9ca3af",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px dashed #e2e8f0",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📊</div>
          <p style={{ fontSize: "14px" }}>Nessun check-in registrato per questo cliente.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {SendCheckinPanel}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
      <div className="table-scroll">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Data", "Peso", "Energia", "Sonno", "Aderenza", "Stato"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {checkins.map((ci, idx) => {
            const checkinData = ci as Record<string, unknown>;
            return (
              <tr
                key={String(checkinData.id)}
                style={{
                  borderBottom: idx < checkins.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                  {formatDate(checkinData.completed_at as string ?? checkinData.created_at as string)}
                </td>
                <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                  {checkinData.weight_kg != null ? `${checkinData.weight_kg} kg` : "—"}
                  {checkinData.weight_flagged === true && (
                    <span style={{ marginLeft: "6px", color: "#ef4444", fontSize: "12px" }}>⚠</span>
                  )}
                </td>
                <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.energy_level != null ? `${checkinData.energy_level}/10` : "—"}
                </td>
                <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.sleep_quality != null ? `${checkinData.sleep_quality}/10` : "—"}
                </td>
                <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.adherence_pct != null ? `${checkinData.adherence_pct}%` : "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6b7280" }}>
                  {String(checkinData.status ?? "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  // Guard: /clients/new is a create route, not a client ID
  if (clientId === "new") {
    router.replace("/plans/new");
    return null;
  }
  const [archiving, setArchiving] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading, isError } = trpc.client.getById.useQuery({ id: clientId });
  // #2 — latest completed check-in for the "feedback first" card (Stage-2:
  // getLatestCompleted also returns review_notes).
  const { data: feedbackData } = trpc.checkin.getLatestCompleted.useQuery(
    { clientId },
    { staleTime: 60_000 }
  );
  const latestFeedback = (feedbackData?.checkin as FeedbackCheckin | null | undefined) ?? null;

  // #2 Stage 2 — per-client notifications feed.
  const {
    data: notifData,
    isLoading: notifLoading,
    isError: notifError,
  } = trpc.notification.getForClient.useQuery({ clientId, limit: 20 }, { staleTime: 60_000 });

  // #2 Stage 2 — energy breakdown (estimateTdee throws PRECONDITION_FAILED when
  // the client has no snapshot yet; don't retry — the panel shows an empty state).
  const {
    data: tdeeData,
    isLoading: tdeeLoading,
    isError: tdeeError,
  } = trpc.client.estimateTdee.useQuery({ clientId }, { staleTime: 60_000, retry: false });
  const archiveMutation = trpc.client.archive.useMutation({
    onSuccess: () => {
      router.push("/clients");
    },
    onError: () => {
      setArchiving(false);
    },
  });

  const inviteMutation = trpc.client.sendPortalInvite.useMutation({
    onSuccess: (res) => {
      setInviteMsg({ ok: true, text: `Invito inviato a ${res.sentTo}.` });
    },
    onError: (err) => {
      setInviteMsg({ ok: false, text: err.message ?? "Errore nell'invio dell'invito." });
    },
  });

  const handleArchive = async () => {
    if (!confirm("Sei sicuro di voler archiviare questo cliente?")) return;
    setArchiving(true);
    archiveMutation.mutate({ id: clientId });
  };

  const handleInvite = () => {
    setInviteMsg(null);
    inviteMutation.mutate({ clientId });
  };

  if (isLoading) {
    return (
      <div
        className="coach-container"
        style={{
          color: "#9ca3af",
          textAlign: "center",
          paddingTop: "80px",
        }}
      >
        Caricamento cliente...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="coach-container">
        <Link
          href="/clients"
          style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}
        >
          ← Torna ai Clienti
        </Link>
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "14px",
          }}
        >
          Cliente non trovato o errore nel caricamento.
        </div>
      </div>
    );
  }

  const { client, latestSnapshot } = data;

  return (
    <div className="coach-container">
      {/* Back link */}
      <Link
        href="/clients"
        style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        ← Torna ai Clienti
      </Link>

      {/* Client header */}
      <div
        style={{
          marginTop: "20px",
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Profilo cliente</p>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>
              {client.full_name}
            </h1>
            <StatusBadge status={client.status} />
          </div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {client.email && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                ✉ {client.email}
              </span>
            )}
            {client.phone && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                📞 {client.phone}
              </span>
            )}
            {client.date_of_birth && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                🎂 {formatDate(client.date_of_birth)}
              </span>
            )}
            {client.sex && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                {client.sex === "male" ? "Uomo" : "Donna"}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap" }}>
          <Link
            href={`/clients/${clientId}/edit`}
            style={{
              padding: "9px 18px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Modifica
          </Link>
          <Link
            href={`/plans/generate?clientId=${clientId}`}
            style={{
              padding: "9px 18px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Genera Piano
          </Link>
          {client.status !== "archived" && (
            <button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !client.email}
              title={
                client.email
                  ? "Invia al cliente un'email con l'accesso al portale"
                  : "Aggiungi un'email al cliente per poterlo invitare"
              }
              style={{
                padding: "9px 18px",
                backgroundColor: "#ffffff",
                color: client.email ? "#1a1a2e" : "#9ca3af",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor:
                  inviteMutation.isPending || !client.email ? "not-allowed" : "pointer",
              }}
            >
              {inviteMutation.isPending ? "Invio…" : "Invita al portale"}
            </button>
          )}
          {client.status !== "archived" && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              style={{
                padding: "9px 18px",
                backgroundColor: "#ffffff",
                color: "#ef4444",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: archiving ? "not-allowed" : "pointer",
                opacity: archiving ? 0.6 : 1,
              }}
            >
              Archivia
            </button>
          )}
        </div>
      </div>

      {/* Portal invite result */}
      {inviteMsg && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            background: inviteMsg.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${inviteMsg.ok ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: "8px",
            fontSize: "13px",
            color: inviteMsg.ok ? "#166534" : "#991b1b",
          }}
        >
          {inviteMsg.text}
        </div>
      )}

      {/* Notes strip if present */}
      {client.notes && (
        <div
          style={{
            marginBottom: "24px",
            padding: "14px 18px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#92400e",
          }}
        >
          <span style={{ fontWeight: 600 }}>Note: </span>
          {client.notes}
        </div>
      )}

      {/* Tags */}
      {client.tags && (client.tags as string[]).length > 0 && (
        <div style={{ marginBottom: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(client.tags as string[]).map((tag: string) => (
            <span
              key={tag}
              style={{
                padding: "3px 10px",
                background: "#f3f4f6",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* #2 Stage 1 — consolidated top-down dashboard (tab shell removed; every
          former tab body is now a stacked section over the SAME queries). Order
          per Roberto: feedback first → notifications → anagrafica/anamnesi/
          lifestyle/goal/training → body-comp + energy → snapshot → plans →
          check-ins → photos. Click-throughs (plan review, generate) preserved. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* 1 · Feedback first (latest completed check-in) */}
        <FeedbackCard checkin={latestFeedback} />

        {/* 2 · Notifications (Stage 2) — per-client feed */}
        <NotificationsPanel
          notifications={(notifData?.notifications ?? []) as NotificationItem[]}
          isLoading={notifLoading}
          isError={notifError}
        />

        {/* 2.5 · Reminder settings (#07) — per-client check-in + body-comp cadence */}
        <ReminderSettingsCard clientId={clientId} />

        {/* 3 · Demographics / medical (+ medications) / lifestyle / goal / training */}
        <PanoramicaTab
          snapshot={latestSnapshot as Record<string, unknown> | null}
          client={client as Record<string, unknown> | null}
          clientId={clientId}
        />

        {/* 4 · Body composition (current + trend) */}
        <BodyCompTab clientId={clientId} />

        {/* 4b · Energy breakdown (Stage 2) — per day-type BMR/NEAT/TEF/EAT/TDEE */}
        <EnergyPanel
          data={tdeeData as EnergyEstimate | undefined}
          isLoading={tdeeLoading}
          isError={tdeeError}
        />

        {/* 5 · Snapshot history */}
        <SnapshotHistoryTab clientId={clientId} />

        {/* 6 · Plans (click-through to /plans/[id]/review preserved in PianiTab) */}
        <PianiTab clientId={clientId} />

        {/* 7 · Check-ins */}
        <CheckinTab clientId={clientId} />

        {/* 8 · Photos */}
        <PhotoSection clientId={clientId} />
      </div>
    </div>
  );
}

// ── Snapshot history tab ───────────────────────────────────────────────────────

function SnapshotHistoryTab({ clientId }: { clientId: string }) {
  const { data: snapshots = [], isLoading, isError } =
    trpc.client.listSnapshots.useQuery({ clientId });

  if (isLoading)
    return (
      <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>
        Caricamento cronologia...
      </div>
    );

  if (isError)
    return (
      <div
        style={{
          padding: "16px",
          background: "#fef2f2",
          borderRadius: "8px",
          color: "#991b1b",
          fontSize: "14px",
        }}
      >
        Errore nel caricamento degli snapshot.
      </div>
    );

  if (snapshots.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📏</div>
        <p style={{ fontSize: "14px" }}>Nessuna misurazione registrata.</p>
        <Link
          href={`/clients/${clientId}/edit`}
          style={{
            display: "inline-block",
            marginTop: "12px",
            padding: "9px 18px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Nuova misurazione
        </Link>
      </div>
    );
  }

  // snapshots are ordered DESC — delta = current weight minus next-older entry
  const weightDeltas = new Map<string, number | null>();
  for (let i = 0; i < snapshots.length; i++) {
    const curr = snapshots[i]!;
    const prev = snapshots[i + 1]; // older (index+1 because DESC order)
    if (curr.weight_kg != null && prev?.weight_kg != null) {
      weightDeltas.set(curr.id, curr.weight_kg - prev.weight_kg);
    } else {
      weightDeltas.set(curr.id, null);
    }
  }

  // Body-comp columns are frequently null (computed at plan generation, not on
  // every measurement save) — used to show an explanatory note under the table.
  const hasAnyBodyComp = (snapshots as SnapshotRow[]).some(
    (s) =>
      s.body_fat_pct != null ||
      s.lean_mass_kg != null ||
      s.fat_mass_kg != null ||
      s.bmr_kcal != null
  );

  const COL_HEADERS = [
    "Data",
    "Peso (kg)",
    "Grasso (%)",
    "Massa magra (kg)",
    "Massa grassa (kg)",
    "BMR",
    "Passi",
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a2e", margin: 0 }}>
          Cronologia misurazioni ({snapshots.length})
        </h3>
        <Link
          href={`/clients/${clientId}/edit`}
          style={{
            padding: "8px 16px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          + Nuova misurazione
        </Link>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {COL_HEADERS.map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(snapshots as SnapshotRow[]).map((snap, idx) => {
              const delta = weightDeltas.get(snap.id) ?? null;
              const isLast = idx === snapshots.length - 1;

              return (
                <tr
                  key={snap.id}
                  style={{
                    borderBottom: !isLast ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  {/* Data */}
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      color: "#6b7280",
                    }}
                  >
                    {formatDate(snap.taken_at)}
                  </td>

                  {/* Peso + delta */}
                  <td
                    className="tnum"
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#1a1a2e",
                    }}
                  >
                    {snap.weight_kg != null ? `${snap.weight_kg}` : "—"}
                    {delta != null && (
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color:
                            delta < 0
                              ? "#16a34a"
                              : delta > 0
                              ? "#dc2626"
                              : "#9ca3af",
                        }}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </span>
                    )}
                  </td>

                  {/* Grasso % */}
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.body_fat_pct != null ? `${snap.body_fat_pct}%` : "—"}
                  </td>

                  {/* Massa magra */}
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.lean_mass_kg != null ? `${snap.lean_mass_kg}` : "—"}
                  </td>

                  {/* Massa grassa */}
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.fat_mass_kg != null ? `${snap.fat_mass_kg}` : "—"}
                  </td>

                  {/* BMR */}
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.bmr_kcal != null
                      ? `${Math.round(snap.bmr_kcal)} kcal`
                      : "—"}
                  </td>

                  {/* Passi */}
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.daily_steps != null
                      ? snap.daily_steps.toLocaleString("it-IT")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {!hasAnyBodyComp && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#6b7280",
            lineHeight: 1.5,
          }}
        >
          I valori di grasso corporeo, massa magra/grassa e BMR vengono calcolati
          dalla plicometria alla generazione del piano e potrebbero non essere
          ancora disponibili per le misurazioni più recenti.
        </div>
      )}
    </div>
  );
}

// ── Body-composition panel + trend (Items #5 / #7) ──────────────────────────────
//
// Presentation only. Every body-comp field is independently nullable (the
// backend may not have computed them yet — see SnapshotHistoryTab note), so each
// cell degrades to a muted "non disponibile" and an explanatory hint shows when
// nothing is populated. No new query: fed by the existing listSnapshots data.

const BODY_FAT_METHOD_LABELS: Record<string, string> = {
  "7site": "Jackson & Pollock 7 pliche",
  "3site": "Jackson & Pollock 3 pliche",
  heuristic: "Stima euristica",
  manual: "Inserito manualmente",
};

function BodyCompositionPanel({
  snapshot,
}: {
  snapshot: SnapshotRow | null | undefined;
}) {
  const methodLabel =
    snapshot?.body_fat_pct != null && snapshot?.body_fat_method
      ? BODY_FAT_METHOD_LABELS[snapshot.body_fat_method] ?? snapshot.body_fat_method
      : null;

  const cells: Array<{ label: string; value: string | null; sub?: string | null }> = [
    {
      label: "Grasso corporeo",
      value: snapshot?.body_fat_pct != null ? `${snapshot.body_fat_pct}%` : null,
      sub: methodLabel,
    },
    {
      label: "Massa magra",
      value: snapshot?.lean_mass_kg != null ? `${snapshot.lean_mass_kg} kg` : null,
    },
    {
      label: "Massa grassa",
      value: snapshot?.fat_mass_kg != null ? `${snapshot.fat_mass_kg} kg` : null,
    },
    {
      label: "Metabolismo basale",
      value: snapshot?.bmr_kcal != null ? `${Math.round(snapshot.bmr_kcal)} kcal` : null,
    },
  ];
  const anyData = cells.some((c) => c.value != null);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "0.5px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
        marginTop: "16px",
      }}
    >
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a2e", margin: 0 }}>
          Composizione corporea
        </h3>
        {!anyData && (
          <span style={{ fontSize: "12px", color: "#9ca3af" }}>
            Dati non ancora disponibili
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={c.label}
            style={{
              padding: "16px 24px",
              borderBottom: i < cells.length - 1 ? "1px solid #f1f5f9" : "none",
              borderRight: (i + 1) % 3 !== 0 ? "1px solid #f1f5f9" : "none",
            }}
          >
            <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
              {c.label}
            </div>
            <div
              className="tnum"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: c.value != null ? "#1a1a2e" : "#cbd5e1",
              }}
            >
              {c.value ?? "non disponibile"}
            </div>
            {c.sub && (
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>
      {!anyData && (
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid #f1f5f9",
            fontSize: "12px",
            color: "#9ca3af",
            lineHeight: 1.5,
          }}
        >
          I valori vengono calcolati dalla plicometria alla generazione del piano e
          potrebbero non essere ancora disponibili per questa misurazione.
        </div>
      )}
    </div>
  );
}

function MetricTrendRow({
  label,
  unit,
  points,
  lowerIsBetter,
  round = false,
}: {
  label: string;
  unit: string;
  points: number[];
  lowerIsBetter: boolean;
  round?: boolean;
}) {
  const fmt = (v: number) => (round ? Math.round(v) : v);
  const rowStyle = {
    fontSize: "13px",
    color: "#374151",
    marginBottom: "8px",
  };
  const labelEl = (
    <span style={{ fontWeight: 600, color: "#374151" }}>{label}: </span>
  );

  if (points.length === 0) {
    return (
      <div style={rowStyle}>
        {labelEl}
        <span style={{ color: "#9ca3af" }}>dati non disponibili</span>
      </div>
    );
  }
  if (points.length === 1) {
    return (
      <div style={rowStyle}>
        {labelEl}
        <span>
          {fmt(points[0]!)}
          {unit}
        </span>
        <span style={{ color: "#9ca3af", marginLeft: "6px" }}>(prima misurazione)</span>
      </div>
    );
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last - first;
  const improving = delta !== 0 && (lowerIsBetter ? delta < 0 : delta > 0);
  const color = delta === 0 ? "#6b7280" : improving ? "#16a34a" : "#dc2626";
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  const absDelta = round
    ? String(Math.round(Math.abs(delta)))
    : Math.abs(delta).toFixed(1);

  return (
    <div style={rowStyle}>
      {labelEl}
      {points.map((p, i) => (
        <span key={i}>
          {fmt(p)}
          {i < points.length - 1 && (
            <span style={{ color: "#9ca3af", margin: "0 4px" }}>→</span>
          )}
        </span>
      ))}
      <span style={{ marginLeft: "10px", fontWeight: 700, color }}>
        {arrow} {absDelta}
        {unit}
      </span>
    </div>
  );
}

function BodyCompTrend({ snapshots }: { snapshots: SnapshotRow[] }) {
  // snapshots arrive DESC (newest first); per metric, take up to 5 populated
  // points and present them chronologically (oldest → newest).
  const metrics: Array<{
    label: string;
    unit: string;
    get: (s: SnapshotRow) => number | null;
    lowerIsBetter: boolean;
    round?: boolean;
  }> = [
    { label: "Grasso corporeo", unit: "%", get: (s) => s.body_fat_pct, lowerIsBetter: true },
    { label: "Massa magra", unit: " kg", get: (s) => s.lean_mass_kg, lowerIsBetter: false },
    {
      label: "Metabolismo basale",
      unit: " kcal",
      get: (s) => s.bmr_kcal,
      lowerIsBetter: false,
      round: true,
    },
  ];

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "16px 18px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#374151",
          marginBottom: "12px",
        }}
      >
        Andamento composizione corporea
      </div>
      {metrics.map((m) => {
        const points = snapshots
          .filter((s) => m.get(s) != null)
          .slice(0, 5)
          .reverse()
          .map((s) => m.get(s) as number);
        return (
          <MetricTrendRow
            key={m.label}
            label={m.label}
            unit={m.unit}
            points={points}
            lowerIsBetter={m.lowerIsBetter}
            round={m.round}
          />
        );
      })}
    </div>
  );
}

// Coach body-comp chart series, derived from listSnapshots (x = taken_at).
const SNAP_SERIES: {
  key: keyof SnapshotRow;
  label: string;
  color: string;
  unit: string;
  lowerIsBetter?: boolean;
}[] = [
  { key: "weight_kg", label: "Peso", color: "#1a1a2e", unit: " kg" },
  { key: "body_fat_pct", label: "Grasso", color: "#dc2626", unit: "%", lowerIsBetter: true },
  { key: "lean_mass_kg", label: "Massa magra", color: "#16a34a", unit: " kg" },
  { key: "fat_mass_kg", label: "Massa grassa", color: "#f59e0b", unit: " kg", lowerIsBetter: true },
  { key: "daily_steps", label: "Passi", color: "#3b82f6", unit: "" },
  { key: "bmr_kcal", label: "BMR", color: "#8b5cf6", unit: " kcal" },
];

function buildSnapshotSeries(rows: SnapshotRow[]): TrendSeries[] {
  return SNAP_SERIES.map((def) => ({
    key: def.key as string,
    label: def.label,
    color: def.color,
    unit: def.unit,
    lowerIsBetter: def.lowerIsBetter,
    points: rows
      .filter((r) => r.taken_at != null && r[def.key] != null)
      .map((r) => ({ date: r.taken_at as string, value: r[def.key] as number })),
  })).filter((s) => s.points.length > 0);
}

function BodyCompTab({ clientId }: { clientId: string }) {
  const { data: snapshots = [], isLoading, isError } =
    trpc.client.listSnapshots.useQuery({ clientId });

  if (isLoading)
    return (
      <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>
        Caricamento composizione corporea...
      </div>
    );

  if (isError)
    return (
      <div
        style={{
          padding: "16px",
          background: "#fef2f2",
          borderRadius: "8px",
          color: "#991b1b",
          fontSize: "14px",
        }}
      >
        Errore nel caricamento dei dati.
      </div>
    );

  const rows = snapshots as SnapshotRow[];

  if (rows.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚖️</div>
        <p style={{ fontSize: "14px" }}>Nessuna misurazione registrata.</p>
        <Link
          href={`/clients/${clientId}/edit`}
          style={{
            display: "inline-block",
            marginTop: "12px",
            padding: "9px 18px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Nuova misurazione
        </Link>
      </div>
    );
  }

  const chartSeries = buildSnapshotSeries(rows);
  const showChart = totalDataPoints(chartSeries) >= 2;

  return (
    <div>
      <BodyCompositionPanel snapshot={rows[0] ?? null} />
      {showChart ? (
        <ChartControls series={chartSeries} />
      ) : (
        <BodyCompTrend snapshots={rows} />
      )}
    </div>
  );
}
