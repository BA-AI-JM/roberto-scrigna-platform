/**
 * #25 Stage A — plan-update heuristic (weight-change → suggest regenerate).
 *
 * PROMPT LAYER ONLY. This module NEVER mutates a plan. It decides whether a
 * client's bodyweight has dropped enough since their plan started to warrant a
 * coach-initiated regeneration, and (in the scan) emits a COACH-SCOPED
 * notification suggesting it. The apply path is the existing #24 createVersion
 * flow — run by the coach, never here. The coach stays in control.
 *
 * Stage A = weight-LOSS signal only, for ALL active clients (no fighter gate —
 * that is deferred Stage C). Schedule-change + diet-age signals are Stage B.
 */

// ── Provisional defaults — confirm with Roberto ──────────────────────────────
// Roberto's stated heuristic: prompt a regeneration when a client loses > 10%
// bodyweight, suggesting a calorie trim of ~7–10% (midpoint 8.5%). These are
// CALIBRATABLE — surface them for confirmation before treating as final.
export const WEIGHT_CHANGE_THRESHOLD = 0.1; // ≥10% bodyweight LOSS trips the prompt
export const SUGGESTED_KCAL_TRIM_PCT = 0.085; // documented suggestion only (−8.5%); NOT auto-applied

/** The notification trigger this heuristic emits (coach-scoped; see scan). */
export const PLAN_UPDATE_SUGGESTED_TRIGGER = "plan_update_suggested" as const;

/**
 * Signed fractional bodyweight change = (latest − start) / start.
 * A loss is negative (e.g. 90 → 81 ⇒ −0.10). Pure; no I/O.
 * Returns 0 for a non-positive / non-finite start weight (no signal).
 */
export function computeWeightChangePct(startKg: number, latestKg: number): number {
  if (!Number.isFinite(startKg) || startKg <= 0 || !Number.isFinite(latestKg)) return 0;
  return (latestKg - startKg) / startKg;
}

/**
 * True when the change is a LOSS of at least WEIGHT_CHANGE_THRESHOLD.
 * Stage A is loss-only: the −8.5% trim suggestion only makes sense after a cut,
 * so weight GAIN does not trip Stage A. (Epsilon guards the boundary against
 * floating-point dust, e.g. an exact 90→81 = −0.10.)
 */
export function shouldSuggestRegen(changePct: number): boolean {
  return changePct <= -WEIGHT_CHANGE_THRESHOLD + 1e-9;
}

export type WeightSample = {
  weightKg: number | null | undefined;
  date: string | null | undefined;
};

/**
 * Resolve the plan's starting and latest bodyweight from raw samples
 * (check-ins + snapshots merged). Pure; no I/O.
 *   - start  = earliest sample on or after the plan start date; if none (or the
 *              only on-or-after sample IS the latest), fall back to the earliest
 *              sample overall as the baseline.
 *   - latest = the most recent sample.
 * Dates are compared as YYYY-MM-DD (timestamps are truncated to the day).
 * Returns null when there are not two distinct usable days to compare.
 */
