/**
 * C1 (#2) — cooperation-type display derivation (Roberto's model, 2026-07-21).
 *
 * Types: abbonamento (recurring, optional window) · consulenza (per-visit,
 * optional count) · fight_camp (its own category, date-bounded) · is_free flag.
 * The lifecycle status (active/paused/archived) is unchanged; the engagement
 * STATE here derives purely from the dates at read time.
 */

export type CooperationType = "abbonamento" | "consulenza" | "fight_camp";
export type EngagementState = "in_corso" | "in_scadenza" | "scaduto" | "futuro" | null;

export interface CooperationFields {
  cooperation_type?: CooperationType | null;
  engagement_start?: string | null;
  engagement_end?: string | null;
  visit_count?: number | null;
  is_free?: boolean | null;
}

export const COOPERATION_LABELS: Record<CooperationType, string> = {
  abbonamento: "Abbonamento",
  consulenza: "Consulenza",
  fight_camp: "Fight camp",
};

/** Days before engagement_end at which "in scadenza" begins. Display-only. */
export const EXPIRY_WARNING_DAYS = 14;

const dayMs = 86_400_000;

export interface CooperationView {
  label: string | null;
  state: EngagementState;
  daysLeft: number | null;
  isFree: boolean;
}

export function deriveCooperation(
  c: CooperationFields,
  today: Date = new Date()
): CooperationView {
  const type = c.cooperation_type ?? null;
  const isFree = c.is_free === true;
  if (!type) return { label: null, state: null, daysLeft: null, isFree };

  let label = COOPERATION_LABELS[type];
  if (type === "consulenza" && c.visit_count != null && c.visit_count > 0) {
    label = `${label} · ${c.visit_count} visite`;
  }

  const start = c.engagement_start ? new Date(c.engagement_start + "T00:00:00") : null;
  const end = c.engagement_end ? new Date(c.engagement_end + "T23:59:59") : null;
  let state: EngagementState = null;
  let daysLeft: number | null = null;

  if (start && today < start) {
    state = "futuro";
  } else if (end) {
    daysLeft = Math.ceil((end.getTime() - today.getTime()) / dayMs);
    if (daysLeft < 0) state = "scaduto";
    else if (daysLeft <= EXPIRY_WARNING_DAYS) state = "in_scadenza";
    else state = "in_corso";
  } else if (start) {
    state = "in_corso";
  }

  return { label, state, daysLeft, isFree };
}
