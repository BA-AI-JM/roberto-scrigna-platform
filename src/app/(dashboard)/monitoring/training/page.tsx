/**
 * Training log page.
 *
 * Shows training sessions for clients with:
 * - Session table with date, type, duration, perceived effort
 * - Screenshot upload with Claude Vision OCR stub
 * - Quick-add training session form
 * - Filter by client and session type
 */

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScreenshotUploader,
  type UploadedScreenshot,
} from "@/components/screenshot-uploader";
import {
  groupedSportOptions,
  SPORT_TAXONOMY,
} from "@/engine/sport-taxonomy";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Filter values for the type-filter chip row. `"all"` shows everything;
 * the other values are legacy short codes used by rows written before
 * migration 004. New rows use the canonical Appendix D modality string
 * directly (e.g. "Pesi — Ipertrofia") and don't appear here — they fall
 * under "all" or can be filtered via the search functionality.
 */
type SessionTypeFilter =
  | "all"
  | "strength"
  | "hypertrophy"
  | "cardio"
  | "hiit"
  | "flexibility"
  | "deload"
  | "other";

interface TrainingLogItem {
  id: string;
  clientId: string;
  sessionDate: string;
  sessionType: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  ocrExtracted: boolean;
  notes: string | null;
  clientName: string;
  screenshotCount: number;
}

interface NewSessionForm {
  clientId: string;
  sessionDate: string;
  // Free-form: canonical Appendix D Italian display name (e.g. "Pesi — Forza").
  sessionType: string;
  durationMinutes: string;
  perceivedEffort: number;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  strength: "Forza",
  hypertrophy: "Ipertrofia",
  cardio: "Cardio",
  hiit: "HIIT",
  flexibility: "Flessibilità",
  deload: "Deload",
  other: "Altro",
};

function SessionTypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    strength: { bg: "#fef3c7", text: "#92400e" },
    hypertrophy: { bg: "#dbeafe", text: "#1d4ed8" },
    cardio: { bg: "#fce7f3", text: "#9d174d" },
    hiit: { bg: "#fee2e2", text: "#b91c1c" },
    flexibility: { bg: "#d1fae5", text: "#065f46" },
    deload: { bg: "#f3f4f6", text: "#6b7280" },
    other: { bg: "#f3f4f6", text: "#374151" },
  };
  const c = colors[type] ?? colors.other!;
  return (
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
      {SESSION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function EffortDots({ effort }: { effort: number | null }) {
  if (effort === null) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: i < effort
              ? effort >= 8
                ? "#ef4444"
                : effort >= 5
                  ? "#f59e0b"
                  : "#22c55e"
              : "#e5e7eb",
          }}
        />
      ))}
      <span className="tnum" style={{ marginLeft: "6px", fontSize: "12px", color: "#6b7280" }}>{effort}/10</span>
    </div>
  );
}

// ── Filter Tabs ───────────────────────────────────────────────────────────────

// Filter chip row — covers legacy short codes only. New rows with canonical
// modality strings appear under "Tutti".
const SESSION_TABS: Array<{ value: SessionTypeFilter; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "strength", label: "Forza" },
  { value: "hypertrophy", label: "Ipertrofia" },
  { value: "cardio", label: "Cardio" },
  { value: "hiit", label: "HIIT" },
  { value: "flexibility", label: "Flessibilità" },
  { value: "deload", label: "Deload" },
];

/** First sport entry, used as the default modality for a new session. */
const DEFAULT_MODALITY = SPORT_TAXONOMY[0]?.displayIt ?? "Pesi — Ipertrofia";

// ── Page Component ────────────────────────────────────────────────────────────

