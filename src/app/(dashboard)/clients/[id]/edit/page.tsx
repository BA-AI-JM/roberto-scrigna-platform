/**
 * Client edit page — /clients/[id]/edit
 *
 * Pre-populated form for updating client profile data and adding
 * a new snapshot (measurements). On success redirects to /clients/[id].
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  WeekSessionsEditor,
  type WeekSessions,
  type TrainingSession,
} from "@/components/week-sessions-editor";
import {
  SkinfoldsEditor,
  EMPTY_SKINFOLDS,
  type SkinfoldsValue,
} from "@/components/skinfolds-editor";
import { ClientPhotoGallery } from "@/components/client-photo-gallery";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProfileForm {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female" | "";
  notes: string;
  tags: string; // comma-separated
  status: "active" | "paused" | "archived";
}

interface SnapshotForm {
  weightKg: string;
  waist: string;
  hips: string;
  chest: string;
  armR: string;
  armL: string;
  thighR: string;
  thighL: string;
  abdomen: string;
  dailySteps: string;
  occupationalLevel: "" | "sedentary" | "light" | "moderate" | "heavy" | "very_heavy";
}

type GoalKind = "" | "fat_loss" | "muscle_gain" | "maintenance" | "performance";

interface GoalForm {
  goal: GoalKind;
  targetWeightKg: string;
  targetEvent: string;
  targetEventDate: string;
}

const EMPTY_GOAL: GoalForm = {
  goal: "",
  targetWeightKg: "",
  targetEvent: "",
  targetEventDate: "",
};

const GOAL_OPTIONS: { value: Exclude<GoalKind, "">; label: string }[] = [
  { value: "fat_loss", label: "Dimagrimento (Fat Loss)" },
  { value: "muscle_gain", label: "Aumento Massa Muscolare" },
  { value: "maintenance", label: "Mantenimento" },
  { value: "performance", label: "Performance Sportiva" },
];

const OCC_LEVEL_OPTIONS: { value: SnapshotForm["occupationalLevel"]; label: string }[] = [
  { value: "sedentary", label: "Sedentario (lavoro d'ufficio / studio)" },
  { value: "light", label: "Leggero (in piedi buona parte del giorno)" },
  { value: "moderate", label: "Moderato (lavoro fisico medio)" },
  { value: "heavy", label: "Pesante (lavoro fisico intenso)" },
  { value: "very_heavy", label: "Molto pesante (lavoro manuale estremo)" },
];

// ── Form field components ──────────────────────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#374151",
          display: "block",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: "#ffffff",
  cursor: "pointer",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClientEditPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    sex: "",
    notes: "",
    tags: "",
    status: "active",
  });

  const [snapshotForm, setSnapshotForm] = useState<SnapshotForm>({
    weightKg: "",
    waist: "",
    hips: "",
    chest: "",
    armR: "",
    armL: "",
    thighR: "",
    thighL: "",
    abdomen: "",
    dailySteps: "",
    occupationalLevel: "",
  });

  const [goalForm, setGoalForm] = useState<GoalForm>(EMPTY_GOAL);
  const [weekSessions, setWeekSessions] = useState<WeekSessions>({});
  const [skinfolds, setSkinfolds] = useState<SkinfoldsValue>(EMPTY_SKINFOLDS);

  const [addSnapshot, setAddSnapshot] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError } = trpc.client.getById.useQuery({ id: clientId });

  // Pre-populate from latest snapshot when data loads.
  useEffect(() => {
    if (!data?.client) return;
    const c = data.client;
    setProfileForm({
      fullName: c.full_name ?? "",
      email: (c.email as string) ?? "",
      phone: (c.phone as string) ?? "",
      dateOfBirth: (c.date_of_birth as string) ?? "",
      sex: (c.sex as "male" | "female") ?? "",
      notes: (c.notes as string) ?? "",
      tags: ((c.tags as string[]) ?? []).join(", "),
      status: (c.status as "active" | "paused" | "archived") ?? "active",
    });

    // Pre-fill goal / occupational level / training routine from the latest
    // snapshot. These live inside skinfold_data._intake (intake-form blob) and
    // on the snapshot row itself; we read them so the coach can update
    // incrementally rather than re-entering from scratch.
    const snap = data.latestSnapshot as Record<string, unknown> | null;
    if (snap) {
      const skinfoldRaw = snap.skinfold_data as Record<string, unknown> | null;
      const intake = (skinfoldRaw?._intake as Record<string, unknown> | undefined) ?? {};

      const occ = (snap.occupational_level as SnapshotForm["occupationalLevel"]) ?? "";
      setSnapshotForm((prev) => ({ ...prev, occupationalLevel: occ }));

      const goal = intake.goal as
        | {
            goal?: GoalKind;
            target_weight_kg?: number;
            target_event?: string;
            target_event_date?: string;
          }
        | undefined;
      if (goal) {
        setGoalForm({
          goal: goal.goal ?? "",
          targetWeightKg: goal.target_weight_kg != null ? String(goal.target_weight_kg) : "",
          targetEvent: goal.target_event ?? "",
          targetEventDate: goal.target_event_date ?? "",
        });
      }

      const sessions = intake.training_sessions as
        | Record<string, TrainingSession[]>
        | undefined;
      if (sessions) {
        const next: WeekSessions = {};
        for (const [k, v] of Object.entries(sessions)) {
          const idx = Number(k);
          if (!Number.isNaN(idx) && Array.isArray(v)) next[idx] = v;
        }
        setWeekSessions(next);
      }
      // Skinfolds intentionally left empty — the coach enters new measurements
      // when re-measuring, not silently re-submitting old ones.
    }
  }, [data]);

  const updateMutation = trpc.client.update.useMutation();
  const createSnapshotMutation = trpc.client.createSnapshot.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      // 1. Update profile
      await updateMutation.mutateAsync({
        id: clientId,
        fullName: profileForm.fullName,
        email: profileForm.email || undefined,
        phone: profileForm.phone || undefined,
        dateOfBirth: profileForm.dateOfBirth || undefined,
        sex: profileForm.sex || undefined,
        notes: profileForm.notes || undefined,
        tags: profileForm.tags
          ? profileForm.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        status: profileForm.status,
      });

      // 2. Optionally create a new "context" snapshot. The "Aggiorna scheda"
      //    section captures: weight/circumferences/steps, occupational level,
      //    goal, weekly training routine and (optionally) a new plicometria.
      //    A new snapshot dates the change so history is preserved; values not
      //    touched in the form are carried over from the latest snapshot so the
      //    new one is a complete picture, not a partial diff.
      if (addSnapshot) {
        const parseOpt = (s: string) => (s.trim() === "" ? undefined : parseFloat(s));

        const prevSnap = (data?.latestSnapshot as Record<string, unknown> | null) ?? null;
        const prevSkinfoldRaw =
          (prevSnap?.skinfold_data as Record<string, unknown> | null) ?? null;
        const prevIntake =
          (prevSkinfoldRaw?._intake as Record<string, unknown> | undefined) ?? {};
        const prevLifestyle =
          (prevIntake.lifestyle as Record<string, unknown> | undefined) ?? {};
        const prevCirc =
          (prevIntake.circumferences as Record<string, number | undefined> | undefined) ??
          undefined;
        const prevMedHistory =
          (prevIntake.medical_history as Record<string, unknown> | undefined) ?? undefined;

        // Circumferences: form values override prev values per-field; if neither
        // is set, the field is undefined.
        const circ: Record<string, number | undefined> = { ...(prevCirc ?? {}) };
        const setIfPresent = (key: string, raw: string) => {
          const n = parseOpt(raw);
          if (n != null) circ[key] = n;
        };
        setIfPresent("waist", snapshotForm.waist);
        setIfPresent("hips", snapshotForm.hips);
        setIfPresent("chest", snapshotForm.chest);
        setIfPresent("arm_r", snapshotForm.armR);
        setIfPresent("arm_l", snapshotForm.armL);
        setIfPresent("thigh_r", snapshotForm.thighR);
        setIfPresent("thigh_l", snapshotForm.thighL);
        setIfPresent("abdomen", snapshotForm.abdomen);
        const hasCirc = Object.values(circ).some((v) => v != null);

        // Weight / height / steps carry over from prev if not entered now.
        const weightKg =
          parseOpt(snapshotForm.weightKg) ??
          (prevSnap?.weight_kg as number | undefined) ??
          undefined;
        const heightCm = (prevSnap?.height_cm as number | undefined) ?? undefined;
        const dailySteps =
          parseOpt(snapshotForm.dailySteps) ??
          (prevLifestyle.daily_steps as number | undefined) ??
          undefined;

        // Skinfolds: only included if at least one site is filled. Otherwise
        // we let the new snapshot pick up whatever method the previous one
        // used (via the next plan generation, which always reads the latest).
        const sf = skinfolds;
        const skinfoldsFilled =
          Object.values(sf).some((v) => v.trim() !== "" && !isNaN(parseFloat(v)));
        const skinfoldsPayload = skinfoldsFilled
          ? {
              triceps: parseOpt(sf.triceps),
              chest: parseOpt(sf.chest),
              abdomen: parseOpt(sf.abdomen),
              suprailiac: parseOpt(sf.suprailiac),
              subscapular: parseOpt(sf.subscapular),
              thigh: parseOpt(sf.thigh),
              midaxillary: parseOpt(sf.midaxillary),
            }
          : undefined;

        // Training sessions: serialize back to the intake shape (string keys).
        // (#18: startTime/endTime ride through to _intake.)
        const trainingSessions: Record<
          string,
          Array<{ modality: string; duration_min: number; rpe: number; startTime?: string; endTime?: string }>
        > = {};
        for (const [k, v] of Object.entries(weekSessions)) {
          if (v && v.length > 0) trainingSessions[k] = v;
        }
        const hasTraining = Object.keys(trainingSessions).length > 0;

        // Occupational level: form override or prev.
        const occupationalLevel =
          snapshotForm.occupationalLevel !== ""
            ? snapshotForm.occupationalLevel
            : ((prevSnap?.occupational_level as SnapshotForm["occupationalLevel"]) || undefined);

        // Goal: form override or prev.
        const hasGoalEdit =
          goalForm.goal !== "" ||
          goalForm.targetWeightKg !== "" ||
          goalForm.targetEvent !== "" ||
          goalForm.targetEventDate !== "";
        const goalPayload = hasGoalEdit
          ? {
              goal: goalForm.goal || undefined,
              target_weight_kg: parseOpt(goalForm.targetWeightKg),
              target_event: goalForm.targetEvent || undefined,
              target_event_date: goalForm.targetEventDate || undefined,
            }
          : (prevIntake.goal as
              | {
                  goal?: GoalKind;
                  target_weight_kg?: number;
                  target_event?: string;
                  target_event_date?: string;
                }
              | undefined);

        await createSnapshotMutation.mutateAsync({
          clientId,
          weightKg,
          heightCm,
          circumferences: hasCirc ? circ : undefined,
          skinfolds: skinfoldsPayload,
          medicalHistory: prevMedHistory as Parameters<
            typeof createSnapshotMutation.mutateAsync
          >[0]["medicalHistory"],
          trainingSessions: hasTraining ? trainingSessions : undefined,
          occupationalLevel: occupationalLevel || undefined,
          lifestyle: {
            daily_steps: dailySteps,
            occupation: (prevLifestyle.occupation as string | undefined) || undefined,
            hunger_timing: (prevLifestyle.hunger_timing as string | undefined) || undefined,
            preferred_training_time:
              (prevLifestyle.preferred_training_time as string | undefined) || undefined,
          },
          goal: goalPayload as Parameters<
            typeof createSnapshotMutation.mutateAsync
          >[0]["goal"],
        });
      }

      router.push(`/clients/${clientId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Errore nel salvataggio. Riprova.";
      setSaveError(message);
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: "32px",
          maxWidth: "800px",
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
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
      <div
        style={{
          padding: "32px",
          maxWidth: "800px",
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <Link href={`/clients/${clientId}`} style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}>
          ← Torna al cliente
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

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Back link */}
      <Link
        href={`/clients/${clientId}`}
        style={{
          fontSize: "14px",
          color: "#6b7280",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        ← Torna al cliente
      </Link>

      {/* Header */}
      <div style={{ marginTop: "20px", marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
          Modifica cliente
        </h1>
        <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
          {data.client.full_name}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Profile section */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", marginBottom: "20px", marginTop: 0 }}>
            Dati anagrafici
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" }}>
            <FormField label="Nome completo *">
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                required
                style={inputStyle}
                placeholder="Mario Rossi"
              />
            </FormField>

            <FormField label="Email">
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle}
                placeholder="mario@example.com"
              />
            </FormField>

            <FormField label="Telefono">
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                style={inputStyle}
                placeholder="+39 333 1234567"
              />
            </FormField>

            <FormField label="Data di nascita">
              <input
                type="date"
                value={profileForm.dateOfBirth}
                onChange={(e) => setProfileForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Sesso">
              <select
                value={profileForm.sex}
                onChange={(e) => setProfileForm((f) => ({ ...f, sex: e.target.value as "male" | "female" | "" }))}
                style={selectStyle}
              >
                <option value="">Non specificato</option>
                <option value="male">Uomo</option>
                <option value="female">Donna</option>
              </select>
            </FormField>

            <FormField label="Stato">
              <select
                value={profileForm.status}
                onChange={(e) =>
                  setProfileForm((f) => ({
                    ...f,
                    status: e.target.value as "active" | "paused" | "archived",
                  }))
                }
                style={selectStyle}
              >
                <option value="active">Attivo</option>
                <option value="paused">In pausa</option>
                <option value="archived">Archiviato</option>
              </select>
            </FormField>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <FormField label="Tag (separati da virgola)">
              <input
                type="text"
                value={profileForm.tags}
                onChange={(e) => setProfileForm((f) => ({ ...f, tags: e.target.value }))}
                style={inputStyle}
                placeholder="es. dimagrimento, postpartum, atleta"
              />
            </FormField>
          </div>

          <FormField label="Note">
            <textarea
              value={profileForm.notes}
              onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: "100px",
              }}
              placeholder="Note aggiuntive sul cliente..."
            />
          </FormField>
        </div>

        {/* New snapshot toggle */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: addSnapshot ? "20px" : 0,
            }}
          >
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
                Aggiorna scheda
              </h2>
              <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                Nuova rilevazione: misure, obiettivo, scheda allenamento e plicometria.
                I valori non compilati vengono ereditati dall'ultima scheda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddSnapshot((v) => !v)}
              style={{
                padding: "8px 16px",
                backgroundColor: addSnapshot ? "#f3f4f6" : "#1a1a2e",
                color: addSnapshot ? "#374151" : "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {addSnapshot ? "Annulla aggiornamento" : "+ Aggiorna scheda"}
            </button>
          </div>

          {addSnapshot && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <FormField label="Peso (kg)">
                  <input
                    type="number"
                    step="0.1"
                    value={snapshotForm.weightKg}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, weightKg: e.target.value }))}
                    style={inputStyle}
                    placeholder="es. 72.5"
                  />
                </FormField>
                <FormField label="Passi al giorno">
                  <input
                    type="number"
                    value={snapshotForm.dailySteps}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, dailySteps: e.target.value }))}
                    style={inputStyle}
                    placeholder="es. 8000"
                  />
                </FormField>
              </div>

              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "12px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                Circonferenze (cm) — opzionali
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
                <FormField label="Vita">
                  <input type="number" step="0.1" value={snapshotForm.waist}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, waist: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Fianchi">
                  <input type="number" step="0.1" value={snapshotForm.hips}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, hips: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Petto">
                  <input type="number" step="0.1" value={snapshotForm.chest}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, chest: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Braccio destro">
                  <input type="number" step="0.1" value={snapshotForm.armR}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, armR: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Braccio sinistro">
                  <input type="number" step="0.1" value={snapshotForm.armL}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, armL: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Coscia destra">
                  <input type="number" step="0.1" value={snapshotForm.thighR}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, thighR: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Coscia sinistra">
                  <input type="number" step="0.1" value={snapshotForm.thighL}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, thighL: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Addome">
                  <input type="number" step="0.1" value={snapshotForm.abdomen}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, abdomen: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
              </div>

              {/* ── Obiettivo ─────────────────────────────────────────── */}
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#374151",
                  marginTop: "20px",
                  marginBottom: "12px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                Obiettivo
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <FormField label="Obiettivo principale">
                  <select
                    value={goalForm.goal}
                    onChange={(e) =>
                      setGoalForm((g) => ({ ...g, goal: e.target.value as GoalKind }))
                    }
                    style={selectStyle}
                  >
                    <option value="">Non specificato</option>
                    {GOAL_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Peso target (kg)">
                  <input
                    type="number"
                    step="0.1"
                    value={goalForm.targetWeightKg}
                    onChange={(e) =>
                      setGoalForm((g) => ({ ...g, targetWeightKg: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="es. 70"
                  />
                </FormField>
                <FormField label="Evento / obiettivo a data fissa">
                  <input
                    type="text"
                    value={goalForm.targetEvent}
                    onChange={(e) =>
                      setGoalForm((g) => ({ ...g, targetEvent: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="Matrimonio, gara, vacanza"
                  />
                </FormField>
                <FormField label="Data evento">
                  <input
                    type="date"
                    value={goalForm.targetEventDate}
                    onChange={(e) =>
                      setGoalForm((g) => ({ ...g, targetEventDate: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </FormField>
              </div>

              {/* ── Livello occupazionale ────────────────────────────── */}
              <div style={{ marginBottom: "16px" }}>
                <FormField label="Livello di attività lavorativa">
                  <select
                    value={snapshotForm.occupationalLevel}
                    onChange={(e) =>
                      setSnapshotForm((f) => ({
                        ...f,
                        occupationalLevel: e.target.value as SnapshotForm["occupationalLevel"],
                      }))
                    }
                    style={selectStyle}
                  >
                    <option value="">Non specificato</option>
                    {OCC_LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              {/* ── Scheda allenamento settimanale ───────────────────── */}
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#374151",
                  marginTop: "8px",
                  marginBottom: "12px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                Scheda allenamento settimanale
              </div>
              <WeekSessionsEditor value={weekSessions} onChange={setWeekSessions} />

              {/* ── Nuova plicometria ────────────────────────────────── */}
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#374151",
                  marginTop: "20px",
                  marginBottom: "12px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                Nuova plicometria (opzionale)
              </div>
              <SkinfoldsEditor value={skinfolds} onChange={setSkinfolds} />
            </>
          )}
        </div>

        {/* Photo gallery — separate card so it works regardless of the "Aggiorna" toggle */}
        <PhotosCard clientId={clientId} />

        {/* Error */}
        {saveError && (
          <div
            style={{
              marginBottom: "16px",
              padding: "14px 18px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "14px",
            }}
          >
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <Link
            href={`/clients/${clientId}`}
            style={{
              padding: "11px 22px",
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={saving || !profileForm.fullName}
            style={{
              padding: "11px 22px",
              backgroundColor: saving ? "#6b7280" : "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: !profileForm.fullName ? 0.6 : 1,
            }}
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Photos card ────────────────────────────────────────────────────────────────

/**
 * Photo gallery card. Fetches the partner_id (needed to build the storage path
 * prefix) and renders the gallery once it's available.
 */
function PhotosCard({ clientId }: { clientId: string }) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const partnerId = (session as { id?: string } | null | undefined)?.id;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "20px",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          Foto cliente
        </h2>
        <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
          Foto di progresso, plicometria o composizione corporea — visibili anche al cliente nel suo portale.
        </p>
      </div>

      {partnerId ? (
        <ClientPhotoGallery clientId={clientId} partnerId={partnerId} />
      ) : (
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>Caricamento…</p>
      )}
    </div>
  );
}
