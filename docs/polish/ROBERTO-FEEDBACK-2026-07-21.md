# Roberto's testing feedback — 2026-07-21 (reconstructed from transcript 20260721_1)

Source: voice transcript, poor auto-transcription; reconstructed against the app's real
surfaces. Items marked ⚠ carry a transcription ambiguity Roberto should confirm.
2026-07-21 update: item 1 data supplied by Liam; items 15–17 added (Fatturazione findings + financial dashboard); item 3 folded into 17.
Status: AWAITING ROBERTO'S CONFIRMATION — no fixes actioned from this list yet.

| # | Type | Item |
|---|---|---|
| 1 | FIX | Lettera di incarico: correct professional details — Biologo Nutrizionista n° AA_077690 (iscrizione all'ordine dei biologi) · P.IVA 10175580967 · C.F. SCRRRT90S03F205Z · Via Don Luigi Guanella 44, 20128 Milano (CONFIRMED 2026-07-21). These render everywhere the practice identity appears (lettera, invoice header, PDF footer) |
| 2 | CHANGE | Client status model → cooperation types (RULED 2026-07-21): «Abbonamento» · «Consulenza singola» (visit count) · «Fight camp» as its OWN category — subscription-like but date-bounded, with an optional calendar view to pick/type the engagement start→end dates. Free/no-cost collaborations must be supported. Expiry reminders |
| 3 | NEW (proposal) | Separate financial section — EXPANDED INTO #17 (financial dashboard); constraint stands: not inside the client-edit page |
| 4 | CHANGE | Anamnesis editable after intake: intolerances/allergies + NEW fields — surgeries, medications (type/dosage/changes), injuries, gut & digestive health |
| 5 | BUG | Training-data edit rejects valid input as "invalid" (1 h session; manual 240 kcal) + RPE change should live-update the shown caloric expenditure |
| 6 | CHANGE | Remove wizard presets; periodization = weekly average or 2/3/4-day split by intensity (light/medium/heavy); make per-day edit buttons visible |
| 7 | FIX | Support two training sessions in one day |
| 8 | BUG | Tolerance-delta math — GOLDEN FIXTURES from Roberto (2026-07-21): (1) shown Δ −86 kcal vs hand 4/4/9 math −81.5 (P −1.3g · C +18.5g · F −16.7g) ~5% off; (2) shown Δ +15 kcal vs hand math +31.7 (P +0.2g · C +3.9g · F +1.7g) >2× off. Hypothesis: (1) = label-kcal vs Atwater (legit, label the UI); (2) = real seam bug |
| 9 | RULE (EF) | On training days, calorie increases must go to carbs more than fats — confirm as engine rule |
| 10 | BUG+CHANGE | Substitutions: meal-coherent classes + equivalence tiers now SPECIFIED by Roberto's own model — docs/reference/MODEL-1-ENG.md (from Model 1 - ENG.pdf). Wire the EXISTING substitution engine to honor slot-class membership (Colazione/Spuntino/Pranzo-Cena classes) and tiered equivalence; app food DB stays source of truth for macro values |
| 11 | CHANGE | Merge "Panoramica" and "Macro" review tabs into one |
| 12 | DECISION | Check-in frequency (7/21 days, per client): decide where it lives — Monitoraggio tab vs elsewhere |
| 13 | NEW | Check-in questionnaire: add 0–10 "training quality" + 0–10 "digestion/gut health" questions (free-text stays) |
| 14 | BUG | Plan-delivery email → login loop: link → login → new email → still can't reach the plan; deep-link after auth |
| 15 | BUG | New-invoice page: "Seleziona cliente" dropdown never populates — wire the client list into it |
| 16 | NEW | Second entry point for invoicing: from the client detail page (Atleti → dettagli), action "Nuova fattura" pre-filled with that client |
| 17 | NEW | Financial dashboard on the Fatturazione page — per-client lifetime spend, per-visit average, ARR (per client + practice-wide), YTD/12-month collected, receivables aging, revenue mix by cooperation type, pricing-intelligence view for bespoke engagements (fight camps €/week, consultations €/visit). Full spec + branded mock: docs/polish/concepts/finance-dashboard-mock.html |

Cross-references to work already shipped 2026-07-20: item 5's error MESSAGE display was
humanized (Italian) at 6 sites, but Roberto's training-edit rejection itself is unverified
and likely a distinct validation defect; item 14 relates to the portal auth flow — local
config was fixed, prod redirect config was fixed in A1, but the described loop (deep-link
loss after login) is an open app-level bug.

Financial-data completeness (Liam, 2026-07-21): all work is invoiced through the app;
extras are added manually as a fallback — so invoice-derived dashboard metrics are complete.
Address RESOLVED 2026-07-21: "Via Don Luigi Guanella 44, 20128 Milano" (Don stays).

Roberto's own closing summary, verbatim intent: "the biggest part is that I need a much
clearer decision process for how the calories and carbs of my clients are distributed"
(→ items 6 + 9).
