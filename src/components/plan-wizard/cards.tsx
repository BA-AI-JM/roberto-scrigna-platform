"use client";
/**
 * Plan-wizard cards (T3.4a extraction — WeekStructureCard + MacroOverridesCard
 * moved VERBATIM from plans/generate/page.tsx; zero behavior change; props
 * unchanged). Visual retokenization happens in the wizard rebuild, not here.
 */
import { useMemo, useState } from "react";
import { isTrainingLikeDayType, type DayType } from "../../engine/types";
import { groupedSportOptions } from "../../engine/sport-taxonomy";
import { PeriodizationModeSelector } from "../plan/periodization-mode-selector";
import {
  ALL_DAY_TYPES,
  DAY_LABELS_IT,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
} from "./constants";

/** Per-day training session shape sent to the server. Matches
 * IntakeTrainingSession from services/training-modality. */
export interface DaySession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
}


export type WeekPreviewData = {
  days: ReadonlyArray<{
    index: number;
    dayType: DayType;
    tdeeKcal: number;
    exerciseKcal: number;
    targetKcal: number;
    proteinG: number;
    fatG: number;
    carbG: number;
  }>;
  weeklyAverageKcal: number;
  weeklyAverageProteinG: number;
  weeklyAverageTdeeKcal: number;
};