export default function TrainingLogPage() {
  const queryClient = useQueryClient();
  // trainingLog.delete — correct a mis-logged session. Inline two-step confirm
  // (no native dialog) to avoid an accidental delete.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteMutation = trpc.trainingLog.delete.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trainingLog.list"] });
      setConfirmDeleteId(null);
    },
  });
  const [activeType, setActiveType] = useState<SessionTypeFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState<NewSessionForm>({
    clientId: "",
    sessionDate: new Date().toISOString().split("T")[0]!,
    sessionType: "Pesi — Ipertrofia",
    durationMinutes: "",
    perceivedEffort: 7,
    notes: "",
  });
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);

  // Fetch clients + the partner id (needed for the screenshot upload path).
  const { data: clientsData } = trpc.client.list.useQuery({ limit: 100, status: "active" });
  const clients = clientsData?.clients ?? [];
  const { data: session } = trpc.auth.getSession.useQuery();
  const partnerId = (session as { id?: string } | null | undefined)?.id ?? "";

  // Active client driving the log list (form selection takes priority over filter)
  const activeClientId = selectedClientId;

  // Fetch real training logs for the selected client
  const { data: logsData } = trpc.trainingLog.list.useQuery(
    {
      clientId: activeClientId,
      sessionType:
        activeType !== "all"
          ? (activeType as "strength" | "hypertrophy" | "cardio" | "hiit" | "flexibility" | "deload" | "other")
          : undefined,
      limit: 100,
    },
    { enabled: Boolean(activeClientId) }
  );

  const rawLogs = logsData?.logs ?? [];

  // Map API shape to the local TrainingLogItem type (enrich with clientName from clients list)
  const displayedLogs: TrainingLogItem[] = rawLogs.map((l) => {
    const client = clients.find((c) => c.id === activeClientId);
    return {
      id: l.id,
      clientId: activeClientId,
      sessionDate: l.session_date as string,
      sessionType: l.session_type,
      durationMinutes: l.duration_min as number | null,
      perceivedEffort: l.perceived_effort as number | null,
      ocrExtracted: Boolean(l.ocr_extracted),
      notes: l.notes as string | null,
      clientName: client?.full_name ?? "",
      screenshotCount: Array.isArray((l as { screenshot_urls?: unknown }).screenshot_urls)
        ? ((l as { screenshot_urls?: string[] }).screenshot_urls!.length)
        : 0,
    };
  });

  // Create mutation
  const createMutation = trpc.trainingLog.create.useMutation({
    onSuccess: () => {
      // Invalidate the training log list so the new entry appears immediately
      void queryClient.invalidateQueries({ queryKey: ["trainingLog.list"] });
      setShowForm(false);
      setSubmitError(null);
      setForm({
        clientId: "",
        sessionDate: new Date().toISOString().split("T")[0]!,
        sessionType: DEFAULT_MODALITY,
        durationMinutes: "",
        perceivedEffort: 7,
        notes: "",
      });
      setScreenshots([]);
    },
    onError: (err) => {
      setSubmitError(err.message ?? "Errore nel salvataggio della sessione. Riprova.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const effectiveClientId = form.clientId || selectedClientId;
    if (!effectiveClientId) {
      setSubmitError("Seleziona un cliente prima di salvare.");
      return;
    }
    createMutation.mutate({
      clientId: effectiveClientId,
      sessionDate: form.sessionDate,
      sessionType: form.sessionType,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes, 10) : undefined,
      perceivedEffort: form.perceivedEffort,
      notes: form.notes || undefined,
      screenshotUrls: screenshots.length > 0 ? screenshots.map((s) => s.storagePath) : undefined,
    });
  };

  return (
    <div className="coach-container">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "28px",
        }}
      >
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Roberto Scrigna</p>
          <h1 style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>Log Allenamento</h1>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
            Registra e monitora le sessioni di allenamento dei tuoi clienti
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "10px 20px",
            backgroundColor: "#1a1a2e",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          + Nuova Sessione
        </button>
      </div>

      {/* Client selector */}
      <div style={{ marginBottom: "24px" }}>
        <label
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#374151",
            display: "block",
            marginBottom: "8px",
          }}
        >
          Filtra per cliente
        </label>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          style={{
            padding: "10px 14px",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            fontSize: "14px",
            minWidth: "260px",
            backgroundColor: "#ffffff",
            cursor: "pointer",
          }}
        >
          <option value="">Tutti i clienti</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Quick-add form */}
      {showForm && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 500, color: "#1a1a2e", marginBottom: "20px" }}>
            Registra sessione
          </h2>
          <form onSubmit={handleSubmit}>
            {/* Client selector in form */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                Cliente *
              </label>
              <select
                required
                value={form.clientId || selectedClientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <option value="">Seleziona cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Data
                </label>
                <input
                  type="date"
                  value={form.sessionDate}
                  onChange={(e) => setForm((f) => ({ ...f, sessionDate: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Tipo
                </label>
                <select
                  value={form.sessionType}
                  onChange={(e) => setForm((f) => ({ ...f, sessionType: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {groupedSportOptions().map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.entries.map((entry) => (
                        <option key={entry.displayIt} value={entry.displayIt}>
                          {entry.displayIt}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Durata (min)
                </label>
                <input
                  type="number"
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                  placeholder="es. 60"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Screenshot upload area */}
            <div style={{ marginBottom: "16px" }}>
              <ScreenshotUploader
                partnerId={partnerId}
                clientId={form.clientId || selectedClientId}
                value={screenshots}
                onChange={setScreenshots}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                Note
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Note sulla sessione..."
                rows={2}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {submitError && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "12px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  color: "#991b1b",
                  fontSize: "13px",
                }}
              >
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setShowForm(false); setSubmitError(null); }}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{
                  padding: "10px 20px",
                  backgroundColor: createMutation.isPending ? "#6b7280" : "#1a1a2e",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: createMutation.isPending ? "not-allowed" : "pointer",
                }}
              >
                {createMutation.isPending ? "Salvataggio..." : "Salva sessione"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Session type tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        {SESSION_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveType(tab.value)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeType === tab.value ? 600 : 400,
              color: activeType === tab.value ? "#1a1a2e" : "#6b7280",
              borderBottom:
                activeType === tab.value ? "2px solid #1a1a2e" : "2px solid transparent",
              marginBottom: "-2px",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Training log table */}
      {displayedLogs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#9ca3af" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏋️</div>
          <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#374151" }}>
            {!activeClientId ? "Seleziona un cliente per vedere le sessioni" : "Nessuna sessione di allenamento registrata"}
          </h3>
          <p style={{ fontSize: "14px", marginTop: "8px" }}>
            {!activeClientId
              ? "Usa il selettore qui sopra per filtrare per cliente."
              : "Le sessioni verranno visualizzate qui dopo la registrazione."}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Cliente", "Data", "Tipo", "Durata", "RPE", "OCR", "Note", ""].map((h) => (
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
              {displayedLogs.map((log, idx) => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom:
                      idx < displayedLogs.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                    {log.clientName}
                  </td>
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                    {formatDate(log.sessionDate)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <SessionTypeBadge type={log.sessionType} />
                  </td>
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {log.durationMinutes ? `${log.durationMinutes} min` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <EffortDots effort={log.perceivedEffort} />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {log.ocrExtracted ? (
                      <span style={{ fontSize: "12px", color: "#15803d", fontWeight: 600 }}>
                        ✓ OCR
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "13px",
                      color: "#6b7280",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {log.screenshotCount > 0 && (
                      <span
                        className="tnum"
                        title={`${log.screenshotCount} screenshot caricat${
                          log.screenshotCount === 1 ? "o" : "i"
                        }`}
                        style={{
                          display: "inline-block",
                          marginRight: "6px",
                          padding: "1px 8px",
                          borderRadius: "10px",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        📸 {log.screenshotCount}
                      </span>
                    )}
                    {log.notes ?? "—"}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {confirmDeleteId === log.id ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <button
                          onClick={() => deleteMutation.mutate({ id: log.id })}
                          disabled={deleteMutation.isPending}
                          style={{ fontSize: "13px", color: "#ffffff", fontWeight: 600, padding: "6px 12px", background: "#9f3a2f", border: "none", borderRadius: "6px", cursor: "pointer" }}
                        >
                          {deleteMutation.isPending ? "…" : "Conferma"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500, padding: "6px 12px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer" }}
                        >
                          Annulla
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(log.id)}
                        style={{ fontSize: "13px", color: "#9f3a2f", fontWeight: 500, padding: "6px 12px", background: "#ffffff", border: "1px solid #f0c9c1", borderRadius: "6px", cursor: "pointer" }}
                      >
                        Elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
