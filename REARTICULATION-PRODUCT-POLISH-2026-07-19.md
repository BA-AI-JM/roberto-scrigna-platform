# REARTICULATION — Product-Readiness, Delight Elevation & Marketing Site
**Repo:** `~/roberto-scrigna-platform` @ `9dc43bc` (canonical — verified strictly ahead of stale twin `~/projects/roberto-scrigna` @ `e366248`)
**Date:** 2026-07-19 · **Status:** BRIEF — awaiting operator approval before P0 dispatch
**SCL routing:** this document = `/meta` · execution arc = `/audit` (P0–P3) → `/build` (P4–P6)

---

## 0 · Mission (raw ask → verifiable form)

Raw: *"App is largely finished; now product readiness, polish, UI/UX upgrades (4/10 → 10/10), then a stunning marketing website with a deep plan — possibly a scroll-world version."*

Converted into three workstreams, each with a falsifiable exit condition:

| WS | Objective | Exit condition (evidence-tiered) |
|---|---|---|
| **A — Product-ready** | Close the gap between HEAD and deployable product | Doctrine: no dimension <2, mean ≥2.5 (tested); zero open S1/S2 findings; full suite green with counts cited; deploy runbook dry-run PASS |
| **B — Experience 4→10** | Elevate both personas' surfaces from neutral/ugly to signature | design-critique full-mode gate PASS, zero unfixed deductions above minor; 100% interface-state coverage; WCAG AA; 390px portal first-class; operator sign-off = the 10/10 judge |
| **C — Website** | Stunning marketing site + deep plan, scroll-world variant evaluated | `03-WEBSITE-PLAN.md` approved; built site passes design-critique gate; scroll-world go/no-go made on measured cost data |

---

## 1 · Ground truth (verified this session, 2026-07-19)

