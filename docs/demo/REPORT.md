# Walkthrough video — production report

Recorded 2026-07-20 against LOCAL (http://localhost:3001, branch `polish/audit-arc-2026-07`).
Production (www.scrignanutrition.app) was never touched; no emails sent (Condividi modal
opened and closed via Annulla; Mailpit is the local sink for the portal magic link).

## Deliverables

| File | What |
|---|---|
| `docs/demo/walkthrough.mp4` | 171.24 s (2:51), H.264 1280×720 yuv420p, faststart, 3.3 MB |
| `docs/demo/raw/79d4e3e8….webm` | raw single-take recording (7.8 MB) |
| `docs/demo/star-highlight.gif` | ~20 s star GIF: wizard→Genera→verdict strip + portal payoff (1.5 MB) |
| `docs/demo/raw/beats.json` | beat name → elapsed-seconds map for the take |
| `docs/demo/WALKTHROUGH-SCRIPT.md` | approved Phase-A script (24 beats) |
| `docs/demo/scout.mjs` | headless beat-by-beat scout (screenshots to `scout-shots/`) |
| `docs/demo/record.mjs` | the recorder (one continuous take, captions, pacing) |
| `docs/demo/seed-demo.sql` | additive idempotent seed: 3 diary entries + 2 backdated snapshots |
| `docs/demo/reset-take.sh` | idempotent between-takes reset (proven ×2 identical runs) |

## The take (take 2 of 2)

25 beats, no failures. Star moment on camera at ~73–78 s: live `Genera` run (~6 s engine)
lands on the review page whose verdict strip shows the engine's own ±5 % tolerance verdicts
with exact macro deltas (Δ −67 kcal · P +1.3 g · C +18 g · F −15.4 g on Allenamento).
Take 1 failed at the Approva beat (share-modal backdrop intercepted the hover — see bug 4)
and was deleted after the state reset.

Side effects verified at source of truth during the take, then reset:
- draft plan `41c7f445` created by Genera at 14:29:29, status stayed `draft` (Approva never clicked) — deleted by reset
- snapshot 91.30 kg created by Registra peso at 14:30:33 — deleted by reset
- seeded active plan `793a9bac` still `active` throughout

## Bugs found during production (file:line)

1. **PDF generation broken locally — FIXED.** `src/pdf/chromium-launcher.ts:91` passed
   `chromium.args` (@sparticuz Lambda flags, `--single-process` et al.) to the local
   desktop Chrome; the renderer wedges and every `page.setContent` times out
   (`generator.ts:36`, "Navigation timeout"). A/B-tested: same Chrome, same HTML —
   sparticuz args FAIL, clean args OK (7,772-byte PDF in 2.0 s). Fix: Lambda args only
   when `process.env.VERCEL`; Vercel path unchanged. Affects all three PDF surfaces
   (plan PDF, invoice PDF, engagement letter — all call `launchPdfBrowser`).
2. **Local Chrome version constraint — documented.** puppeteer-core 24.42.0 speaks CDP for
   Chrome ≤147; system Chrome 150 fails with "Requesting main frame too early!". The dev
   server must run with
   `CHROMIUM_PATH="$HOME/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`.
3. **Check-in scale mismatch — FIXED.** `src/components/client/feedback-card.tsx:132–133`
   rendered energy/sleep as `n/5` while the API validates 1–10 (`checkin.ts:32`) and the
   client-detail page correctly renders `/10` (`clients/[id]/page.tsx:1045`). Was showing
   "Energia 8/5" on camera. Fixed to `/10`.
4. **Share modal has no Escape handler — NOT fixed (noted).** The Condividi modal closes
   only via backdrop click or Annulla (`review/page.tsx:688,742`); Escape does nothing and
   the backdrop intercepts all pointer events. Cost take 1. Recorder now clicks Annulla.
5. **Progressi chart ignores check-in weights — worked around, worth a look.**
   `/portal/progress` plots `client_snapshot` rows only, while the portal dashboard chart
   merges check-in + snapshot points (`portal/dashboard/page.tsx:238`). With no snapshot
   history the Progressi trend collapses to one point. Seeded two backdated snapshots
   (92.0 @ 13 lug, 91.7 @ 19 lug — matching the completed check-ins) so both charts agree.

## Display-layer mechanics disclosed (no business logic shimmed)

- **PDF beat:** "Scarica PDF" is `window.open('/api/pdf/<id>')` returning
  `Content-Disposition: attachment` — it can never display in-tab, and a popup tab lands
  outside the recorded page. On camera: the button is hovered, the real endpoint is fetched
  live with the take's session, page 1 is rendered via `sips` and displayed. The PDF shown
  IS the endpoint's output from that moment (`raw/take-plan.pdf` kept).
- **Magic-link beat:** the email shown open in Mailpit is the real message; the link the
  recorder navigates to is extracted from that same message via Mailpit's API (clicking
  inside Mailpit's preview iframe is flaky on camera; the destination is identical).
- Captions/slides are injected overlays (`pointer-events:none`), re-inserted after every
  full navigation.

## How to re-record

```bash
# dev server MUST have the Chrome-147 CHROMIUM_PATH (bug 2):
PORT=3001 CHROMIUM_PATH=".../mac_arm-147.0.7727.57/.../Google Chrome for Testing" bun run dev
./docs/demo/reset-take.sh          # idempotent — restores exact pre-take state
node docs/demo/scout.mjs           # optional: re-verify all beats green first
./docs/demo/reset-take.sh          # scout creates a draft + snapshot; reset again
node docs/demo/record.mjs          # the take → docs/demo/raw/*.webm + beats.json
ffmpeg -i docs/demo/raw/<take>.webm -c:v libx264 -preset medium -crf 20 \
  -pix_fmt yuv420p -movflags +faststart -s 1280x720 docs/demo/walkthrough.mp4
./docs/demo/reset-take.sh          # clean up the take's draft + snapshot
```

## Post-production addendum (2026-07-20, later the same day)

- Bugs 3, 4, 5 are now closed: 4 (Escape) and 5 (Progressi merge) landed in `e2d4e83`
  (parallel lane); the launcher self-locate fallback for 2/3 landed after this report.
- **Bug 2's diagnosis corrected.** Re-tested: Chrome 150 + clean launch args renders PDFs
  fine — puppeteer-core 24.42 drives it without issue. The "Requesting main frame too
  early!" failure was ALSO caused by the @sparticuz Lambda args (bug 1), not a version
  mismatch. The Chrome-147 `CHROMIUM_PATH` pin was never necessary once bug 1 was fixed.
  Also found: `.env.local:21` has set `CHROMIUM_PATH` to the system Chrome all along
  (Next loads it in-process, invisible to `ps`), which is why every dev server run used
  it. That value works post-fix and needs no change. The launcher now additionally
  self-locates the puppeteer-cache build when `CHROMIUM_PATH` is absent (proven: deleted
  the env var, `launchPdfBrowser()` resolved `~/.cache/puppeteer/.../147.0.7727.57` and
  rendered a PDF), so a bare machine no longer fails.

## Suggested follow-ups

- Voiceover pass over the same take (beats.json gives the timing map).
- Escape-to-close on the share modal (bug 4) and the Progressi data source (bug 5).
- Portal dark theme lane (T3.5) unlocks a dark-mode portal segment.
