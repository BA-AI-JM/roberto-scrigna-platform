# Prompt — full-platform walkthrough video (paste into a fresh Fable terminal)

Use the skill `app-walkthrough-video` (installed at `~/.claude/skills/app-walkthrough-video/SKILL.md`). Follow its laws exactly: real flows and real data only, a caption per beat, setup before payoff, one named star moment, honest partials, no occurred-fact claims. Work in two gated phases: **Phase A — produce the script and STOP for my approval. Phase B — on my "go", execute the recording pipeline** (the skill's Phases 1–8) and deliver the MP4.

## Target and environment (verified 2026-07-20 — do not rediscover, do not deviate)

- App: Roberto Scrigna nutrition platform, repo `~/roberto-scrigna-platform`, branch `polish/audit-arc-2026-07`.
- **Record against LOCAL only.** Dev server: `PORT=3001 bun run dev` (check first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/login`). **Port 3000 is Langfuse — never touch it.** Local Supabase must be up (`supabase status`; DB via `docker exec supabase_db_roberto-scrigna psql -U postgres -d postgres`).
- Never record against www.scrignanutrition.app — real client data, real email sends.
- Coach login: `roberto@test.com` / `testpass123`.
- Portal login (Niccolò): magic-link only, PKCE — submit `niccolo@test.com` on `/portal/login`, fetch the link from Mailpit (`http://127.0.0.1:54324/api/v1/messages`), open it **in the same browser context**. Admin-generated links cannot log in.
- Seeded demo state (already in place): client Niccolò Ambrosi `9dacdf1b-a9b2-4881-8049-f241ebea53ec`, ACTIVE plan `793a9bac-0e75-47c0-909f-3c4df552a4fc` (start 2026-07-06), two completed check-ins (13 lug 92.0 kg / 88%, 19 lug 91.7 kg / 85%), latest snapshot 91.5 kg. Partner id `80c07279-c925-4123-9d34-4348fcea7dee`. Second client: Raphael Federico (no snapshot — usable for the "empty history" contrast if wanted).
- Dark mode: no UI toggle yet — `document.documentElement.setAttribute('data-theme','dark')` via page.evaluate. Dual-theme surfaces: login, dashboard, sidebar/frame, plan wizard, plan review. **Portal is light-only (dark pass pending) — record the portal in light and never caption dark as available there.**
- Honest partials (law 5): Atleti list, Fatturazione, Monitoraggio, Impostazioni still carry the old styling — either skip them with a noted caption or show briefly captioned as "in migrazione al nuovo design". Do not present them as finished new-UI.
- The approved walk order lives at `docs/polish/DEMO-SCRIPT.md` — use it as the journey source; the video may extend it (portal Diario/Progressi, PDF download) but every beat must be scouted green first.

## Star-moment guidance (verify on screen before locking)

Strongest candidate: **wizard step 4 → Genera → live engine run lands on the review page → verdict strip showing the engine's own ±5% tolerance verdicts with exact macro deltas** — the "nothing invented, nothing hidden" beat. Payoff beat that sets it up: the seeded athlete's data flowing through steps 1–3.

## Recording constraints (from the skill's pipeline — enforce all)

- One continuous take, 1280x720, captions re-injected after every `page.goto`, `pointer-events:none` on every overlay, human pacing (1.5–2.5 s between actions), anti-spinner settle before any caption.
- **State mutation discipline:** each take's wizard run creates a new DRAFT plan — delete it between takes (`DELETE FROM plan WHERE status='draft' AND client_id='9dacdf1b-...' AND created_at > <take start>` via psql, service context). If a take clicks Approva on the new draft, the seeded active plan gets archived by the one-active invariant — reset with `approve_plan_txn('793a9bac-0e75-47c0-909f-3c4df552a4fc', '80c07279-c925-4123-9d34-4348fcea7dee', '{}'::jsonb, '2026-07-06')` and re-archive the take's plan. Portal "Registra peso" entries created on camera must be deleted between takes (diary_entry table). Make the reset one idempotent script.
- Chromium for Playwright is already installed; `CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` works if needed. Check `ffmpeg` exists before Phase 6 (`brew install ffmpeg` if missing).
- Playwright login quirk (known): fields filled pre-hydration leave the button disabled — `waitUntil:"networkidle"` + ~1 s + `pressSequentially` fallback.

## Deliverables (skill Phase 8 format)

`docs/demo/walkthrough.mp4` (H.264 720p faststart) + raw webm + star-moment highlight GIF + `docs/demo/scout.mjs` + idempotent seed/reset script + report (duration, beats, bugs found with file:line, how to re-record). Commit everything under `docs/demo/` on the current branch. Do not push.

## Coverage ("everything on the platform", honestly)

Coach: login (identity panel, light) → Oggi dashboard (stats, athletes, la nota, alerts rail) → dark-mode flip on dashboard → Atleti → Niccolò detail (check-in history) → Piani → wizard 4 steps → Genera (live) → review: verdict strip, tabs (Panoramica/Macro/Pasti/Integratori/Monitoraggio/Versioni), Scarica PDF (show the real PDF), Condividi con cliente (modal — do not send), Approva shown but NOT clicked on camera unless the reset script is proven. Portal (light): magic-link login via Mailpit on camera (it's a real, impressive flow) → Ciao Niccolò → weight band + descending trend → Registra peso live → plan view → Diario → Progressi. Outro.

Runtime target per the skill: 2.5–4 min; state the honest number from the beat sum.