export interface WeekStructureCardProps {
  weekSchedule: DayType[];
  perDaySessions: (DaySession[] | null)[];
  weekPreview: WeekPreviewData | undefined;
  weekPreviewFetching: boolean;
  onPreset: (preset: DayType[]) => void;
  onUpdateDay: (i: number, patch: { dayType?: DayType; sessions?: DaySession[] | null }) => void;
  sectionStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export function WeekStructureCard({
  weekSchedule,
  perDaySessions,
  weekPreview,
  weekPreviewFetching,
  onPreset,
  onUpdateDay,
  sectionStyle,
  labelStyle,
  inputStyle,
}: WeekStructureCardProps) {
  const sportGroups = useMemo(() => groupedSportOptions(), []);

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", marginTop: 0, color: "#18181b" }}>
        Struttura del piano
      </h2>
      <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
        Imposta i giorni ON / OFF / refeed / deload e l&apos;attività di ogni giorno ON. Il dispendio
        e le kcal target si aggiornano in tempo reale.
      </p>

      {/* B3 (#6) — the four periodization modes, front and centre (quick presets
          removed; #17 Stage B selector promoted from below the calendar). Every
          day remains individually editable in the calendar underneath. */}
      <PeriodizationModeSelector
        weekSchedule={weekSchedule}
        onSelect={onPreset}
        labelStyle={labelStyle}
      />

      {/* Calendar grid — horizontal scroll on narrow screens so the 7 day cells never crush */}
      <div style={{ overflowX: "auto", marginBottom: "14px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
            minWidth: "520px",
          }}
        >
        {weekSchedule.map((dt, i) => {
          const c = DAY_TYPE_COLORS[dt];
          return (
            <div
              key={i}
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: "8px",
                padding: "8px 6px",
                background: c.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <div style={{ fontSize: "11px", color: c.text, fontWeight: 600 }}>
                {DAY_LABELS_IT[i]}
              </div>
              {/* Contrast fix (operator 2026-07-21): the select had transparent
                  bg + the cell's text colour — white-on-white on ON days (cell
                  #18181b/text #ffffff; the OS popup inherits the white text on
                  a white popup). Solid readable surface on EVERY tint. */}
              <select
                value={dt}
                onChange={(e) => onUpdateDay(i, { dayType: e.target.value as DayType })}
                style={{
                  fontSize: "10.5px",
                  padding: "3px 6px",
                  border: "1px solid rgba(0,0,0,0.18)",
                  borderRadius: "6px",
                  background: "#ffffff",
                  color: "#18181b",
                  fontWeight: 700,
                  cursor: "pointer",
                  outline: "none",
                  maxWidth: "100%",
                }}
              >
                {ALL_DAY_TYPES.map((opt) => (
                  <option key={opt} value={opt} style={{ color: "#18181b", background: "#ffffff" }}>
                    {DAY_TYPE_LABELS[opt]}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        </div>
      </div>

      {/* B4 (#7) + operator 2026-07-21: per-day sessions — EVERY session is a
          fully editable row (modality/durata/RPE). Double days get a real second
          row (max 2), no auto-fill: the coach owns both sessions. State/server/
          engine already carry arrays (duration-weighted MET). */}
      <div style={{ marginBottom: "14px" }}>
        <label style={labelStyle}>Attività per giorno (solo giorni ON)</label>
        <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "440px" }}>
          {/* D1a (R13): column headers for the session rows */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 100px 80px 30px",
              gap: "8px",
              fontSize: "10.5px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#9ca3af",
            }}
          >
            <span>Giorno</span>
            <span>Attività</span>
            <span>Durata (min)</span>
            <span>RPE</span>
            <span />
          </div>
          {weekSchedule.map((dt, i) => {
            if (!isTrainingLikeDayType(dt)) return null;
            const sessions = perDaySessions[i] ?? [];
            const rows: DaySession[] = sessions.length > 0 ? sessions : [{ modality: "", duration_min: 60, rpe: 7 }];
            const setRow = (si: number, patch: Partial<DaySession>) => {
              const next = rows.map((r, j) => (j === si ? { ...r, ...patch } : r));
              // First row cleared to the default option → whole day falls back to null.
              if (si === 0 && patch.modality === "" && next.length === 1) {
                onUpdateDay(i, { sessions: null });
              } else {
                onUpdateDay(i, { sessions: next });
              }
            };
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {rows.map((row, si) => (
                  <div
                    key={si}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "60px 1fr 100px 80px 30px",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46" }}>
                      {si === 0 ? DAY_LABELS_IT[i] : ""}
                      {si > 0 && (
                        <span style={{ fontSize: "10px", color: "#71717a", fontWeight: 500 }}>2ª sess.</span>
                      )}
                    </div>
                    <select
                      value={row.modality ?? ""}
                      onChange={(e) => setRow(si, { modality: e.target.value })}
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                    >
                      {si === 0 ? (
                        <option value="">Default (media settimanale)</option>
                      ) : (
                        <option value="">— scegli attività —</option>
                      )}
                      {sportGroups.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.entries.map((sp) => (
                            <option key={sp.displayIt} value={sp.displayIt}>
                              {sp.displayIt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={10}
                      max={300}
                      step={5}
                      value={row.duration_min ?? 60}
                      onChange={(e) => setRow(si, { duration_min: Number(e.target.value) || 60 })}
                      placeholder="min"
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                    />
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={row.rpe ?? 7}
                      onChange={(e) => setRow(si, { rpe: Number(e.target.value) || 7 })}
                      placeholder="RPE"
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                    />
                    {si > 0 ? (
                      <button
                        type="button"
                        title="Rimuovi la seconda sessione"
                        onClick={() => onUpdateDay(i, { sessions: rows.filter((_, j) => j !== si) })}
                        style={{
                          border: "1px solid #fecaca",
                          background: "#ffffff",
                          color: "#b91c1c",
                          borderRadius: "6px",
                          padding: "4px 0",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        ✕
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {rows.length === 1 && rows[0] && rows[0].modality !== "" && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDay(i, {
                        sessions: [...rows, { modality: rows[0]!.modality, duration_min: 60, rpe: 7 }],
                      })
                    }
                    style={{
                      alignSelf: "flex-start",
                      marginLeft: "68px",
                      border: "1px dashed #d4d4d8",
                      background: "transparent",
                      color: "#3f3f46",
                      borderRadius: "999px",
                      padding: "3px 12px",
                      cursor: "pointer",
                      fontSize: "11.5px",
                      fontWeight: 500,
                    }}
                  >
                    + 2ª sessione
                  </button>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Live weekly table */}
      <div>
        <label style={labelStyle}>
          Dispendio energetico settimanale {weekPreviewFetching ? "· aggiornamento…" : ""}
        </label>
        <div className="table-scroll">
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: "8px",
            overflow: "hidden",
            fontSize: "12px",
            minWidth: "480px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
              background: "#f4f4f5",
              padding: "6px 10px",
              fontWeight: 600,
              color: "#52525b",
            }}
          >
            <div>Giorno</div>
            <div>Tipo</div>
            <div style={{ textAlign: "right" }}>TDEE</div>
            <div style={{ textAlign: "right" }}>Attività</div>
            <div style={{ textAlign: "right" }}>Apporto</div>
          </div>
          {(weekPreview?.days ?? Array.from({ length: 7 }, (_, i) => ({
            index: i,
            dayType: weekSchedule[i] ?? "rest",
            tdeeKcal: 0,
            exerciseKcal: 0,
            targetKcal: 0,
          }))).map((d) => (
            <div
              key={d.index}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
                padding: "6px 10px",
                borderTop: "1px solid #e4e4e7",
                color: "#3f3f46",
              }}
            >
              <div style={{ fontWeight: 600 }}>{DAY_LABELS_IT[d.index]}</div>
              <div style={{ color: DAY_TYPE_COLORS[d.dayType].text }}>
                {DAY_TYPE_LABELS[d.dayType]}
              </div>
              <div className="tnum" style={{ textAlign: "right" }}>{d.tdeeKcal || "—"}</div>
              <div className="tnum" style={{ textAlign: "right" }}>{d.exerciseKcal || "—"}</div>
              <div className="tnum" style={{ textAlign: "right", fontWeight: 600 }}>
                {d.targetKcal || "—"}
              </div>
            </div>
          ))}
          {weekPreview && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
                padding: "8px 10px",
                background: "#fafafa",
                borderTop: "1px solid #e4e4e7",
                fontWeight: 700,
                color: "#18181b",
              }}
            >
              <div>Media</div>
              <div>—</div>
              <div className="tnum" style={{ textAlign: "right" }}>{weekPreview.weeklyAverageTdeeKcal}</div>
              <div style={{ textAlign: "right" }}>—</div>
              <div className="tnum" style={{ textAlign: "right" }}>{weekPreview.weeklyAverageKcal}</div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Macro overrides card ─────────────────────────────────────────────────────

export interface MacroOverridesCardProps {
  weekSchedule: DayType[];
  macroOverrides: Record<DayType, { proteinG: string; fatG: string; carbG: string }>;
  weekPreview: WeekPreviewData | undefined;
  onChange: (dt: DayType, field: "proteinG" | "fatG" | "carbG", value: string) => void;
  onClear: (dt: DayType) => void;
  sectionStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export function MacroOverridesCard({
  weekSchedule,
  macroOverrides,
  weekPreview,
  onChange,
  onClear,
  sectionStyle,
  labelStyle,
  inputStyle,
}: MacroOverridesCardProps) {
  // Only show rows for day-types actually present in the schedule (incl. #17 tiers).
  const presentDayTypes = useMemo(() => {
    const seen = new Set<DayType>();
    for (const dt of weekSchedule) seen.add(dt);
    return ALL_DAY_TYPES.filter((dt) => seen.has(dt));
  }, [weekSchedule]);

  // Help the coach by showing what the engine would compute when the field is blank
  const formulaPreview = useMemo(() => {
    const out: Partial<Record<DayType, { proteinG: number; fatG: number; carbG: number }>> = {};
    if (!weekPreview) return out;
    for (const day of weekPreview.days) {
      if (!out[day.dayType]) {
        out[day.dayType] = { proteinG: day.proteinG, fatG: day.fatG, carbG: day.carbG };
      }
    }
    return out;
  }, [weekPreview]);

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", marginTop: 0, color: "#18181b" }}>
        Macro per giorno (opzionale)
      </h2>
      <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
        Lascia vuoto per usare la formula automatica (2.5/2.2 g P/kg massa magra, 0.9–1.0 g F/kg peso).
        Imposta un valore in grammi per fissare quel macronutriente su quel tipo di giorno.
      </p>

      <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "440px" }}>
        {presentDayTypes.map((dt) => {
          const row = macroOverrides[dt];
          const formula = formulaPreview[dt];
          const dirty = row.proteinG !== "" || row.fatG !== "" || row.carbG !== "";
          return (
            <div
              key={dt}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 1fr 1fr 60px",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: DAY_TYPE_COLORS[dt].text,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  background: DAY_TYPE_COLORS[dt].bg,
                  border: `1px solid ${DAY_TYPE_COLORS[dt].border}`,
                  textAlign: "center",
                }}
              >
                {DAY_TYPE_LABELS[dt]}
              </div>
              {(["proteinG", "fatG", "carbG"] as const).map((field) => (
                <div key={field}>
                  <label
                    style={{
                      fontSize: "10px",
                      color: "#71717a",
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    {field === "proteinG" ? "P (g)" : field === "fatG" ? "F (g)" : "C (g)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={row[field]}
                    onChange={(e) => onChange(dt, field, e.target.value)}
                    placeholder={
                      formula
                        ? String(
                            field === "proteinG"
                              ? formula.proteinG
                              : field === "fatG"
                              ? formula.fatG
                              : formula.carbG
                          )
                        : "—"
                    }
                    style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                  />
                </div>
              ))}
              {dirty ? (
                <button
                  type="button"
                  onClick={() => onClear(dt)}
                  style={{
                    fontSize: "11px",
                    color: "#2563eb",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  reset
                </button>
              ) : (
                <div />
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* Hidden labelStyle reference to satisfy linter when unused */}
      <span style={{ ...labelStyle, display: "none" }} />
    </div>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

