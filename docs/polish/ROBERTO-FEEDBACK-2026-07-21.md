# Roberto's testing feedback — 2026-07-21 (reconstructed from transcript 20260721_1)

Source: voice transcript, poor auto-transcription; reconstructed against the app's real
surfaces. Items marked ⚠ carry a transcription ambiguity Roberto should confirm.
2026-07-21 update: item 1 data supplied by Liam; items 15–17 added (Fatturazione findings + financial dashboard); item 3 folded into 17.
Status: AWAITING ROBERTO'S CONFIRMATION — no fixes actioned from this list yet.

| # | Type | Item |
|---|---|---|
| 1 | FIX | Lettera di incarico: correct professional details — Biologo Nutrizionista n° AA_077690 (iscrizione all'ordine dei biologi) · P.IVA 10175580967 · C.F. SCRRRT90S03F205Z · Via Luigi Guanella 44, 20128 Milano. Assumption: these render everywhere the practice identity appears (lettera, invoice header, PDF footer) |
| 2 | CHANGE | Client status model → cooperation types: subscription (with start/end dates, e.g. fight camp) or single consultation (visit count); expiry reminders |
| 3 | NEW (proposal) | Separate financial section — EXPANDED INTO #17 (financial dashboard); constraint stands: not inside the client-edit page |
| 4 | CHANGE | Anamnesis editable after intake: intolerances/allergies + NEW fields — surgeries, medications (type/dosage/changes), injuries, gut & digestive health |
| 5 | BUG | Training-data edit rejects valid input as "invalid" (1 h session; manual 240 kcal) + RPE change should live-update the shown caloric expenditure |
| 6 | CHANGE | Remove wizard presets; periodization = weekly average or 2/3/4-day split by intensity (light/medium/heavy); make per-day edit buttons visible |
| 7 | FIX | Support two training sessions in one day |
| 8 | BUG ⚠ | Tolerance deltas look mathematically wrong (e.g. shown Δ vs hand-calc mismatch; ~20 kcal shown where ~6 g fat + 6 g carbs ≈ 50+ kcal) — audit the math |
| 9 | RULE (EF) | On training days, calorie increases must go to carbs more than fats — confirm as engine rule |
| 10 | BUG+CHANGE ⚠ | Substitutions: meal-coherent groups (no mussels/salmon at breakfast; breakfast = greek yogurt/kefir/whey class) + swap gram-equivalence math looks off (whey→kefir left macros out of tolerance) |
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

Roberto's own closing summary, verbatim intent: "the biggest part is that I need a much
clearer decision process for how the calories and carbs of my clients are distributed"
(→ items 6 + 9).
