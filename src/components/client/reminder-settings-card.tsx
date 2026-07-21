"use client";

/**
 * Coach reminder-settings card (#07) — set a client's check-in + body-composition
 * reminder cadence. Lives in the single-client dashboard. Matches the coach-side
 * density (hairline #e2e8f0 borders, calm, no shadows) and uses shadcn/ui form
 * controls. UI-only over the reminder-settings data seam (→ notification.*ReminderSettings).
 *
 * Split:
 * - ReminderSettingsForm: presentational + local form state (testable in isolation).
 * - ReminderSettingsCard: data container (query + mutation via the adapter).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchReminderSettings, saveReminderSettings, ReminderSettingsError } from "@/lib/reminders/reminder-settings-adapter";
import {
  buildSettings,
  formatCadenceSummary,
  reminderErrorMessage,
  CHECK_IN_MIN,
  CHECK_IN_MAX,
  BODY_COMP_MIN,
  BODY_COMP_MAX,
  DEFAULT_REMINDER_SETTINGS,
} from "@/lib/reminders/reminder-validation";
import type { ReminderSettings } from "@/lib/reminders/types";

// ── coach card shell (matches the surrounding dashboard sections) ──────────────
const card: CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" };
const header: CSSProperties = { padding: "20px 24px", borderBottom: "1px solid #f1f5f9" };
const titleStyle: CSSProperties = { fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 };
const subStyle: CSSProperties = { fontSize: "12px", fontWeight: 400, color: "#6b7280", margin: "4px 0 0" };
const body: CSSProperties = { padding: "20px 24px" };
const errText: CSSProperties = { fontSize: "12px", color: "#b4453b", margin: "6px 0 0" };

const css = `
.reminder-card button:focus-visible, .reminder-card input:focus-visible {
  outline: 2px solid #1a1a2e; outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .reminder-card * { transition: none !important; }
}`;

function Toggle({ checked, disabled, onChange, label, id }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: "44px",
        height: "26px",
        borderRadius: "999px",
        // Off-state border must clear 3:1 vs the white card (WCAG 1.4.11) so the
        // control is perceivable when off — #64748b ≈ 4.5:1; #cbd5e1 was ~1.5:1.
        border: `1px solid ${checked ? "#1a1a2e" : "#64748b"}`,
        background: checked ? "#1a1a2e" : "#e2e8f0",
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background .15s ease",
      }}
    >
      <span
        aria-hidden
        style={{ position: "absolute", top: "2px", left: checked ? "20px" : "2px", width: "20px", height: "20px", borderRadius: "999px", background: "#ffffff", transition: "left .15s ease", boxShadow: "0 1px 2px rgba(0,0,0,.15)" }}
      />
    </button>
  );
}

export function ReminderSettingsForm({
  initial,
  onSave,
  mapError = (e) => reminderErrorMessage(e instanceof ReminderSettingsError ? e.code : null),
}: {
  initial: ReminderSettings;
  onSave: (s: ReminderSettings) => Promise<void>;
  mapError?: (e: unknown) => string;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [checkInStr, setCheckInStr] = useState(String(initial.checkInEveryDays));
  const [bodyCompStr, setBodyCompStr] = useState(String(initial.bodyCompEveryDays));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);

  // Re-seed when the loaded settings change (e.g. the query resolves for a new
  // client). Guarded by touchedRef so a background refetch — or the echo of our
  // own save — never clobbers in-progress edits or wipes the success banner.
  useEffect(() => {
    if (touchedRef.current) return;
    setEnabled(initial.enabled);
    setCheckInStr(String(initial.checkInEveryDays));
    setBodyCompStr(String(initial.bodyCompEveryDays));
    setSaved(false);
    setSaveError(null);
  }, [initial]);

  const dirtyReset = () => {
    setSaved(false);
    setSaveError(null);
    setTouched(true);
    touchedRef.current = true;
  };

  const { settings, validation } = buildSettings(enabled, checkInStr, bodyCompStr);
  const showCheckInErr = touched && validation.checkIn;
  const showBodyCompErr = touched && validation.bodyComp;

  const handleSave = async () => {
    setTouched(true);
    if (!settings) return; // validation messages already render
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(settings);
      setSaved(true);
    } catch (e) {
      setSaveError(mapError(e));
    } finally {
      setSaving(false);
    }
  };

  const summary = settings ?? { enabled, checkInEveryDays: DEFAULT_REMINDER_SETTINGS.checkInEveryDays, bodyCompEveryDays: DEFAULT_REMINDER_SETTINGS.bodyCompEveryDays };
  const inactiveStyle: CSSProperties = enabled ? {} : { opacity: 0.5 };

  return (
    <div className="reminder-card" style={card}>
      <style>{css}</style>
      <div style={header}>
        <h3 style={titleStyle}>Frequenza check-in</h3>
        <p style={subStyle}>Ogni quanti giorni per check-in e composizione corporea · promemoria automatici per questo cliente.</p>
      </div>
      <div style={body}>
        {/* Enable / disable */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px" }}>
          <Label htmlFor="reminders-enabled" style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
            Promemoria attivi
          </Label>
          <Toggle
            id="reminders-enabled"
            label="Promemoria attivi"
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              dirtyReset();
            }}
          />
        </div>

        {/* Cadence inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", ...inactiveStyle }}>
          <div>
            <Label htmlFor="checkin-days" style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
              Check-in (giorni)
            </Label>
            <Input
              id="checkin-days"
              type="number"
              inputMode="numeric"
              min={CHECK_IN_MIN}
              max={CHECK_IN_MAX}
              step={1}
              value={checkInStr}
              disabled={!enabled}
              aria-invalid={showCheckInErr ? true : undefined}
              aria-describedby={showCheckInErr ? "checkin-err" : undefined}
              onChange={(e) => {
                setCheckInStr(e.target.value);
                dirtyReset();
              }}
            />
            {showCheckInErr && (
              <p id="checkin-err" role="alert" style={errText}>
                {validation.checkIn}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="bodycomp-days" style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
              Composizione corporea (giorni)
            </Label>
            <Input
              id="bodycomp-days"
              type="number"
              inputMode="numeric"
              min={BODY_COMP_MIN}
              max={BODY_COMP_MAX}
              step={1}
              value={bodyCompStr}
              disabled={!enabled}
              aria-invalid={showBodyCompErr ? true : undefined}
              aria-describedby={showBodyCompErr ? "bodycomp-err" : undefined}
              onChange={(e) => {
                setBodyCompStr(e.target.value);
                dirtyReset();
              }}
            />
            {showBodyCompErr && (
              <p id="bodycomp-err" role="alert" style={errText}>
                {validation.bodyComp}
              </p>
            )}
          </div>
        </div>

        {/* Effective cadence, plain Italian */}
        <p style={{ fontSize: "13px", fontWeight: 400, color: "#6b7280", margin: "16px 0 0" }} data-testid="cadence-summary">
          {formatCadenceSummary(summary as ReminderSettings)}
        </p>

        {/* Save + feedback */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "20px" }}>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || (touched && !settings)}
            style={{ backgroundColor: "#1a1a2e", color: "#ffffff" }}
          >
            {saving ? "Salvataggio…" : "Salva promemoria"}
          </Button>
          {/* Persistent live region (always in the DOM) so the success text is
              reliably announced when it's injected (WCAG 4.1.3). */}
          <span role="status" aria-live="polite" style={{ fontSize: "13px", fontWeight: 500, color: "#0f6e56" }}>
            {saved ? "Promemoria aggiornati" : ""}
          </span>
        </div>
        {saveError && (
          <p role="alert" style={errText}>
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── container: data fetching via the seam ──────────────────────────────────────
export function ReminderSettingsCard({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ["reminderSettings", clientId],
    queryFn: () => fetchReminderSettings(clientId),
    retry: false,
    // The form owns post-load state; don't let a focus refetch re-seed over edits.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  if (query.isLoading) {
    return (
      <div className="reminder-card" style={card}>
        <div style={header}>
          <h3 style={titleStyle}>Frequenza check-in</h3>
        </div>
        <div style={body}>
          <div style={{ height: "26px", width: "40%", background: "#eef2f6", borderRadius: "6px", marginBottom: "16px" }} />
          <div style={{ height: "40px", background: "#f1f5f9", borderRadius: "8px" }} />
        </div>
      </div>
    );
  }

  if (query.error) {
    const code = query.error instanceof ReminderSettingsError ? query.error.code : null;
    return (
      <div className="reminder-card" style={card}>
        <div style={header}>
          <h3 style={titleStyle}>Frequenza check-in</h3>
        </div>
        <div style={body}>
          <p role="alert" style={{ fontSize: "13px", color: "#b4453b", margin: 0 }}>
            {reminderErrorMessage(code)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReminderSettingsForm
      initial={query.data ?? DEFAULT_REMINDER_SETTINGS}
      onSave={async (s) => {
        // The save response is authoritative and the form already reflects `s`;
        // no refetch (it would re-seed and clobber the success state — see touchedRef).
        await saveReminderSettings({ clientId, ...s });
      }}
    />
  );
}
