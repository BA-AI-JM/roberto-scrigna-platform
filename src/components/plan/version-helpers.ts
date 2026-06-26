/**
 * Pure helpers for the plan "Versioni" UI — dependency-free so they are
 * unit-testable in the repo's node-only vitest.
 */

export interface PlanVersion {
  id: string;
  versionLabel: string;
  status: string;
  changeReason: string | null;
  parentPlanId: string | null;
  createdAt: string;
}

export interface StatusMeta {
  label: string;
  bg: string;
  color: string;
}

/** Map a plan status to its Italian label + badge colours. */
export function statusLabel(status: string): StatusMeta {
  switch (status) {
    case "active":
      return { label: "Attivo", bg: "#dcfce7", color: "#15803d" };
    case "archived":
      return { label: "Archiviato", bg: "#f1f5f9", color: "#64748b" };
    case "draft":
      return { label: "Bozza", bg: "#fef9c3", color: "#854d0e" };
    case "completed":
      return { label: "Completato", bg: "#dbeafe", color: "#1d4ed8" };
    default:
      return { label: status, bg: "#f1f5f9", color: "#64748b" };
  }
}

/** Build the createVersion mutation input, omitting a blank reason. */
export function buildCreateVersionInput(
  planId: string,
  reason: string
): { planId: string; changeReason?: string } {
  const r = reason.trim();
  return r === "" ? { planId } : { planId, changeReason: r };
}

/**
 * Resolve the real root plan id of the version chain from a first
 * `listVersions({ rootPlanId: currentPlanId })` result.
 *
 * createVersion always chains children to the root (parent_plan_id = root), so a
 * non-root current plan comes back as only itself with parentPlanId set — that
 * parent is the real root to re-query. Returns null when currentPlanId is
 * already the root (no second query needed).
 */
export function resolveRootPlanId(
  versions: { id: string; parentPlanId: string | null }[],
  currentPlanId: string
): string | null {
  const self = versions.find((v) => v.id === currentPlanId);
  const parent = self?.parentPlanId ?? null;
  return parent && parent !== currentPlanId ? parent : null;
}

export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
