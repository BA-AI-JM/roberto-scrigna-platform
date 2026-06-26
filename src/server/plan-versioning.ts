/**
 * Plan-versioning logic (lifecycle-spine increment 1).
 *
 * A plan version chain: the ROOT plan has parent_plan_id = NULL and
 * version_number = 1; every new version points parent_plan_id at the ROOT and
 * carries a flat, monotonic version_number = max(chain) + 1 plus a human
 * version_label following Roberto's convention:
 *   - a tweak / regeneration (e.g. a calorie adjustment) is a MINOR bump:
 *     v1 → v1.1 → v1.2 …
 *   - a brand-new plan (new meals) is a MAJOR bump: v1.x → v2
 *
 * Mocking the tRPC ctx.supabase chain is impractical (see body-comp.ts), so the
 * branching logic lives here as pure functions and is unit-tested in isolation;
 * the router/inngest layers only orchestrate the DB calls around it.
 */

export type VersionKind = "minor" | "major";

export interface VersionRow {
  versionNumber: number;
  versionLabel: string | null;
}

/**
 * Parse a version label ("v2.3", "v2", "v1", "2.3") into { major, minor }.
 * A missing / unparseable label is treated as the root, v1 → { major: 1, minor: 0 }.
 */
export function parseVersionLabel(
  label: string | null | undefined
): { major: number; minor: number } {
  if (!label) return { major: 1, minor: 0 };
  const cleaned = label.trim().replace(/^v/i, "");
  const [majRaw, minRaw] = cleaned.split(".");
  const major = Number.parseInt(majRaw ?? "", 10);
  const minor = minRaw != null ? Number.parseInt(minRaw, 10) : 0;
  if (!Number.isFinite(major) || major < 1) return { major: 1, minor: 0 };
  return { major, minor: Number.isFinite(minor) && minor >= 0 ? minor : 0 };
}

/** Format a version label: minor 0 → "v2"; minor > 0 → "v2.3". */
export function formatVersionLabel(major: number, minor: number): string {
  return minor > 0 ? `v${major}.${minor}` : `v${major}`;
}

/** The root id of a version chain: the plan's parent, or its own id if it IS the root. */
export function rootPlanIdOf(plan: {
  id: string;
  parent_plan_id?: string | null;
}): string {
  return plan.parent_plan_id ?? plan.id;
}

/**
 * Compute the next version's number + label for a chain (root + all descendants).
 *
 * - versionNumber: flat monotonic counter = max(chain) + 1.
 * - versionLabel:
 *     minor → bump the minor of the chain's highest major (v2 → v2.1, v2.1 → v2.2)
 *     major → new major at minor 0 (v1.2 → v2)
 */
export function computeNextVersion(
  chain: VersionRow[],
  kind: VersionKind
): { versionNumber: number; versionLabel: string } {
  const rows = chain.length > 0 ? chain : [{ versionNumber: 1, versionLabel: "v1" }];

  const nextNumber = Math.max(...rows.map((r) => r.versionNumber)) + 1;

  const parsed = rows.map((r) => parseVersionLabel(r.versionLabel));
  const maxMajor = Math.max(...parsed.map((p) => p.major));

  if (kind === "major") {
    return { versionNumber: nextNumber, versionLabel: formatVersionLabel(maxMajor + 1, 0) };
  }

  // minor: bump the highest minor seen for the current highest major
  const maxMinorForMajor = Math.max(
    0,
    ...parsed.filter((p) => p.major === maxMajor).map((p) => p.minor)
  );
  return {
    versionNumber: nextNumber,
    versionLabel: formatVersionLabel(maxMajor, maxMinorForMajor + 1),
  };
}

// ── Client-facing plan history (portal) ──────────────────────────────────────

/** A raw plan row (the columns the portal selects) for client-history shaping. */
export interface RawPlanRow {
  id: string;
  status: string | null;
  version_number: number | null;
  version_label: string | null;
  parent_plan_id: string | null;
  created_at: string;
}

/** A plan version as a patient may see it — NO coach-only internals. */
export interface ClientPlanVersion {
  id: string;
  versionNumber: number;
  versionLabel: string;
  status: string;
  isActive: boolean;
  /** Chain root so the portal can group versions of the same plan. */
  rootPlanId: string;
  createdAt: string;
}

/**
 * Map raw plan rows to CLIENT-VISIBLE version history, newest-first. Exposes only
 * label / number / status / active-marker / date / chain-root — deliberately
 * DROPS coach-only fields (change_reason, feedback_check_in_id, review notes,
 * name, bundle). Newest-first by created_at (robust across multiple chains), with
 * version_number as the tiebreak.
 */
export function toClientPlanHistory(rows: RawPlanRow[]): ClientPlanVersion[] {
  const versions: ClientPlanVersion[] = rows.map((r) => ({
    id: r.id,
    versionNumber: r.version_number ?? 1,
    versionLabel: r.version_label ?? "v1",
    status: r.status ?? "draft",
    isActive: r.status === "active",
    rootPlanId: r.parent_plan_id ?? r.id,
    createdAt: r.created_at,
  }));
  return versions.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return b.versionNumber - a.versionNumber;
  });
}

/** Order a version chain newest-first by version_number (descending). */
export function orderVersionsNewestFirst<T extends { versionNumber: number }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => b.versionNumber - a.versionNumber);
}

// ── Feedback-reminder cadence ────────────────────────────────────────────────

/** Days after plan.start_date when the feedback questionnaire becomes due. */
export const FEEDBACK_DUE_DAYS = 21;
/** How many extra days the daily scan keeps matching a plan (catches missed runs). */
export const FEEDBACK_CATCH_DAYS = 7;

/** Whole days between two YYYY-MM-DD dates (b − a), computed in UTC. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN;
  return Math.floor((tb - ta) / 86_400_000);
}

/**
 * Whether a plan's feedback questionnaire is due as of `today`: its start_date
 * is between FEEDBACK_DUE_DAYS and FEEDBACK_DUE_DAYS + FEEDBACK_CATCH_DAYS ago.
 * The window (not an exact day) lets a once-daily scan recover from a missed run
 * without re-firing forever — idempotency against duplicates is enforced
 * separately (an existing 'feedback_requested' notification for the plan).
 */
export function isFeedbackDue(
  startDate: string | null | undefined,
  today: string,
  opts: { dueDays?: number; catchDays?: number } = {}
): boolean {
  if (!startDate) return false;
  const dueDays = opts.dueDays ?? FEEDBACK_DUE_DAYS;
  const catchDays = opts.catchDays ?? FEEDBACK_CATCH_DAYS;
  const elapsed = daysBetween(startDate, today);
  if (Number.isNaN(elapsed)) return false;
  return elapsed >= dueDays && elapsed <= dueDays + catchDays;
}
