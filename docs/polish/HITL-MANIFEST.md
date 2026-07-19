# HITL MANIFEST — everything that needs a human; everything else runs autonomous
**Date:** 2026-07-19 · Companion to `PLAN-OF-RECORD.md`. Three blocks: A = operator-executed externals, B = one-word operator rulings, C = the Roberto pack (ready to forward).

## Block A — Operator-executed external actions (prod/external surfaces; I co-pilot, you drive)
| # | Action | When | What exactly |
|---|---|---|---|
| A1 | **T0.0 config hotfix** (resurrects Roberto's dead plan-email TODAY, no deploy) | anytime — 10 min | Vercel: set `NEXT_PUBLIC_APP_URL` to the real production URL. Supabase Auth → URL Configuration: add `<prod>/portal/auth/callback` (and `/auth/callback`) to redirect allowlist. Practice rule to Roberto: send *Invita al portale* before/with plan share (invite provisions the login). I'll walk it step-by-step live |
| A2 | **T0.1 push + migrations** | after A1, after checklist rehearsal | You say "push" → I run `git push origin main` (Vercel auto-deploys). Prod DB: apply migrations 006–016 by checklist against `information_schema` (backup first). Needs your prod Supabase access — SQL editor with me dictating, or a granted session with you watching |
| A3 | Post-deploy runtime checklist | after A2 | PDF render, magic link, Inngest endpoint registered, check-in link, real iPhone — dashboards are yours (Vercel/Supabase/Inngest/Resend); I script the probes |
| A4 | GDPR counsel | parallel, non-blocking | Arrange Italian/EU counsel for consent/privacy text; T1.12 mechanism builds meanwhile |
| A5 | T4 verdicts + any T3 deploy | end of arc | The 10/10 is yours; every deploy is yours |

## Block B — One-word rulings (unblock autonomy)
| # | Ruling | Recommendation |
|---|---|---|
| B1 | T0.2 direction: ratify athlete-first proposal as DIRECTION seed? (images sent) | **Ratify** |
| B2 | **Durable authorization: may I push FEATURE BRANCHES to `fork` (agentarmy72-del) to stage PRs autonomously?** `origin/main` stays operator-only regardless. Without this, all build work stays local-only | **Grant** — it's how PRs #64–78 flowed |
| B3 | T1.11 rate limiter: build now or post-deploy? | **Defer post-deploy** (eng-risk concurrence) |
| B4 | May I keep the local supabase/dev instance running between sessions for the build arc? | **Yes** (it's Docker-local) |

## Block C — The Roberto pack (forward via operator; EN + IT, one question each)
*Context for you: EF1–EF5 are frozen clinical decisions we will not make for him; Q6–Q8 are evidence/preference requests. Numbers below are from today's tested probes.*

**EF1 — Goal label vs direction.** EN: If you select "maintenance" (or "performance") but set a LOWER target weight, the app currently follows the weight and applies a deficit while keeping your selected label. Should the label win (block the deficit), the weight win (relabel), or should the app ask you each time?
IT: *Se selezioni "mantenimento" ma imposti un peso target più basso, l'app oggi segue il peso e applica un deficit mantenendo l'etichetta scelta. Deve vincere l'etichetta (bloccando il deficit), il peso (cambiando etichetta), o l'app deve chiederti conferma ogni volta?*

**EF2 — Goal-rate safety defaults (currently OUR provisional numbers).** EN: Confirm or replace: max fat-loss rate 1.0% bodyweight/week; max muscle-gain 0.5%/week; calorie floor = max(22 kcal × lean mass kg, 1200); "extreme" warning when deficit > 25% of TDEE.
IT: *Confermi o sostituisci: perdita grasso max 1,0% peso/settimana; aumento max 0,5%/settimana; soglia calorica minima = max(22 kcal × kg massa magra, 1200); avviso "estremo" oltre il 25% del TDEE?*

**EF3 — Periodization ratios.** EN: The light/medium/intense/double-session macro ratios are marked provisional in the code, awaiting your calibration. Confirm current values or send yours.
IT: *I rapporti macro per giornate light/medium/intense/doppia sono provvisori in codice, in attesa della tua calibrazione. Confermi i valori attuali o mandi i tuoi?*

**EF4 — Per-macro tolerance (NEW evidence today).** EN: Our solver holds protein within ±3% in all 24 test scenarios, but FAT can land up to 20% under target (carbs compensate; calories stay right) and the plan is still flagged "within tolerance" because the check is calorie-level. What per-macro deviation is clinically acceptable per day — e.g. protein ±5g, fat ±10g, carbs ±20g? (5-meal plans reconcile best; 3–4 meals drift most.)
IT: *Il risolutore tiene le proteine entro ±3% in tutti i 24 scenari testati, ma i GRASSI possono risultare fino al 20% sotto target (i carboidrati compensano; le kcal tornano) e il piano risulta comunque "entro tolleranza" perché il controllo è a livello calorico. Quale deviazione per macro è clinicamente accettabile al giorno — es. proteine ±5g, grassi ±10g, carboidrati ±20g? (I piani a 5 pasti riconciliano meglio; 3–4 pasti deviano di più.)*

**EF5 — Training-expenditure calibration (your Item 17).** EN: Three confirmed causes of overestimation: (1) we use GROSS METs (resting metabolism double-counted, ~70–90 kcal/h); (2) RPE changes output only ~11% between RPE 6 and 9; (3) strength work is pinned at MET 3.0 regardless of RPE (your spec). Send your preferred correction: net METs? wider RPE effect? different strength rule?
IT: *Tre cause confermate della sovrastima: (1) usiamo MET LORDI (metabolismo a riposo contato due volte, ~70–90 kcal/h); (2) l'RPE cambia il risultato solo ~11% tra RPE 6 e 9; (3) i lavori di forza sono fissi a MET 3,0 indipendentemente dall'RPE (tua specifica). Come correggiamo: MET netti? RPE più incisivo? regola diversa per la forza?*

**Q6 — The 262g protein case (your Item 21).** EN: Which client/plan showed 262g delivered vs your 160–170g prescription? A screenshot or the client name + date is enough. Today's solver holds protein within ±3% in every scenario we ran, so we suspect either an older version of the app or a day-type labeling mix-up — your example settles it and we fix the right thing.
IT: *Quale cliente/piano mostrava 262g invece dei 160–170g prescritti? Basta uno screenshot o nome+data. Il risolutore attuale tiene le proteine entro ±3% in ogni scenario provato, quindi sospettiamo una versione precedente dell'app o un'etichetta giorno sbagliata — il tuo esempio ci dice cosa correggere.*

**Q7 — Your 22-point list: disposition sign-off.** EN: Attached table shows every item as built (verified), scheduled, or needing your call. Two calls needed: custom-supplement authoring — now or later? SCP heart-rate engine — stays shelved? Plus: your unit list for food rounding (1 egg = 50g, 1 apple = 150g, …).
IT: *La tabella allegata mostra ogni punto come fatto (verificato), pianificato, o in attesa di tua decisione. Due decisioni: creazione integratori personalizzati — ora o dopo? Motore SCP a frequenza cardiaca — resta in pausa? Inoltre: la tua lista unità per gli arrotondamenti (1 uovo = 50g, 1 mela = 150g, …).*

**Q8 — Brand.** EN: Do you have a logo / brand colors / visual preferences, or do we own the visual identity fully? (We're proposing a warm teal clinical direction — screenshots available.)
IT: *Hai un logo / colori / preferenze visive, o l'identità visiva la definiamo noi? (Proponiamo una direzione teal clinica — screenshot disponibili.)*

## What runs autonomous once B1+B2 land
T1.0 harness → T1 quanta in the panel-corrected order (serialized cluster respected) → T2 spine → T3 on branches (shipping still gated on T1 seal + your A-gates) → staged PRs on fork for your review. EF-dependent pieces (EF4 bounds, EF5 numbers, Item-21 fix target) slot in whenever Roberto's answers arrive — nothing else waits on them.