| Fact | Evidence | Tier |
|---|---|---|
| Canonical copy = `~/roberto-scrigna-platform`, HEAD `9dc43bc` 2026-07-07, tree clean | `git log`/`status`; `merge-base --is-ancestor` proves old copy is ancestor | (tested) |
| Stale twin at `~/projects/roberto-scrigna` @ `e366248` (2026-05-05) | same ancestor check | (tested) |
| GitNexus indexed at `063cef4` (2026-07-02) → **stale vs HEAD** — re-analyze at P0 | `list_repos` | (tested) |
| Stack: Next.js 16 (⚠ repo AGENTS.md: "NOT the Next.js you know" — read `node_modules/next/dist/docs/` before any code), TS strict, Supabase, tRPC, Inngest, Puppeteer PDF, Resend, Bun | package.json, AGENTS.md | (tested) |
| Surface: 38 pages; coach `(dashboard)` (clients/plans/invoices/monitoring/settings) + client `/portal` (dashboard, diary, feedback, **firma**, plan, progress, training, checkin[token]) — portal is Italian-facing | route walk | (tested) |
| 106 test files on disk; 320 Vitest + 38 Playwright cases | find count (tested); case counts from 111-day-old memory | (claimed) |
| Client feedback corpus exists: `HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md`, `ROBERTO-QUESTIONS-2026-05.md`, `SPEC-ANSWERS-2026-05.md`, `CORRECTIONS-TRIAGE.md`, `CLOSEOUT-PLAN-2026-05.md` | ls | (tested) |
| Partner entity in invoice domain (per-partner numbering, PR #77) — tertiary billing persona | git log, router grep | (tested) |
| scroll-world pipeline live at `~/Desktop/scroll-world-local/` — 5B/HD two-tier, ~20 min/scene final, $0 local; skill authoring (Phase-4) still OPEN | memory `scroll_world_local` | (claimed) |

---

## 2 · Guardrail conformance — verdict: PASS

Scope check against Fable 5 guardrails and house boundaries; the following framing is binding on all phases:

1. **Domain-logic freeze.** BMR/TDEE/macro engine values, tolerance rules, and SCP stages are Roberto's clinical spec (`SPEC-ANSWERS-2026-05.md`, fidelity fixtures). We restructure presentation, reliability, and code quality — we never re-author nutritional guidance. Engine-adjacent findings are flagged to operator, not auto-fixed.
2. **No clinical copy generation.** content-realism passes confine to UX copy (labels, states, emails); clinical text stays practitioner-authored.
3. **Data protection.** Seeded fixtures only; no production Supabase reads; screenshots from seed data. GDPR Art. 9 (health data, EU market) handled as engineering controls in WS-A.
4. **Honest engagement.** "More effective engagement" = adherence support (check-in completion, plan comprehension, progress visibility). No dark patterns, fake urgency, or retention traps.
5. **Operator gates.** Deploy, DNS, email sends, publishing = explicit confirmation. Secrets referenced by env-var name only.

Nothing in this brief requires dual-use capability; it is quality work on an authorized client codebase (`agentarmy72-del`).

---

## 3 · Phase architecture

**Sequence and gates, no calendar. Each phase emits artifacts to `docs/polish/`.**

### P0 — BASELINE (context acquisition)
- Pin canonical copy; propose stale-twin quarantine (rename, not delete — deletion is an operator ruling).
- GitNexus re-analyze to HEAD (`gitnexus-cli`); graph then serves impact analysis through P4 (**answers ask (b): already indexed, stale → refresh; yes, useful — impact maps + route maps de-risk the build phase**).
- Boot app with seed data; run full suite → replace (claimed) counts with (tested) baseline.
- Playwright screenshot sweep: all 38 pages × 2 viewports (390/1440) × reachable states → `docs/polish/baseline-sweep/`.
- Ingest client feedback corpus — **"product-ready" is Roberto-defined**, not generic: the five 2026-05 docs are the definition-of-done source.
- **Gate:** app runs, suite baseline cited, sweep captured.

### P1 — DUAL CODE AUDIT (WS-A evidence)
- **Fable lane:** `codebase-doctrine` full 14-dimension audit, scored 0–3, line-cited.
- **Codex lane:** `cxd` dispatch per `codex-delegation` — same rubric, same severity scale (S1 ship-blocker / S2 must-fix / S3 polish / S4 nice), independent context, **no sight of Fable's report**.
- **Merge protocol:** every Codex finding line-level verified via `delegation-verify` before entry (house norm — 4/5-fabricated-audit precedent); Fable findings self-cited and spot-audited; dedupe on (file, dimension, symptom); disagreements preserved side-by-side, flagged ⚡, never averaged.
- **Output:** `01-CODE-GAP-REGISTER.md` — severity × effort × doctrine dimension.
- **Gate:** zero unverified findings in the register.

### P2 — DUAL EXPERIENCE AUDIT (WS-B evidence)
- Persona × journey matrix (see §5). Macro = journey-level delight; micro = interaction-level.
- **Fable lane:** `design-critique` (screenshot-driven, weighted anti-vibecode rubric, dual-assessed, line-cited deductions with mandatory Fix) + journey walkthroughs per persona.
- **Codex lane:** same screenshot pack + repo access; independent UX report, same macro/micro schema.
- Beyond-the-app surfaces in scope: **plan PDF, invoice PDF, Resend email templates** — client-facing artifacts, classic forgotten delight surfaces.
- **Output:** `02-DELIGHT-REGISTER.md` per persona, macro/micro, verified same as P1.
- **Gate:** every deduction cites a screenshot or file:line.

### P3 — CONVERGENCE (plan of record)
- Merge registers → `PLAN-OF-RECORD.md`: quanta with per-quantum oracle gates (frame-seal-forge framing if quanta count warrants delegation), sequenced by severity × leverage.
- **Council session** on tradeoffs (scope cuts, direction commitment); **review-panel** (N≥3 named lenses: product, clinical-safety, design, eng-risk) on the plan itself; dissent preserved.
- Direction inputs: `design-direction` FRAME + optional `brandkit` exploration boards — the 4/10 verdict is partly *absence of brand*; a committed identity feeds both app and website.
- **Gate:** operator approves plan + rules on queued decisions.

### P4 — BUILD
- **WS-B:** `design-build-loop` FULL mode — FRAME (`design-direction`) → `design-tokens` → `component-sourcing` → `layout-composition` → `interface-states` → `motion-craft` → `content-realism` (Italian voice) → HARDEN. Taste module selected at FRAME, not assumed.
- **WS-A:** per-register hardening — `failure-design` (Inngest retries, PDF/webhook idempotency), `observability-pass`, `security-pass` (Supabase RLS, GDPR controls), `schema-reconciliation` on standby.
- Mechanical quanta delegated (Codex / Sonnet subagents) under oracle gates; judgment quanta stay with Fable. Pre-read rule: Next.js 16 docs before any code.
- **Gate:** per-quantum oracle PASS; `review-panel` on material diffs.

### P5 — SEAL (sanity + council check)
- `verify` — end-to-end behavior on the real app, both personas, not just tests.
- Full suite + `contract-testing` if API surface moved.
- `design-critique` re-score → gate PASS; before/after evidence pack (screenshots, optional `app-walkthrough-video` GIF script).
- `review-panel` final adversarial pass; council convenes only if tradeoffs remain open.
- **Gate:** SEALED or SEALED-WITH-FIXES with a file-level defect list. Operator renders the 10/10 verdict.

### P6 — WEBSITE (separate FRAME, deep plan first)
- **Concept A — editorial premium:** `imagegen-frontend-web` boards → `image-to-code` or `design-build-loop` with taste module (`high-end-visual-design` / `gpt-taste`) per direction ruling.
- **Concept B — scroll-world cinematic:** `~/Desktop/scroll-world-local/` pipeline (Architecture-A stills + engine crossfade; 5B/480 drafts ~3 min/scene, 5B/HD finals ~20 min/scene, $0). This build can double as the OPEN Phase-4 certification run for the `scroll-world-local` skill.
- Functionality: lead capture, service presentation, portal-login entry, intake CTA bridging into the platform (bridge depth = operator ruling).
- **Output:** `03-WEBSITE-PLAN.md` (IA, direction, concept boards, functional spec, measured scroll-world cost table) → build after ruling → design-critique gate → deploy operator-gated.

---

## 4 · Dual-engine protocol (binding, P1/P2)

| Rule | Rationale |
|---|---|
| Same brief, same rubric, same severity scale to both engines | mechanical merge |
| Independent contexts; neither reads the other pre-seal | anchor-contamination prevention |
| Codex via `cxd` only (raw `codex exec` is hook-blocked) | non-hanging dispatch |
| Every relayed finding line-level verified (`delegation-verify`) | house norm; fabrication precedent |
| Contradictions preserved side-by-side, ⚡-flagged | audit doctrine — never silently resolved |
| All claims carry (tested)/(claimed)/(theoretical) | evidence discipline |

---

## 5 · Persona × delight matrix (P2 skeleton)

| Persona | Macro journeys (delight = journey-level) | Micro surfaces (delight = interaction-level) |
|---|---|---|
| **Roberto (coach)** | morning triage (monitoring), client onboarding, plan generation → delivery moment, invoice cycle, progress review | dashboard KPIs/charts, skinfolds & week-session editors, generation feedback, empty/loading/error states, keyboard flow |
| **Client (athlete)** | intake (7-page form — friction hotspot #1), plan-receipt moment (PDF + portal reveal), weekly check-in loop, diary, progress arc, firma | mobile ergonomics @390px, motion, photo capture, notification voice (Italian), streak/milestone moments (honest), form states |
| **Partner (tertiary)** | invoice receipt | invoice PDF quality, numbering correctness |

---

## 6 · Enrichment register (areas the raw ask didn't name — in scope for consideration)

1. **Italian voice & locale** — portal language consistency, kg/kcal/cm units, date formats; content-realism in Italian.
2. **Mobile-first portal** — athletes live on phones; PWA/home-screen candidacy; camera-capture flows already present (`client-photo-gallery`, `screenshot-uploader`).
3. **Artifact surfaces** — plan PDF, invoice PDF, email templates: redesign with the same direction tokens.
4. **GDPR Art. 9** — health data controls: RLS audit, export/delete capability, consent records (firma exists — leverage it).
5. **First-run & empty states** — new-client zero-data experience is the first impression.
6. **Performance budget** — portal LCP on mobile networks; chart render cost.
7. **Brand system** — `brandkit` exploration; absence-of-brand is a root cause of "neutral/ugly."
8. **Adherence mechanics (honest)** — check-in streaks, milestone moments, coach-note touchpoints.
9. **Ops readiness** — Inngest failure visibility, Resend bounce handling, PDF failure path (observability + failure-design).
10. **Real-device pass** — iPhone Safari for the portal, not Playwright-chromium only.
11. **Stale-twin hygiene** — quarantine ruling for `~/projects/roberto-scrigna`.
12. **Roberto's recorded feedback** — the 2026-05 corpus is the client's own definition of product-ready; P1/P2 must reconcile against it.

---

## 7 · Risk register & anti-concerns

| Risk | Mitigation |
|---|---|
| Codex fabrication in audits | delegation-verify on 100% of relayed findings (house norm) |
| Next.js 16 API drift vs training data | mandatory docs pre-read (repo AGENTS.md order) |
| Redesign breaks green suite | per-quantum gates; suite runs inside P4 loop, not only at P5 |
| Direction churn ("10/10" is subjective) | direction committed once at P3 with operator ruling; boards before pixels; design-critique numeric gate carries the score |
| Scope creep from enrichment register | every item enters PLAN-OF-RECORD with severity×effort or is explicitly parked |
| Anti-concern (named): **polishing the UI while an S1 code gap ships** — WS-A gates precede WS-B seal in the plan of record | sequencing rule in P3 |

**Second-order:** a committed brand direction + token system at P3 is reusable capital — it feeds the app (P4), the website (P6), PDFs and emails (§6.3) from one source; and the P6 scroll-world track closes the open skill-certification loop at zero marginal model cost.

---

## 8 · Decision queue (operator)

| # | Decision | Default recommendation |
|---|---|---|
| D1 | Approve this brief / amend | — |
| D2 | Stale twin: quarantine (rename) or delete | quarantine at P0; deletion only on explicit ruling |
| D3 | Direction inputs: any references/taste from Roberto? | none assumed — FRAME + brandkit boards presented at P3 |
| D4 | Website↔app bridge depth | bridge-lite (login link + intake CTA) now; full bridge later |
| D5 | Council composition for P3 | product / clinical-safety / design / eng-risk lenses |

---

## 9 · Artifact map

| Artifact | Path |
|---|---|
| This brief | `REARTICULATION-PRODUCT-POLISH-2026-07-19.md` (repo root, per precedent) |
| Baseline sweep + suite counts | `docs/polish/baseline-sweep/`, `docs/polish/00-BASELINE.md` |
| Code gap register (merged, verified) | `docs/polish/01-CODE-GAP-REGISTER.md` |
| Delight register (merged, verified) | `docs/polish/02-DELIGHT-REGISTER.md` |
| Plan of record | `docs/polish/PLAN-OF-RECORD.md` |
| Website deep plan | `docs/polish/03-WEBSITE-PLAN.md` |
| Fable/Codex raw lane reports | `docs/polish/lanes/` (preserved unmerged for audit) |