export function resolveStartAndLatestWeight(
  samples: WeightSample[],
  planStartDateISO: string | null | undefined,
): { startKg: number; latestKg: number } | null {
  const clean = samples
    .filter(
      (s) => s != null && typeof s.weightKg === "number" && Number.isFinite(s.weightKg) && s.date != null,
    )
    .map((s) => ({ weightKg: s.weightKg as number, date: String(s.date).slice(0, 10) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (clean.length < 2) return null;

  const latest = clean[clean.length - 1]!;
  const startDay = planStartDateISO ? String(planStartDateISO).slice(0, 10) : null;
  const onOrAfter = startDay ? clean.find((s) => s.date >= startDay) : undefined;

  let start = onOrAfter ?? clean[0]!;
  // If the on-or-after baseline IS the latest sample, there is no distinct
  // post-start start point — fall back to the earliest sample overall.
  if (start.date === latest.date) start = clean[0]!;
  if (start.date === latest.date) return null; // truly only one distinct day of data

  return { startKg: start.weightKg, latestKg: latest.weightKg };
}

/** Per-plan outcome of the scan (returned for observability + tests). */
export type RegenScanResult = {
  planId: string;
  clientId: string;
  changePct: number;
  emitted: boolean;
  reason?: string;
};

// The Supabase service-role client surface the scan needs. Typed loosely and
// injected so the scan core is unit-testable against a fake DB (no real I/O).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScanDb = any;

/**
 * Core of the daily plan-update scan, with the DB injected for testability.
 *
 * For each ACTIVE plan: resolve start vs latest bodyweight, compute the change,
 * and — if it is a loss ≥ WEIGHT_CHANGE_THRESHOLD — emit ONE coach-scoped
 * notification suggesting a regeneration (client_id = NULL, so the patient
 * portal feed never sees it). Same-day idempotency: skip if a matching
 * notification already exists for this plan today. NEVER mutates a plan.
 *
 * `nowMs` is injectable so "today" is deterministic in tests.
 */
export async function scanPlanUpdateHeuristicsCore(
  db: ScanDb,
  nowMs: number = Date.now(),
): Promise<RegenScanResult[]> {
  const results: RegenScanResult[] = [];
  const todayStartISO = `${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00.000Z`;

  const { data: plans } = await db
    .from("plan")
    .select("id, client_id, partner_id, name, start_date")
    .eq("status", "active")
    .is("deleted_at", null);

  for (const plan of plans ?? []) {
    const [checkinRes, snapshotRes] = await Promise.all([
      db.from("check_in").select("weight_kg, check_in_date").eq("client_id", plan.client_id),
      db.from("client_snapshot").select("weight_kg, taken_at").eq("client_id", plan.client_id),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const samples: WeightSample[] = [
      ...(((checkinRes?.data ?? []) as any[]).map((r) => ({ weightKg: r.weight_kg, date: r.check_in_date }))),
      ...(((snapshotRes?.data ?? []) as any[]).map((r) => ({ weightKg: r.weight_kg, date: r.taken_at }))),
    ];

    const resolved = resolveStartAndLatestWeight(samples, plan.start_date);
    if (!resolved) {
      results.push({ planId: plan.id, clientId: plan.client_id, changePct: 0, emitted: false, reason: "insufficient-weight-data" });
      continue;
    }

    const changePct = computeWeightChangePct(resolved.startKg, resolved.latestKg);
    if (!shouldSuggestRegen(changePct)) {
      results.push({ planId: plan.id, clientId: plan.client_id, changePct, emitted: false, reason: "below-threshold" });
      continue;
    }

    // Same-day idempotency: don't re-prompt a plan we already prompted today.
    const { count } = await db
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("trigger", PLAN_UPDATE_SUGGESTED_TRIGGER)
      .eq("metadata->>planId", plan.id)
      .gte("created_at", todayStartISO);
    if ((count ?? 0) > 0) {
      results.push({ planId: plan.id, clientId: plan.client_id, changePct, emitted: false, reason: "already-prompted-today" });
      continue;
    }

    const lossPct = Math.round(Math.abs(changePct) * 100);
    await db.from("notification").insert({
      partner_id: plan.partner_id,
      client_id: null, // COACH-SCOPED — must be null so the patient portal feed never sees it.
      trigger: PLAN_UPDATE_SUGGESTED_TRIGGER,
      priority: "medium",
      title: "Aggiornamento piano suggerito",
      body:
        `Cliente –${lossPct}% peso da inizio piano ` +
        `(${resolved.startKg.toFixed(1)}→${resolved.latestKg.toFixed(1)} kg). ` +
        `Suggerito: ridurre kcal ~8.5% e rigenerare (v1.1).`,
      metadata: {
        planId: plan.id,
        clientId: plan.client_id,
        weightChangePct: changePct,
        suggestedKcalReductionPct: -SUGGESTED_KCAL_TRIM_PCT,
        startWeightKg: resolved.startKg,
        latestWeightKg: resolved.latestKg,
      },
      read: false,
    });

    results.push({ planId: plan.id, clientId: plan.client_id, changePct, emitted: true });
  }

  return results;
}
