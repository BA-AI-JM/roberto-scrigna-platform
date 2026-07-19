# 02 · DELIGHT REGISTER — merged, verified — 2026-07-19
Sources: `lanes/UX-AUDIT-CODEX.md` (code-derived, 216 lines) + Fable visual lane (5 desktop screens + populated journey pack) + live journey drive (real plan generated through the UI).
**Codex lane verification: 5/5 load-bearing spot-checks REAL** (dead CTA verified by route absence; brand counts within 2%; 36×36 controls verbatim; `window.location.reload` verbatim; label ratio confirmed 80/26). The two lanes converged 1:1 where they overlap — Codex predicted the portal scroll-dump from `active-plan-view.tsx`; the rendered mobile capture measures 5,840px.

## Verdict — why it reads 4/10 (both lanes, one voice)
The intelligence outruns the presentation. A genuinely deep engine (live weekly-expenditure preview, nutrient-timing windows, unit-snapped grams, disclosed clinical assumptions) is delivered through: (1) an **unadopted identity** — a teal token system EXISTS in `globals.css:34` with an "ONE identity, two expressions" manifesto, adopted by ~30 class uses against 1,862 raw hex literals, while PDFs run navy/gold and emails navy/gray; (2) **un-choreographed core loops** — 7-page intake → 7-section config stack (4 different selection paradigms; CTA 6,000px deep) → 6-tab review, with the generation "magic moment" rendered as a disabled button label; (3) **systemically unsafe async states** — runtime-proven twice this session: missing env kills login silently, and a schema error surfaced to the coach as "Piano non trovato" for the plan they just generated; portal queries render errors as empty data; (4) **emoji standing in for iconography** (📊 ✅ 📅 ⚠️) and dead-end empty states with no CTAs — including one CTA to a route that doesn't exist; (5) **data without interpretation** — auto-scaled charts, no targets/bands/milestones, "Giorni seguiti: 0" with an empty placeholder strip.

## Macro journeys (Codex scores, ratified/annotated by visual+runtime evidence)
| # | Journey | /10 | Ratification |
|---|---|---|---|
| 1 | Coach first-run | 3 | **Dead CTA runtime-verified**: `/clients/new` absent from routes (dashboard/page.tsx:542) |
| 2 | Morning triage | 5 | Sweep: KPI cards flat-weight, alerts zone emoji-checked |
| 3 | Intake→generate→review→share | 3 | Journey drive: wizard cards invisible until client selected; Genera enabled even when estimate fails (screenshot); generate→review handoff crashed on schema drift (G31); review page itself is the app's best surface once loaded |
| 4 | Client detail | 5 | (code lane) |
| 5 | Invoice cycle | 5 | Review action-row shows 4 clashing button styles — same disease family |
| 6 | Client login→first impression | 6 | Portal auth flow genuinely works (proven 3× by harness) |
| 7 | Weekly check-in | 6 | 36×36 controls verbatim; **G22: a pending check-in crashes the portal dashboard (runtime)** |
| 8 | Plan consumption | 5 | Mobile capture: 5,840px single scroll, all days×meals×ingredients, no "today"; but real Italian meals + unit-snapping ("≈ 1 uovo (60 g)") + timing card are excellent raw material |
| 9 | Progress arc | 4 | "Giorni seguiti: 0" + empty placeholder bar; charts auto-scale per series (honest-scale issue) |
| 10 | Firma ceremony | 7 | Strongest state machine in the app (code lane) — needs ceremony, not correctness |

## Micro register (merged, by leverage — every item carries a Fix in the lane reports)
1. **M1 Identity: adoption, not invention.** Tokens exist (`--brand #1d9e75` ramp, AA-verified pairs, globals.css:34-40) + an unmerged `feat/design-tokens-polish` branch exists. The 4→10 identity work starts from a live seed. Three artifact systems (app teal / PDF navy-gold / email navy-gray) must collapse into one.
2. **M3 States: two runtime-proven silent deaths** (env→login, 42703→"Piano non trovato" via `error||!plan` conflation at plan.ts:1119) + portal error-as-empty pattern (6 queries, only data/isLoading consumed) + dead-end empty states + dead CTA. One async-view contract fixes the class.
3. **M2 Hierarchy: the config-stack.** 7 equal-weight cards, 4 selection paradigms (native selects / chips / dark day-toggles / mode cards), live EE table styled as spreadsheet, CTA below 6,000px. Codex's 4-stage progressive rebuild is the blueprint.
4. **M4 Motion: nothing.** No motion lib, generation wait = disabled button text. The single highest-leverage signature moment (generation reveal) is unbuilt.
5. **M6 Mobile: sound frame, unenforced ergonomics.** Bottom nav + safe-area exist; 36px check-in targets, 40px bell, no min-44 rule; 5,840px plan scroll.
6. **M7 Charts: honest-scale + interpretation.** TrendChart competent (a11y role, tooltips) but per-series auto-scale exaggerates; zero targets/bands/annotations.
7. **M9 A11y: strong global guards (focus-visible override, reduced-motion), weak local semantics.** 80 labels/26 htmlFor; review tabs are text buttons without `role="tab"` (my Playwright `getByRole("tab")` found 0 — runtime).
8. **M5 Copy: Italian, ungoverned.** coach/nutrizionista drift, Dashboard/Task/Home anglicisms, warm↔administrative tone swings. Hardcoded inline (no i18n lib) — lexicon fixes are code edits.
9. **M8 Artifacts: structured but separate family.** Plan PDF (navy/gold, RS-circle mark), invoice, engagement letter, 7 emails — one artifact kit needed. (PDF visual capture deferred: endpoint auth-gated + first local render >30s — P4 verification item.)
10. **M10 Perceived speed: request/response feel.** No optimistic updates anywhere, one `window.location.reload()` (review/page.tsx:1202), un-debounced preview refetches.

## Signature-moment candidates (ratified)
1. Generation → reveal (phase-named wait → exception-led plan summary) — highest leverage.
2. Client "Oggi" view (today's meals default, plan as companion not document).
3. Check-in receipt (effort reflected, what-Roberto-sees, response expectation).
4. Progress interpretation (targets, honest milestones, coach annotation).
5. Firma completion (keep rigor, add ceremony + permanent signed-copy home).

## What 10/10 requires (endorsed, amended)
Codex's six-point program stands (one identity · one core workspace · one async-state contract · mobile client model · interpreted data · release proof). Amendments from this lane: (a) the identity phase begins by ADOPTING the existing teal system + adjudicating `feat/design-tokens-polish` and the two other design branches at P3 — don't invent a second new identity; (b) "release proof" must include an authenticated-portal render test with a pending check-in row (closes G22+G27 together) and a populated plan fixture (this audit's generated plan demonstrates the path); (c) every fix stays inside the domain-logic freeze.

## Named evidence gaps (not silent)
PDF artifact render · intake pages 2–7 (validation-gated; drive with real data in P4 loop) · per-tab review a11y once roles exist · real-device iPhone Safari pass · email template renders (code-judged only).
