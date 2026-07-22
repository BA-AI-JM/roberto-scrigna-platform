# DEMO SCRIPT — Scrigna product demo (Waves A–D shipped)

State: 2026-07-22. Branch `polish/audit-arc-2026-07`. Brand is now **blue** — Roberto's logo re-tune,
teal→blue ramp + hexagon mark (`8456825`, `src/app/globals.css:22,50`). Shipped since the Wave-A cut:
the clinical model (B1–B5), client & practice management (C1–C5: cooperation types, anamnesis, payments),
and round-2 correctness (D1–D4: fibre display, daily macro recap, salt = 1 g/L, Harris-Benedict fallback,
check-in reply loop). The Model-B day-type wizard is **engine-done, UI pending** — so demo the current
four-mode periodization wizard, not the OFF/1/2/3 model. Everything below verified live on this machine.

## Pre-flight (5 minutes before)

| Check | Command / URL | Expect |
|---|---|---|
| Dev server | http://localhost:3001/login | 200, split-panel login |
| Supabase local | `supabase status` in repo | all services healthy |
| Mailpit (portal emails) | http://127.0.0.1:54324 | inbox UI loads |
| Demo data | Niccolò has ACTIVE plan + 2 check-ins | see "Demo state" below |

**PORT WARNING: 3000 is Langfuse — never demo there. The app is 3001.**

## Credentials

| Surface | Login |
|---|---|
| Coach | roberto@test.com / testpass123 |
| Portal (Niccolò) | niccolo@test.com → magic link lands in Mailpit (127.0.0.1:54324) |

**Portal tip:** authenticate the portal in a second tab BEFORE presenting (session persists). Otherwise: enter email → open Mailpit → click "Accedi" link — same browser, ~15 seconds.

## Theme switch (no UI toggle yet)

Paste in the DevTools console, or save as a bookmarklet:

```js
document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark')
```

Dual-theme is live on: login, dashboard frame/sidebar, dashboard, wizard, plan review. Portal: present in LIGHT only (dark pass is the next lane).

## Demo state (already seeded)

- Niccolò Ambrosi — ACTIVE plan since 2026-07-06 ("14 giorni sul piano" on portal), generated end-to-end through the new wizard.
- Two completed check-ins: 13 lug 92.0 kg (aderenza 88%) → 19 lug 91.7 kg (85%); latest snapshot 91.5 kg → weight trend descends 92.0 → 91.7 → 91.5.
- Portal account linked and receiving magic links locally.

## The walk (8–10 min)

1. **Login** — split identity panel, Fraunces quote, «Area professionista». Log in as Roberto.
2. **Oggi (dashboard)** — calm register: date eyebrow, Buongiorno, three stats, athletes with status chips, la nota (brand-blue rule) composed from live numbers.
3. **Nuovo piano (wizard)** — the star. 4 steps with the rail: Cliente (pick Niccolò — snapshot data loads; if a client has no skinfolds, the engine falls back to **Harris-Benedict** and can take a **manual body-fat %**, D4) → Obiettivo (leave Mantenimento) → Struttura settimana (the four periodization modes) → Rivedi e genera. Point at the ⌘↵ hint. **Genera** runs the real engine (~10 s) and lands on the new plan's review.
4. **Review (new draft)** — verdict strip: the ENGINE's own tolerance verdicts (**±5% kcal / ±10% macro**, EF4) with exact macro deltas — "nothing invented, nothing hidden" in one glance. **Two tabs now**: Panoramica (targets + macro cards — B5 merged the old "Macro" tab in) → Pasti (per-day meals, now with **fibre per meal/day** and a **daily macro recap line**, D1/D3). Scarica PDF works live. **Do NOT click Approva** — approving would archive Niccolò's current active plan (one-active-per-athlete invariant; say it out loud, it's a feature).
5. **Review (active plan)** — open Piani → the existing active plan: post-approval state (Approvato chip, Condividi con cliente).
6. **Portal (light, pre-authed tab)** — Ciao Niccolò, weight band with variazione, active plan card, last check-in (91.7 / 88% / 90%), Registra peso (submit one live if you like), Statistiche Rapide + descending weight chart, Storico piani v1. If a check-in carries a coach reply, the portal shows a **"Note del nutrizionista"** block (D2/R3).
7. **Dark mode (optional close)** — flip the toggle on the coach dashboard and the review page. Same content, first-class dark.

## Also shipped — Wave B/C/D surfaces (show on request)

These are live and demoable beyond the core walk; pull them up if Roberto asks about a specific area.

| Surface | Where | What to show |
|---|---|---|
| Cooperation types (C1) | Atleti → client detail | «Abbonamento» / «Consulenza singola» / «Fight camp» + free collaborations, date-bounded with live expiry alerts. |
| Anamnesis editable (C2) | Client detail → Anamnesi | Post-intake edits incl. new surgeries / injuries fields. |
| Payments & invoicing (C4/C5) | Fatturazione + client detail → «Nuova fattura» | Client-prefilled invoice, payment methods, mark-paid, practice-identity courtesy footer on the PDF. |
| Check-in reply loop (D2) | Monitoraggio / client detail | Coach writes a note on a check-in → client notified → shows in portal; full-detail review renders every 0–10 scale + free text. |
| Hydration + fibre (D3) | Plan review / PDF | Salt = 1 g per L water (not the old flat 6.5 g); fibre 10–20 g/1000 kcal inverse to energy. |

**Not yet built (say so if asked):** Model-B OFF/1/2/3 day-type wizard (engine done, UI pending — `MODEL-B-HANDOFF.md`); financial dashboard (branded mock only); fight-week module (designed, not built); the new "Qualità dell'allenamento 0–10" check-in question; i18n; data import.

## If something breaks

- Fallback stills (current, captured today): `docs/polish/concepts/smoke-*.png` (dash/wiz/review/portal, light+dark) and the approved concept boards `concept-board-v2.html`.
- Dev server restart: `PORT=3001 bun run dev` from repo root.
- A stray demo draft plan is harmless — leave it; archive after the presentation.

## Honest answers if asked

- Portal dark theme + icon cleanup: next lane (T3.5), pattern proven on coach side.
- Secondary pages (Atleti list, Fatturazione, Monitoraggio, Impostazioni): still the old light style; token migration is mechanical (hex→token sweep, same as review page).
- Theme toggle UI: pending; tokens make it a one-liner.
- Production deploy: A2 pre-flight + APPLY-PROD.sql were executed against prod (ledger 21/21, `92c6ae5`);
  this demo runs the full A–D branch on the local stack. Bringing prod to branch parity — incl. the C1/C5
  migrations 023/024 (R2) — is the remaining gated deploy step.
