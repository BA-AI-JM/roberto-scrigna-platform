# DEMO SCRIPT — Scrigna new UI (Wave A)

State: 2026-07-20. Branch `polish/audit-arc-2026-07`. Everything below verified live on this machine.

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
2. **Oggi (dashboard)** — calm register: date eyebrow, Buongiorno, three stats, athletes with status chips, la nota (teal rule) composed from live numbers.
3. **Nuovo piano (wizard)** — the star. 4 steps with the rail: Cliente (pick Niccolò — snapshot data loads) → Obiettivo (leave Mantenimento) → Struttura settimana (preset) → Rivedi e genera. Point at the ⌘↵ hint. **Genera** runs the real engine (~10 s) and lands on the new plan's review.
4. **Review (new draft)** — verdict strip: the ENGINE's own ±5% tolerance verdicts with exact macro deltas — "nothing invented, nothing hidden" in one glance. Tabs (Panoramica → Macro → Pasti). Scarica PDF works live. **Do NOT click Approva** — approving would archive Niccolò's current active plan (one-active-per-athlete invariant; say it out loud, it's a feature).
5. **Review (active plan)** — open Piani → the existing active plan: post-approval state (Approvato chip, Condividi con cliente).
6. **Portal (light, pre-authed tab)** — Ciao Niccolò, weight band with variazione, active plan card, last check-in (91.7 / 88% / 90%), Registra peso (submit one live if you like), Statistiche Rapide + descending weight chart, Storico piani v1.
7. **Dark mode (optional close)** — flip the toggle on the coach dashboard and the review page. Same content, first-class dark.

## If something breaks

- Fallback stills (current, captured today): `docs/polish/concepts/smoke-*.png` (dash/wiz/review/portal, light+dark) and the approved concept boards `concept-board-v2.html`.
- Dev server restart: `PORT=3001 bun run dev` from repo root.
- A stray demo draft plan is harmless — leave it; archive after the presentation.

## Honest answers if asked

- Portal dark theme + icon cleanup: next lane (T3.5), pattern proven on coach side.
- Secondary pages (Atleti list, Fatturazione, Monitoraggio, Impostazioni): still the old light style; token migration is mechanical (hex→token sweep, same as review page).
- Theme toggle UI: pending; tokens make it a one-liner.
- Production deploy: branch is local; deploy is a separate gated step (A2).
