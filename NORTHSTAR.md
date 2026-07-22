# NORTHSTAR — Roberto Scrigna Platform
*Canonical intent. When any plan, review, model, or taste dispute needs arbitration, this document rules. Precedence: NORTHSTAR > PLAN-OF-RECORD > registers > preference.*
*Authored 2026-07-19 from the full audit arc (P0–P3). Supersedes intent statements scattered in handoff docs.*

## The star
**Roberto's clinical judgment, delivered to every athlete with the precision of the engine and the care of a great practice — nothing invented, nothing lost, nothing hidden.**

Every defect this codebase has ever shipped is a violation of one of those three clauses: values *invented* (262g protein printed for a 170g prescription), values *lost* (waterLoading built in the engine, dropped at serialization), state *hidden* (schema errors dressed as "Piano non trovato", query failures dressed as empty data, a dead login with no message).

## What this is — and is not
This IS a practice operating system for one Italian sports nutritionist and his athletes: intake → snapshot → plan → delivery → check-in → adjustment → invoice, with the calculation engine as its crown jewel.
This is NOT (anti-goals — each one falsifiable):
- **Not a multi-tenant SaaS** (this arc). We will not spend a line of code on partner-generalization until the single practice runs flawlessly. (A competing strategy would generalize now; we refuse.)
- **Not an engagement app.** No streaks, badges, or notification pressure that reward *logging* over *outcome*. Adherence support only — a mechanic that would survive an A/B test but shame a clinician gets deleted. (A competing strategy would gamify; we refuse.)
- **Not an AI nutritionist.** No model — including us — ever authors or alters a clinical value. We compute Roberto's spec, expose divergence, and route value decisions to him (EF process). (A competing strategy would "improve" the formulas; we refuse.)
- **Not a demo.** No mock data on production paths, no emoji standing in for design, no claimed-but-unverified feature. If it isn't proven, it isn't described as working.

## The three loyalties (in precedence order)
1. **The athlete's health truth.** Numbers shown to a client are correct, reconciled, and honestly scaled — or visibly absent. Never silently wrong.
2. **Roberto's practice.** His feedback lists are the definition of done; his spec is the engine's law; his voice governs the product's Italian. Nothing he asked for is dropped silently — every item is visibly built, scheduled, or returned to him for a ruling.
3. **Our craft.** AAA doctrine, design-critique gates, 10/10 ambition — real, but never at the expense of 1 or 2. Polish on top of a broken journey is a violation, not an achievement.

## Clinical covenant
- **The engine measures; Roberto prescribes**: the calculation surfaces the numbers — expenditure, deviation, convergence — but the clinical *decision* stays his. Model B is the sharpest form: the engine measures each day's expenditure; Roberto designates the day-type and its target (a refeed may sit *above* what the day burned), and the surplus resolves to carbs by construction. The engine never picks the day-type to make the week tidy.
- **The freeze extends to the seam**: engine values AND every serialize/decode/render consumer round-trip them unchanged, proven by value-diff oracles.
- **Reconciliation is an invariant**: what was prescribed ≈ what the plan delivers, gated at generation time, at Roberto's ruled tolerance — EF4, now answered: kcal within ±5%, every single macronutrient within ±10% (a 160 g protein target flags outside ±16 g). No macro drifts unbounded to let a day pass.
- **Provenance or absence**: every band, threshold, target, and interpretation traces to an engine output or a Roberto input. The clinical rules are his encoded numbers, not engineering conveniences — the fibre floor (10 g per 1000 kcal), the vegetable minimum (100 g a meal), the combat-sport sodium cap — each traces to a dated Roberto ruling and a test. Engineering never picks a clinical number to make a chart look right.
- **Disclosure over polish**: assumptions (method, estimates, overrides) stay visible to the coach, as the review page already does well.

## Engineering covenant
- **Three states are never conflated**: error ≠ empty ≠ loading. A failure is announced, an absence is proven, a wait is shown. Silent death is the house's cardinal sin — we shipped it three ways in one codebase and will not again.
- **Evidence tiers on every claim**: (tested) / (claimed) / (theoretical). "Green suite" is a claim about what the suite exercises, nothing more; the suite must exercise what production does (RLS, migrations, authenticated renders, real writes).
- **Schema truth is governed**: one migration path, one applied-ledger, rehearsed rollback. A column that exists in code but not in migrations — or in one environment but not another — is a sev-1, not a quirk.
- **Every quantum carries its oracle before it merges**, and external actions (deploy, email, publish, prod config) are operator-executed, always.

## Working covenant (how we build — us, the operator, and every model in the loop)
- **Dual-engine, verify-before-relay**: independent lanes, same rubric, every relayed finding line-verified. Fabrication is detectable and worse than absence.
- **Panels before ratification**: named-concern lenses review the plan; dissent is preserved, never averaged. A CONCERN is a gift; fold it or refute it, in writing.
- **No silent scope changes**: cuts are dispositioned in tables the client can read. "We forgot" and "we hid" are indistinguishable from outside.
- **Everything traceable**: quantum → register ID → evidence anchor → source (audit or Roberto). A work item that traces to nothing is nobody's need.

## What "done" means (the bar for this arc)
1. Roberto runs a full practice week — intake to invoice, plan to check-in — with zero interventions from us. (tested, live)
2. Every register S1/S2 closed with its oracle green; the reconciliation gate blocks bad plans with a coach-readable reason.
3. Design-critique full-mode PASS on populated fixtures; both personas' journeys captured before/after; the operator renders the 10/10 verdict — we don't self-award it.
4. Production runs HEAD, provably (release manifest: commit + migrations + env + smoke evidence), with a rehearsed rollback.

## Inversion test (this document forbids real strategies)
A reasonable competitor would: generalize to multi-tenant now · gamify adherence for retention · let the AI tune formulas from outcome data · ship the redesign before the correctness tranche because it demos better. This northstar forbids all four. That is how you know it says something.
