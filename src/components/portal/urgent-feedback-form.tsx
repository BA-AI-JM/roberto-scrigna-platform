"use client";

/**
 * Patient urgent-feedback + injury-report (#28). Warm, one-thing-at-a-time
 * portal voice — SEPARATE from the 3-weekly check-in, and NOT a chat.
 *
 * - request lifecycle / list → fetchMyUrgentSubmissions (→ feedback.getMyUrgentSubmissions)
 * - submit → submitUrgentFeedback (→ feedback.submitUrgent)
 *
 * UI-only over the urgent-feedback data seam. Mobile-first, Italian, AA contrast,
 * keyboard-operable, focus-managed, reduced-motion aware.
 */

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { submitUrgentFeedback, fetchMyUrgentSubmissions, UrgentFeedbackError } from "@/lib/feedback/urgent-feedback-adapter";
import {
  EMPTY_URGENT_FORM,
  buildUrgentPayload,
  SEVERITY_OPTIONS,
  kindLabel,
  severityLabel,
  statusBadge,
  formatSubmittedAt,
  MAX_MESSAGE,
  type UrgentFormState,
} from "@/lib/feedback/urgent-validation";
import type { UrgentKind, UrgentSubmission, UrgentSubmissionInput } from "@/lib/feedback/types";

// ── warm portal palette (matches the existing portal de-facto system) ──────────
const card: CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px", marginBottom: "16px" };
const labelStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" };
const inputStyle: CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", color: "#1a1a2e", background: "#ffffff" };
const errText: CSSProperties = { fontSize: "12px", color: "#991b1b", margin: "6px 0 0" };
const muted: CSSProperties = { fontSize: "13px", color: "#6b7280" };

const css = `
.urgent-feedback :where(button,input,select,textarea,a):focus-visible { outline: 2px solid #1a1a2e; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .urgent-feedback * { transition: none !important; animation: none !important; } }`;

function mapError(e: unknown): string {
  const code = e instanceof UrgentFeedbackError ? e.code : "";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "Non sei autorizzato a inviare questa segnalazione.";
  return "Invio non riuscito. Controlla la connessione e riprova tra poco.";
}

