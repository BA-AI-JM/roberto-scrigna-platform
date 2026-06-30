"use client";

/**
 * #25 UI surfacing — the coach-facing "plan update suggested" banner.
 *
 * The #25 backend (scanPlanUpdateHeuristics, PR #35) already EMITS a coach-scoped
 * notification with trigger "plan_update_suggested" when a client drops ≥10%
 * weight: metadata = { planId, clientId, weightChangePct, suggestedKcalReductionPct }
 * (suggestedKcalReductionPct is negative, e.g. -0.085). This is pure surfacing on
 * the plan review page — match an unread suggestion to the open plan and offer a
 * one-click regenerate via the existing #24 createVersion flow.
 *
 * NOTE: this triggers a plain new version (the existing regenerate flow). Pre-
 * seeding the suggested −8.5% kcal into the new version's macro overrides is a
 * follow-up (out of this UI lane).
 */

import type React from "react";

/** The notification fields the matcher needs (a subset of notification.list). */
export interface PlanNotificationLite {
  id: string;
  trigger: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
}

export interface PlanUpdateSuggestion {
  /** The notification id (so the page can mark it read after acting). */
  notificationId: string;
  planId: string;
  /** Positive percent, e.g. 8.5 (from metadata's negative fraction). */
  kcalReductionPct: number;
}

export const PLAN_UPDATE_SUGGESTED_TRIGGER = "plan_update_suggested";

/**
 * Find the first UNREAD plan_update_suggested notification whose metadata.planId
 * matches `planId`. Returns null when none matches (→ no banner). Pure.
 */
export function findPlanUpdateSuggestion(
  notifications: PlanNotificationLite[] | undefined,
  planId: string
): PlanUpdateSuggestion | null {
  if (!planId) return null;
  for (const n of notifications ?? []) {
    if (n.trigger !== PLAN_UPDATE_SUGGESTED_TRIGGER || n.read) continue;
    const meta = (n.metadata ?? {}) as Record<string, unknown>;
    if (meta.planId !== planId) continue;
    const raw = typeof meta.suggestedKcalReductionPct === "number" ? meta.suggestedKcalReductionPct : 0;
    return { notificationId: n.id, planId, kcalReductionPct: Math.abs(raw) * 100 };
  }
  return null;
}

/** 8.5 → "8.5", 8 → "8" (1-decimal, trailing-zero trimmed). */
export function formatKcalReductionPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return String(r);
}

/**
 * The label of the version a regenerate would create — "v1.N" where N is the
 * current number of versions in the chain (original only → "v1.1"). Pure.
 */
export function suggestedNextVersionLabel(versionCount: number): string {
  return `v1.${Math.max(1, versionCount)}`;
}

const bannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  padding: "14px 18px",
  marginBottom: "20px",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
};

export function PlanUpdateBanner({
  suggestion,
  nextVersionLabel,
  isRegenerating = false,
  onRegenerate,
}: {
  suggestion: PlanUpdateSuggestion | null;
  nextVersionLabel: string;
  isRegenerating?: boolean;
  onRegenerate: () => void;
}) {
  if (!suggestion) return null;
  const pct = formatKcalReductionPct(suggestion.kcalReductionPct);

  return (
    <div style={bannerStyle} data-testid="plan-update-banner">
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <span style={{ fontSize: "20px", lineHeight: "24px" }} aria-hidden>
          📋
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e3a8a" }}>
            Aggiornamento piano suggerito
          </div>
          <div style={{ fontSize: "13px", color: "#1d4ed8", marginTop: "2px" }}>
            Suggerito: ridurre kcal ~{pct}% e rigenerare ({nextVersionLabel})
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={isRegenerating}
        style={{
          flexShrink: 0,
          padding: "9px 16px",
          borderRadius: "9px",
          border: "none",
          background: isRegenerating ? "#93c5fd" : "#2563eb",
          color: "#ffffff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: isRegenerating ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isRegenerating ? "Rigenerazione…" : `Rigenera (${nextVersionLabel})`}
      </button>
    </div>
  );
}
