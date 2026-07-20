# WALKTHROUGH SCRIPT — Scrigna Nutrition full-platform demo video

Phase A deliverable (skill `app-walkthrough-video`, certified scripting scope). Status:
**AWAITING OPERATOR APPROVAL — nothing has been recorded.** Every beat below is a plan for
what WILL be shown; no occurred-fact claims.

Journey source: `docs/polish/DEMO-SCRIPT.md` (approved walk), extended per operator brief
with portal Diario/Progressi and PDF download. Every route cited was verified present in
code on branch `polish/audit-arc-2026-07` (2026-07-20); live green-scouting of each beat
happens at the start of Phase B before any take.

Target: LOCAL only — `http://localhost:3001` (port 3000 is Langfuse, never touched).
Never `www.scrignanutrition.app`. One continuous take, 1280×720, captions re-injected
after every `page.goto`, human pacing 1.5–2.5 s, anti-spinner settle before captions.

Caption language: **Italian** (audience is Roberto — client-facing). English gloss in
notes where useful.

## Scene table

| # | Scene | What's shown | Caption / narration | Note |
|---|---|---|---|---|
| 1 | Title | Full-screen slide: product name + value prop | «Scrigna Nutrition — dal piano al progresso, tutto verificato.» | ~3 s slide, `pointer-events:none` |
| 2 | Coach login (light) | `/login` split identity panel, Fraunces quote, «Area professionista»; type roberto@test.com, submit | ACCESSO PROFESSIONISTA — «La nuova identità visiva accoglie il coach.» | ~12 s · route `src/app/(auth)/login/page.tsx` · pre-hydration quirk: networkidle + ~1 s + pressSequentially fallback |
| 3 | Oggi dashboard (light) | `/dashboard`: date eyebrow, Buongiorno, 3 stats, athletes with status chips, la nota (teal rule), alerts rail; smooth scroll | OGGI — «La giornata del coach in un colpo d'occhio: numeri veri, nota composta dai dati live.» | ~15 s · `src/app/(dashboard)/dashboard/page.tsx` |
| 4 | Dark-mode flip | `page.evaluate` sets `data-theme='dark'` on the dashboard; brief scroll; flip back to light | TEMA SCURO — «Stesso contenuto, prima classe anche di notte: un attributo, zero reload.» | ~12 s incl. flip back · no UI toggle yet (honest: toggle pending, tokens make it a one-liner) · rest of coach flow stays LIGHT |
| 5 | Atleti → Niccolò detail | `/clients` list briefly, then `/clients/9dacdf1b-…`: Check-in tab, storico 13 lug 92,0 kg / 88% → 19 lug 91,7 kg / 85%, weight trend | ATLETI — «Lo storico check-in di Niccolò: 92,0 → 91,7 kg, aderenza reale. Sezione in migrazione al nuovo design.» | ~18 s · `src/app/(dashboard)/clients/[id]/page.tsx` (tabs incl. Check-in, page.tsx:6) · **honest partial**: old styling, captioned as in-migration — never presented as finished new-UI. Fatturazione / Monitoraggio / Impostazioni are SKIPPED entirely (same in-migration state; this caption is the honest acknowledgement on camera) |
| 6 | Piani list | `/plans`: plan list with states | PIANI — «Ogni piano, con stato e atleta.» | ~6 s · `src/app/(dashboard)/plans/page.tsx` |
| 7 | Wizard — step 1 Cliente | `/plans/new`: 4-step rail; pick Niccolò — snapshot data loads (91,5 kg) | NUOVO PIANO · 1 CLIENTE — «I dati snapshot di Niccolò entrano nel piano da soli.» | ~15 s · `src/app/(dashboard)/plans/new/page.tsx` · **setup for the star**: this is the athlete's real data flowing in |
| 8 | Wizard — step 2 Obiettivo | Leave Mantenimento selected | 2 OBIETTIVO — «Mantenimento: l'obiettivo guida il motore.» | ~8 s |
| 9 | Wizard — step 3 Struttura | Week structure preset | 3 STRUTTURA SETTIMANA — «La settimana di Niccolò, giorno per giorno.» | ~8 s |
| 10 | Wizard — step 4 → Genera | Rivedi e genera; point at ⌘↵ hint; click **Genera**; live engine run (~10 s) | 4 GENERA — «Il motore calcola il piano in diretta — nessun contenuto preconfezionato.» | ~18 s incl. engine wait · caption holds during the run; settle before landing caption |
| 11 | ★ Review — verdict strip | Lands on `/plans/<new>/review`: **Verifica del motore** strip — engine's own ±5% tolerance verdicts with exact macro deltas | VERIFICA DEL MOTORE — «I verdetti di tolleranza del motore stesso, delta esatti: niente inventato, niente nascosto.» | ~15 s · review/page.tsx:644 · **STAR MOMENT** |
| 12 | Review — tabs sweep | Panoramica → Macro → Pasti → Integratori → Monitoraggio → Versioni | IL PIANO COMPLETO — «Corpo, macro, pasti, integratori, monitoraggio, versioni: una pagina.» | ~20 s · tabs at review/page.tsx:75–80 · per-meal tolerance chips visible in Pasti (±5 g P/F, ±10 g C, ±50 kcal, :1305) |
| 13 | Scarica PDF | Click Scarica PDF; show the real generated PDF | SCARICA PDF — «Il PDF reale, generato adesso.» | ~12 s · review/page.tsx:584 |
| 14 | Condividi con cliente | Open the share modal — **do NOT send**; close it | CONDIVIDI CON CLIENTE — «L'email di riepilogo pronta da inviare — oggi resta qui.» | ~10 s · review/page.tsx:604 · no send on camera |
| 15 | Approva (shown, not clicked) | Hover the Approva button on the new draft; do not click | APPROVA — «Un solo piano attivo per atleta: approvare archivierebbe il piano corrente. Lo lasciamo attivo.» | ~6 s · review/page.tsx:622 · one-active invariant stated as a feature; seeded active plan stays untouched |
| 16 | Section slide | Full-screen transition slide | «Il portale dell'atleta» | ~4 s · covers logout/context handover |
| 17 | Portal magic-link login | `/portal/login`: submit niccolo@test.com → cut to Mailpit inbox (127.0.0.1:54324) → open «Accedi» link in SAME context | ACCESSO SENZA PASSWORD — «Niccolò riceve un link via email: nessuna password da ricordare.» | ~25 s · PKCE, same browser context mandatory; admin-generated links cannot log in · a real, impressive flow on camera |
| 18 | Ciao Niccolò | Portal dashboard: «Ciao, Niccolò!», weight band + variazione, last check-in card | CIAO, NICCOLÒ — «Peso, variazione e ultimo check-in, appena entrato.» | ~12 s · portal dashboard/page.tsx:342 · portal is LIGHT-ONLY (dark pass pending — never captioned as available) |
| 19 | Registra peso (live) | Type **91,3** kg in the Registra peso card, click Registra, watch the value land | REGISTRA PESO — «91,3 kg registrati in diretta: il trend si aggiorna subito.» | ~15 s · log-weight-card.tsx:66/123, mounted dashboard/page.tsx:384 · 91,3 continues the descending trend · row deleted by reset script between takes · scout must confirm the chart refreshes without reload; if not, caption drops the "si aggiorna subito" claim |
| 20 | Statistiche Rapide | Scroll to Statistiche Rapide + descending weight chart | STATISTICHE RAPIDE — «Trend in discesa: 92,0 → 91,7 → 91,5 → 91,3.» | ~8 s · dashboard/page.tsx:224 |
| 21 | Portal plan view | `/portal/plan`: the ACTIVE approved plan as the athlete sees it | IL PIANO ATTIVO — «Il piano approvato dal coach, come lo vede Niccolò: 14 giorni sul piano.» | ~10 s · cross-role consequence of the coach's approval state (law 3) |
| 22 | Diario | `/portal/diary` | DIARIO — «Il diario quotidiano dell'atleta.» | ~8 s · scout decides depth; if empty for Niccolò, show the empty state honestly or cut the beat — never staged |
| 23 | Progressi | `/portal/progress`: measurements view, photo gallery section | PROGRESSI — «Misure e progressi, nel tempo.» | ~10 s · measurements-view.tsx, progress-photos-gallery.tsx · same honesty rule as Diario |
| 24 | Outro | Full-screen slide, three phrases | «Piani verificati · Portale senza password · Progressi reali» | ~4 s |