// ── kind selector (accessible radio group) ─────────────────────────────────────
function KindSelector({ value, onChange }: { value: UrgentKind; onChange: (k: UrgentKind) => void }) {
  const opts: { value: UrgentKind; label: string; hint: string }[] = [
    { value: "feedback", label: "Feedback urgente", hint: "Qualcosa che non può aspettare il prossimo check-in" },
    { value: "infortunio", label: "Infortunio", hint: "Un dolore o un infortunio da segnalare" },
  ];
  return (
    <fieldset style={{ border: "none", padding: 0, margin: "0 0 18px" }}>
      <legend style={{ ...labelStyle, marginBottom: "10px", padding: 0 }}>Di cosa si tratta?</legend>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {opts.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 14px",
                border: `1px solid ${selected ? "#1a1a2e" : "#e2e8f0"}`,
                background: selected ? "#f8fafc" : "#ffffff",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="urgent-kind"
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "#1a1a2e", flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>{o.label}</span>
                <span style={{ display: "block", fontSize: "12px", color: "#6b7280" }}>{o.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ── form ───────────────────────────────────────────────────────────────────────
export function UrgentFeedbackForm({ onSubmit }: { onSubmit: (p: UrgentSubmissionInput) => Promise<void> }) {
  const [form, setForm] = useState<UrgentFormState>(EMPTY_URGENT_FORM);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof UrgentFormState>(k: K, v: UrgentFormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSubmitError(null);
  };

  const { payload, validation } = buildUrgentPayload(form);

  const handleSubmit = async () => {
    setTouched(true);
    if (!payload) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(payload);
      setDone(true);
      // focus the confirmation after it renders
      requestAnimationFrame(() => confirmRef.current?.focus());
    } catch (e) {
      setSubmitError(mapError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="urgent-feedback">
        <style>{css}</style>
        <div style={{ ...card, background: "#f0fdf4", border: "1px solid #bbf7d0" }} role="status" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <CheckIcon />
            <h2 ref={confirmRef} tabIndex={-1} style={{ fontSize: "18px", fontWeight: 700, color: "#166534", margin: 0, outline: "none" }}>
              Inviato — Roberto è stato avvisato
            </h2>
          </div>
          <p style={{ fontSize: "14px", color: "#166534", margin: "0 0 6px", lineHeight: 1.5 }}>
            Il tuo coach ha ricevuto la segnalazione e la gestirà appena possibile.
          </p>
          <p style={{ fontSize: "13px", color: "#3f6212", margin: 0, lineHeight: 1.5 }}>
            Questa non è una chat: non riceverai una risposta immediata. Trovi lo stato della segnalazione qui sotto.
          </p>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_URGENT_FORM);
              setTouched(false);
              setDone(false);
            }}
            style={{ marginTop: "16px", padding: "10px 18px", borderRadius: "999px", border: "1px solid #bbf7d0", background: "#ffffff", color: "#166534", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Invia un'altra segnalazione
          </button>
        </div>
      </div>
    );
  }

  const showErr = (v: string | null) => touched && v;

  return (
    <div className="urgent-feedback">
      <style>{css}</style>
      <div style={card}>
        <KindSelector value={form.kind} onChange={(k) => set("kind", k)} />

        {/* Message */}
        <div style={{ marginBottom: "18px" }}>
          <label htmlFor="urgent-message" style={labelStyle}>
            {form.kind === "infortunio" ? "Descrivi cosa è successo" : "Descrivi la situazione"}
          </label>
          <textarea
            id="urgent-message"
            value={form.message}
            maxLength={MAX_MESSAGE}
            rows={4}
            placeholder="Descrivi…"
            aria-invalid={showErr(validation.message) ? true : undefined}
            aria-describedby={showErr(validation.message) ? "urgent-message-err" : undefined}
            onChange={(e) => set("message", e.target.value)}
            style={{ ...inputStyle, resize: "vertical", minHeight: "92px" }}
          />
          {showErr(validation.message) && (
            <p id="urgent-message-err" role="alert" style={errText}>
              {validation.message}
            </p>
          )}
        </div>

        {/* Injury structured fields */}
        {form.kind === "infortunio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "18px", paddingTop: "4px", borderTop: "1px solid #f1f5f9" }}>
            <div>
              <label htmlFor="injury-area" style={labelStyle}>
                Zona interessata
              </label>
              <input
                id="injury-area"
                type="text"
                value={form.area}
                placeholder="es. ginocchio destro, zona lombare…"
                aria-invalid={showErr(validation.area) ? true : undefined}
                aria-describedby={showErr(validation.area) ? "injury-area-err" : undefined}
                onChange={(e) => set("area", e.target.value)}
                style={inputStyle}
              />
              {showErr(validation.area) && (
                <p id="injury-area-err" role="alert" style={errText}>
                  {validation.area}
                </p>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
              <div>
                <label htmlFor="injury-severity" style={labelStyle}>
                  Gravità
                </label>
                <select
                  id="injury-severity"
                  value={form.severity}
                  aria-invalid={showErr(validation.severity) ? true : undefined}
                  aria-describedby={showErr(validation.severity) ? "injury-severity-err" : undefined}
                  onChange={(e) => set("severity", e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">Seleziona…</option>
                  {SEVERITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {showErr(validation.severity) && (
                  <p id="injury-severity-err" role="alert" style={errText}>
                    {validation.severity}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="injury-onset" style={labelStyle}>
                  Data di insorgenza
                </label>
                <input
                  id="injury-onset"
                  type="date"
                  value={form.onsetDate}
                  aria-invalid={showErr(validation.onsetDate) ? true : undefined}
                  aria-describedby={showErr(validation.onsetDate) ? "injury-onset-err" : undefined}
                  onChange={(e) => set("onsetDate", e.target.value)}
                  style={inputStyle}
                />
                {showErr(validation.onsetDate) && (
                  <p id="injury-onset-err" role="alert" style={errText}>
                    {validation.onsetDate}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="injury-limitations" style={labelStyle}>
                Limitazioni <span style={{ fontWeight: 400, color: "#6b7280" }}>(facoltativo)</span>
              </label>
              <textarea
                id="injury-limitations"
                value={form.limitations}
                rows={2}
                placeholder="es. non riesco ad accovacciarmi…"
                onChange={(e) => set("limitations", e.target.value)}
                style={{ ...inputStyle, resize: "vertical", minHeight: "60px" }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || (touched && !payload)}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: "999px",
            border: "none",
            background: submitting || (touched && !payload) ? "#cbd5e1" : "#1a1a2e",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: submitting || (touched && !payload) ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Invio…" : "Invia al coach"}
        </button>
        <p style={{ ...muted, fontSize: "12px", textAlign: "center", margin: "10px 0 0" }}>
          Roberto verrà avvisato. Non è una chat: la risposta non è immediata.
        </p>
        {submitError && (
          <p role="alert" style={{ ...errText, textAlign: "center", marginTop: "10px" }}>
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── past submissions ───────────────────────────────────────────────────────────
export function UrgentSubmissionsList({ submissions, loading, error }: { submissions: UrgentSubmission[] | undefined; loading: boolean; error: boolean }) {
  return (
    <div style={card}>
      <p style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px" }}>Le tue segnalazioni</p>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ height: "56px", background: "#f1f5f9", borderRadius: "10px" }} />
          ))}
        </div>
      ) : error ? (
        <p style={{ ...muted, color: "#991b1b" }}>Impossibile caricare le tue segnalazioni. Riprova più tardi.</p>
      ) : !submissions || submissions.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {submissions.map((s) => {
            const badge = statusBadge(s.status);
            return (
              <div key={s.id} style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #eef2f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a2e" }}>{kindLabel(s.kind as UrgentKind)}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: badge.fg, background: badge.bg, borderRadius: "20px", padding: "3px 10px", whiteSpace: "nowrap" }}>
                    {badge.label}
                  </span>
                </div>
                <p style={{ fontSize: "13px", color: "#374151", margin: "0 0 4px", lineHeight: 1.4 }}>{s.message}</p>
                {s.injury && (
                  <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 4px" }}>
                    {s.injury.area} · {severityLabel(s.injury.severity)}
                  </p>
                )}
                <p style={{ fontSize: "11px", color: "#475569", margin: 0 }}>{formatSubmittedAt(s.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "28px", background: "#f8fafc", borderRadius: "10px", textAlign: "center", border: "1px dashed #cbd5e1" }}>
      <div style={{ fontSize: "30px", marginBottom: "10px" }}>📨</div>
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Nessuna segnalazione</p>
      <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>Le tue segnalazioni urgenti compariranno qui.</p>
    </div>
  );
}

function CheckIcon(): ReactNode {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx={12} cy={12} r={11} fill="#16a34a" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── container: wires the seam (submit mutation + list query) ───────────────────
export function UrgentFeedbackScreen() {
  const listQuery = useQuery({ queryKey: ["urgentSubmissions"], queryFn: fetchMyUrgentSubmissions, retry: false });

  return (
    <div>
      <UrgentFeedbackForm
        onSubmit={async (payload) => {
          await submitUrgentFeedback(payload);
          await listQuery.refetch();
        }}
      />
      <UrgentSubmissionsList submissions={listQuery.data} loading={listQuery.isLoading} error={!!listQuery.error} />
    </div>
  );
}
