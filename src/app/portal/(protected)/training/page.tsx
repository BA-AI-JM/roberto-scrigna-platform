/**
 * Portal training log page.
 *
 * Client-facing UI: list recent training sessions + an entry form so the
 * client can log their own workouts (with optional screenshot upload).
 *
 * Auth-gated by the portal protected layout — every request is scoped to the
 * authenticated client_id via the clientProcedure tRPC procedure.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import {
  ScreenshotUploader,
  type UploadedScreenshot,
} from "@/components/screenshot-uploader";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const DAY_TYPE_LABELS: Record<string, string> = {
  training: "Allenamento",
  rest: "Riposo",
  refeed: "Refeed",
  deload: "Deload",
};

// ── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  dayType: "training" | "rest" | "refeed" | "deload";
  durationMin: string;
  avgHeartRate: string;
  kcalEstimated: string;
  steps: string;
  rpe: number;
  trainingNotes: string;
}

const EMPTY_FORM: FormState = {
  dayType: "training",
  durationMin: "",
  avgHeartRate: "",
  kcalEstimated: "",
  steps: "",
  rpe: 7,
  trainingNotes: "",
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "24px",
  marginBottom: "20px",
} as const;

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
} as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  color: "#111827",
  backgroundColor: "#ffffff",
};

const selectStyle: React.CSSProperties = { ...inputStyle, backgroundColor: "#ffffff" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalTrainingLogPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const queryClient = useQueryClient();

  const { data: profile } = trpc.portal.getMyProfile.useQuery();
  const partner = (profile?.partner as { id?: string } | undefined) ?? undefined;
  const partnerId = partner?.id ?? "";
  const clientId = (profile as { id?: string } | undefined)?.id ?? "";

  const { data: logsData, isLoading: logsLoading } =
    trpc.portal.getTrainingLogs.useQuery({ limit: 20, offset: 0 });
  const logs = (logsData?.logs ?? []) as Array<Record<string, unknown>>;

  const addLog = trpc.portal.addTrainingLog.useMutation({
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setScreenshots([]);
      setSubmitError(null);
      setSubmitSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ["portal.getTrainingLogs"] });
      setTimeout(() => setSubmitSuccess(false), 2500);
    },
    onError: (err) => {
      setSubmitError(err.message ?? "Errore nel salvataggio.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    const parseInt0 = (s: string) => (s.trim() === "" ? undefined : parseInt(s, 10));
    const parseFloat0 = (s: string) => (s.trim() === "" ? undefined : parseFloat(s));

    addLog.mutate({
      dayType: form.dayType,
      durationMin: parseInt0(form.durationMin),
      avgHeartRate: parseInt0(form.avgHeartRate),
      kcalEstimated: parseInt0(form.kcalEstimated),
      steps: parseInt0(form.steps),
      rpe: parseFloat0(String(form.rpe)),
      trainingNotes: form.trainingNotes || undefined,
      screenshotUrls: screenshots.length > 0 ? screenshots.map((s) => s.storagePath) : undefined,
    });
  };

  return (
    <div style={{ padding: "32px 24px", maxWidth: "760px", margin: "0 auto" }}>
      <Link
        href="/portal/dashboard"
        style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none" }}
      >
        ← Torna alla dashboard
      </Link>

      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1a1a2e", marginTop: "12px", marginBottom: "20px" }}>
        I miei allenamenti
      </h1>

      {/* Entry form */}
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 16px" }}>
          Registra un allenamento
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "14px" }}>
          <div>
            <label style={labelStyle}>Tipo di giornata</label>
            <select
              value={form.dayType}
              onChange={(e) => setForm((f) => ({ ...f, dayType: e.target.value as FormState["dayType"] }))}
              style={selectStyle}
            >
              <option value="training">Allenamento</option>
              <option value="rest">Riposo</option>
              <option value="refeed">Refeed</option>
              <option value="deload">Deload</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Durata (min)</label>
            <input
              type="number"
              min={1}
              max={480}
              value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
              style={inputStyle}
              placeholder="es. 60"
            />
          </div>
          <div>
            <label style={labelStyle}>FC media (opz.)</label>
            <input
              type="number"
              min={40}
              max={250}
              value={form.avgHeartRate}
              onChange={(e) => setForm((f) => ({ ...f, avgHeartRate: e.target.value }))}
              style={inputStyle}
              placeholder="bpm"
            />
          </div>
          <div>
            <label style={labelStyle}>Kcal (opz.)</label>
            <input
              type="number"
              min={0}
              max={5000}
              value={form.kcalEstimated}
              onChange={(e) => setForm((f) => ({ ...f, kcalEstimated: e.target.value }))}
              style={inputStyle}
              placeholder="es. 450"
            />
          </div>
          <div>
            <label style={labelStyle}>Passi (opz.)</label>
            <input
              type="number"
              min={0}
              max={100000}
              value={form.steps}
              onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))}
              style={inputStyle}
              placeholder="es. 8000"
            />
          </div>
          <div>
            <label style={labelStyle}>{`RPE: ${form.rpe}`}</label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.rpe}
              onChange={(e) => setForm((f) => ({ ...f, rpe: parseInt(e.target.value, 10) }))}
              style={{ width: "100%", marginTop: "8px" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af" }}>
              <span>1</span><span>10</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Note</label>
          <textarea
            rows={3}
            value={form.trainingNotes}
            onChange={(e) => setForm((f) => ({ ...f, trainingNotes: e.target.value }))}
            style={{ ...inputStyle, resize: "vertical", minHeight: "70px", fontFamily: "inherit" }}
            placeholder="Esercizi, carichi, sensazioni…"
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Screenshot del workout (opzionale)</label>
          {partnerId && clientId ? (
            <ScreenshotUploader
              partnerId={partnerId}
              clientId={clientId}
              value={screenshots}
              onChange={setScreenshots}
              hint="Trascina lo screenshot dell'allenamento o clicca per caricare"
            />
          ) : (
            <p style={{ fontSize: "12px", color: "#9ca3af" }}>Caricamento del profilo…</p>
          )}
        </div>

        {submitError && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "13px",
              marginBottom: "12px",
            }}
          >
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div
            style={{
              padding: "10px 14px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              color: "#166534",
              fontSize: "13px",
              marginBottom: "12px",
            }}
          >
            Allenamento registrato. Buon recupero!
          </div>
        )}

        <button
          type="submit"
          disabled={addLog.isPending}
          style={{
            padding: "12px 24px",
            background: addLog.isPending ? "#6b7280" : "#1a1a2e",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "14px",
            cursor: addLog.isPending ? "not-allowed" : "pointer",
          }}
        >
          {addLog.isPending ? "Salvataggio…" : "Salva allenamento"}
        </button>
      </form>

      {/* History */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>
          Storico
        </h2>

        {logsLoading && <p style={{ fontSize: "13px", color: "#9ca3af" }}>Caricamento…</p>}
        {!logsLoading && logs.length === 0 && (
          <p style={{ fontSize: "13px", color: "#9ca3af" }}>
            Ancora nessun allenamento registrato.
          </p>
        )}

        {logs.length > 0 && (
          <div style={{ display: "grid", gap: "10px" }}>
            {logs.map((log) => {
              const id = String(log.id);
              const dt = log.day_type as string | null;
              const dur = log.duration_min as number | null;
              const hr = log.avg_heart_rate as number | null;
              const kcal = log.kcal_estimated as number | null;
              const rpe = log.rpe as number | null;
              const notes = log.training_notes as string | null;
              const shots = (log.screenshot_urls as string[] | null) ?? [];
              return (
                <div
                  key={id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>
                      {DAY_TYPE_LABELS[dt ?? ""] ?? dt ?? "—"}
                    </span>
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>
                      {formatDate(log.logged_at as string)}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#374151" }}>
                    {dur != null && <span>{dur} min</span>}
                    {hr != null && <span>{dur != null ? " · " : ""}{hr} bpm</span>}
                    {kcal != null && <span>{dur != null || hr != null ? " · " : ""}{kcal} kcal</span>}
                    {rpe != null && <span>{dur != null || hr != null || kcal != null ? " · " : ""}RPE {rpe}</span>}
                    {shots.length > 0 && (
                      <span style={{ marginLeft: "8px", color: "#1d4ed8", fontWeight: 600 }}>
                        📸 {shots.length}
                      </span>
                    )}
                  </div>
                  {notes && (
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#52525b" }}>
                      {notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