## Star moment (law 4)

**Scene 11.** The wizard's four steps (scenes 7–10) visibly feed Niccolò's real snapshot
data into a live ~10 s engine run, and the landing frame is the engine's **own** ±5%
tolerance verdicts with exact macro deltas — the one beat where the product proves,
on camera, that nothing was invented and nothing hidden. Scenes 7–10 exist to set it up;
scene 21 shows its cross-role consequence on the athlete side.

## Runtime estimate (law: honest number)

Beat sum: **274 s ≈ 4 min 35 s** — over the skill's 2.5–4 min target. The overage is
forced by the operator's "everything on the platform" coverage (24 beats, two roles, a
live engine run and a live magic-link flow). Trim candidates if 4:00 is a hard ceiling,
in cut order: scene 22 Diario (−8 s), scene 12 tab sweep shortened to 4 tabs (−8 s),
scene 6 Piani list folded into scene 7 (−6 s) → ~4:13. Not trimmed without approval.

## State mutations this take creates (reset between takes — Phase B script)

| Mutation | Reset |
|---|---|
| New DRAFT plan from Genera (scene 10) | `DELETE FROM plan WHERE status='draft' AND client_id='9dacdf1b-…' AND created_at > <take start>` |
| Portal snapshot 91,3 kg (scene 19) | Delete the snapshot row created after take start |
| Approva is never clicked | Seeded active plan `793a9bac-…` untouched; `approve_plan_txn` recovery documented in the brief if a take ever misfires |

## Honest-partial ledger (law 5)

- Atleti list + client detail: old styling — shown briefly, captioned «in migrazione al nuovo design» (scene 5).
- Fatturazione, Monitoraggio, Impostazioni: skipped; the scene-5 caption is the on-camera acknowledgement.
- Portal dark theme: pending — portal recorded LIGHT only, never captioned as dark-capable.
- Theme toggle UI: pending — dark shown via the documented attribute flip, not a fake toggle.
