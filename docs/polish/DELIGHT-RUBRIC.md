# SHARED EXPERIENCE RUBRIC — P2 Dual Delight Audit
**Repo:** `~/roberto-scrigna-platform` · **Date:** 2026-07-19
**Evidence base:** `docs/polish/baseline-sweep/{desktop,mobile}/*.png` + `manifest.json` + live app on `http://localhost:3001` (seed data: 1 partner, 2 clients, 1 invoice, 0 plans — plan surfaces sweep as empty states; that is itself evidence, score them AS empty states).
**Used by BOTH lanes (Fable design-critique, Codex UX). Independent contexts; do not read the other lane's report.**

## Mission
Operator's verdict on the current UI: "neutral/ugly — 4/10; aim for 10." Diagnose WHY it reads neutral, per persona, at macro (journey) and micro (interaction) level. Findings must be buildable: every deduction carries a Fix.

## Personas
| P | Who | Context of use |
|---|---|---|
| P-COACH | Roberto — nutritionist, expert user, daily driver | Desktop-first, information-dense workflows: morning triage, plan generation wizard, client management, invoicing |
| P-CLIENT | Athlete/patient (Italian) | Mobile-first (390px), low-friction moments: check-in, diary, viewing plan, progress, firma |
| P-PARTNER | Billing recipient (tertiary) | Invoice PDF only |

## Macro journeys (score each 0–10 for delight potential vs current state)
1. COACH: first-run/empty dashboard → onboarding legibility
2. COACH: morning triage (monitoring → check-ins → flags)
3. COACH: intake (7-page wizard) → generation (Obiettivo/Struttura/Macro cards) → review → share. THE core loop.
4. COACH: client detail deep-dive (tabs, charts, history)
5. COACH: invoice cycle
6. CLIENT: magic-link login → portal dashboard first impression
7. CLIENT: weekly check-in loop (token URL, no auth)
8. CLIENT: plan consumption (readability of meals/grams — the product's actual deliverable)
9. CLIENT: progress arc (charts, milestones — reason to return)
10. CLIENT: firma (signature) ceremony — trust moment

## Micro dimensions (score 0–10 each, per surface where applicable)
| Dim | What to judge |
|---|---|
| M1 Identity | Brand presence beyond "RS" monogram: is this app OF Roberto or a template? Color story, typography voice |
| M2 Hierarchy | Scan order, density calibration for expert (coach) vs guided (client) use |
| M3 States | Loading/empty/error/success coverage and craft (silent-death login bug already found — assume more) |
| M4 Motion | Transitions, feedback on action, generation-wait experience (plan gen = the app's "magic moment" — what does the user see while it computes?) |
| M5 Copy voice | Italian consistency, tone (clinical vs warm), microcopy at decision points |
| M6 Mobile ergonomics | 390px portal: tap targets, thumb reach, form comfort |
| M7 Data viz | TrendChart/ChartControls quality; number presentation (kcal, macros, weight) |
| M8 Artifact surfaces | Plan PDF, invoice PDF, email templates — client-visible artifacts |
| M9 A11y | Focus visibility, contrast, keyboard flow, reduced-motion |
| M10 Perceived speed | Skeletons, optimistic updates, debounced previews (previewWeek 300ms — felt latency) |

## Output schema (markdown)
```
# EXPERIENCE AUDIT — <lane> — 2026-07-19
## Verdict: why it reads 4/10 (one paragraph, root causes ranked)
## Macro journey scores (table: journey | score /10 | top blocker | Fix)
## Micro findings (ordered by leverage)
### [P-COACH|M2|screenshot-file.png or file:line] Title
Evidence: what is on the screenshot/code
Deduction: why it costs delight
Fix: concrete, buildable
## Signature-moment candidates (3–5 places a "wow" would compound: e.g. plan reveal, check-in streak, progress milestone)
## What 10/10 requires (the gap, honestly: direction? tokens? rebuild scope?)
```

## Rules
- Screenshot citations by filename; code citations file:line. No floating taste claims — every deduction anchored.
- Honest-engagement clause: adherence mechanics only (streaks/milestones as support, not manipulation).
- Clinical values are frozen; presentation of them is fully in scope.
- The existing unmerged design branches (`design/client-home-proposal`, `feat/design-tokens-polish`, `feat/portal-home-polish`) exist — do NOT read them; judge HEAD as shipped. (P3 will reconcile.)
