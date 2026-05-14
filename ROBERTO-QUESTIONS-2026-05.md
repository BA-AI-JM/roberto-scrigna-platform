# Questions for Roberto — refined after reading the v4.4 spec

**Date:** 2026-05-14 (revised)
**Context:** Thank you for the `Nutrition_Planning_System_Unified_Specification_v4_4.docx`. It answered most of the engine and meal-plan questions — see `SPEC-ANSWERS-2026-05.md` for the full mapping. The list below is what the spec **doesn't** answer (and that I can't reasonably default to). The biggest blocker is still **§1 (food rounding)**.

A handful of items below are **either-or** confirmations where the spec says one thing and the current engine does another. Tell me which you actually want and I'll align both.

---

## 1. Food quantity rounding (still the biggest blocker)

The spec defines tolerances, scale-factor bounds, ingredient minimums (50 g protein, 150 g veg/main, 21 g oil max, 40 g cheese max) and macro-scaling priorities — but it does **not** specify how individual gram amounts should round in the final plan. That's the "macro-planner" rounding logic you referred to. Please pick one set of rules.

### 1.a — Default rounding tier
Pick a row (or describe your own):

| Option | Solids ≥ 20 g | Small solids < 20 g | Liquids | Notes |
|---|---|---|---|---|
| A (proposed default) | nearest **5 g** | nearest **1 g** | nearest **10 ml** | clean, readable |
| B (tighter) | nearest **5 g** | nearest **0.5 g** | nearest **5 ml** | for athletes who weigh precisely |
| C (looser) | nearest **10 g** | nearest **1 g** | nearest **10 ml** | mass-market friendly |

### 1.b — Foods that snap to **whole units**
Please give the per-unit gram weights. If you don't know exactly, your best guess is fine.

| Food | Unit | Grams per unit |
|---|---|---|
| Uovo intero (medio) | 1 uovo | **? g** (proposed 50) |
| Albume | 1 albume | **? g** (proposed 30) |
| Fetta biscottata | 1 fetta | **? g** (proposed 10) |
| Fetta di pane integrale | 1 fetta | **? g** (proposed 30) |
| Vasetto yogurt Greco | 1 vasetto | **? g** (proposed 125 or 170 — confirm) |
| Mela media | 1 mela | **? g** (proposed 150) |
| Banana media | 1 banana | **? g** (proposed 120) |
| Cucchiaio olio EVO | 1 cucchiaio | **? g** (proposed 10) |
| Cucchiaino zucchero/miele | 1 cucchiaino | **? g** (proposed 5) |
| Misurino proteine in polvere | 1 scoop | **? g** (proposed 30) |
| Wasa / cracker integrali | 1 fetta | **? g** (proposed 10) |
| Pacchetto cottage cheese | 1 confezione | **? g** (proposed 200) |
| Mozzarella confezionata | 1 confezione | **? g** (proposed 125) |
| Other unit-foods we should snap | — | — |

### 1.c — Snap tolerance
When the calculated portion is *close* to a whole unit, how aggressively should we snap?
- **A (strict):** snap only if within ±10 % of a unit boundary.
- **B (proposed default):** ±15 %.
- **C (loose):** ±25 % — clients see "1 mela" even when the math wanted 110 or 190 g.

### 1.d — Where the leftover macros land
After rounding, the day total drifts by 1–3 %. Pick one:
- **A (proposed default):** round all ingredients, then re-true the **largest carb slot** (e.g. lunch pasta) to absorb the drift.
- **B:** re-true the **largest protein slot**.
- **C:** distribute the drift evenly across all slots (no re-trueing).

### 1.e — Foods that should **never** round
e.g. integratori, oli da dosaggio preciso, alcuni alimenti specifici. Please list.

### 1.f — When does rounding kick in?
- **A (proposed default):** at plan generation (the macros stored in the DB are already rounded).
- **B:** only at PDF/portal export (internal math stays precise).
- **C:** both — store precise + display rounded.

---

## 2. Day-type presets (spec says "1–4 flexible labels"; you pick the defaults)

The spec confirms the day-type system is flexible — up to 4 custom-labeled day types per plan. Please pick which presets I should ship in the plan-config wizard as ready-made templates:

- [ ] **Media settimanale** — 1 day type (collapse the week into a single average).
- [ ] **ON / OFF** — Allenamento / Riposo. *(spec's basic preset)*
- [ ] **OFF / WEIGHTS / SPORT / DOUBLE** — the 4-day pattern from Appendix A.2 (rest / strength / endurance / double session). *(spec's worked example)*
- [ ] **Leggero / Medio / Pesante** — three intensity tiers, coach assigns each weekday. Macros differ per tier.
- [ ] **ON / OFF / REFEED** — adds 1–2 high-carb refeed days for clients in deep deficit.
- [ ] **ON / OFF / DELOAD** — adds reduced-load deload days (e.g. weekly low-volume).
- [ ] **Carb cycling** — high / med / low carb days, independent of training.
- [ ] **Custom** — coach manually labels up to 4 day types per plan.

Mark the ones you want first-class. The rest stay buildable via "Custom".

### 2.a — Multiple active plans per client
- **A:** One active plan at a time (current model). Older plans become "completed/archived".
- **B:** Multiple active plans allowed (e.g. "fase definizione" + "settimana sperimentale carb cycling"). If multiple, which one does the **portal** show the client by default — most recent, or coach-pinned?

### 2.b — Refeed / deload cadence
The spec supports refeed/deload day types but doesn't say when. Please pick:
- **A (manual):** coach assigns refeed/deload days per plan, no auto-suggestion.
- **B (auto-suggest, manual approve):** app suggests "you've been in deficit 14 days, add a refeed" — coach decides.
- **C (auto-apply):** app automatically schedules a refeed every Nth day (configurable).

### 2.c — Refeed magnitude (relative to baseline training day)
- Calories: +X % of TDEE? +X kcal flat? Same kcal but carb-shifted?
- Carbs: +X g vs training day?
- Protein: same?
- Fat: same / lower?

A concrete worked example would be ideal: client with TDEE_off 2000, TDEE_train 2300 in a 20 % deficit — what would a refeed day look like?

---

## 3. Target-date deficit + aggressiveness (spec is silent on the upfront calculator)

The spec has POST-plan calibration (after 2 weeks of weigh-ins, adjust ±5 % or ±10 %), but no UPFRONT "client wants X kg in Y weeks → here's the deficit". You asked for that in your #9. Please pick:

### 3.a — Which expression drives + caps the deficit
- **A (proposed):** **% of bodyweight per week**, primary; cap at 1.0 %/wk.
- **B:** **% of TDEE**, primary; cap at 25 %.
- **C:** **Both** — set primary in % BW/wk; soft-warn if also exceeds 25 % TDEE.
- **D:** Absolute kcal/day; cap at 600 kcal.

### 3.b — Lower kcal floor
- **A:** `floor = 1.2 × BMR`.
- **B (proposed):** `floor = lean_mass_kg × 22 kcal` (a common practical floor).
- **C:** Absolute floor (1200 F / 1500 M).
- **D:** Use spec's Energy Availability bands — block if EA would drop below 20 kcal/kg FFM.

### 3.c — When the timeline is unrealistic
Client says "X kg in Y weeks" → math says deficit > cap. What does the app do?
- **A:** Refuse to set the goal, ask for a longer timeline.
- **B (proposed):** Allow but flag "aggressivo" + auto-propose a more conservative timeline (e.g. "consigliamo 20 settimane invece di 12").
- **C:** Allow up to the cap and auto-extend the timeline silently.

### 3.d — Surplus (muscle gain) rules
For target-date *gain* (e.g. +5 kg lean in 16 weeks):
- Same expression (% BW/wk)?
- Cap (e.g. 0.5 %/wk for natural lifters, 0.25 % for advanced)?
- Surplus distribution across day types — same as deficit, just inverted?

---

## 4. Macro multiplier discrepancies (engine vs spec — pick which you want)

Two places where what the engine outputs today doesn't match the spec's defaults. The fidelity tests (`marco-bellini`, `niccolo`, `raphael`) are pegged to the engine's current numbers, so before I change anything I want your call.

### 4.a — Fat on training days
- **Spec default:** fat = **1.0 g/kg BW**, *constant* across day types, with a small **+3–5 g** bump on training days. → training day fat ≈ 73–75 g for a 70 kg client.
- **Engine today:** training day fat = **0.9 × BW** (= 63 g for 70 kg); rest day fat = 1.0 × BW (70 g). So the engine has *less* fat on training days than rest. Opposite of spec.
- **Which is right?** Spec? Or your clinical practice (engine)?

### 4.b — Protein on rest days
- **Spec default:** protein = **2.5 g/kg FFM** constant across day types (small +5–10 g bump on training).
- **Engine today:** training 2.5 × FFM, **rest 2.2 × FFM** (lower).
- **Which is right?** Constant 2.5 (spec) or training-elevated 2.5 / rest-reduced 2.2 (engine)?

### 4.c — Salt formula
- **Spec:** `salt_g = 1.5 × water_liters`. For 70 kg client: water = 2.625 L → salt ≈ 3.9 g rest, ≈ 4.7 g training.
- **Engine today:** **5 g rest + 1.5 g training bonus** (= 6.5 g training).
- The engine's salt is ~25 % higher than spec. Bug or intentional?

---

## 5. History / context-edit model (your #1)

When the coach updates a client (new goal, new training routine, new plicometria), what's stored?

- **A (current default — what I shipped):** a **new dated snapshot** carries the updated context. Untouched fields carry over from the previous snapshot. Historical snapshots are immutable. The engine always reads "latest."
- **B:** a single editable "scheda corrente" (mutable record) for goal + routine, separate from measurement history (immutable snapshots).
- **C:** hybrid — measurements immutable; goal + routine mutable on a single live record.

Confirm A is OK, or pick B/C.

### 5.a — When only the goal changes (no new measurements)
- **A:** Create a new snapshot anyway (preserves the change date).
- **B:** Update in place; no new snapshot.

### 5.b — Should plans link to the snapshot they were generated from?
Currently yes — `plan.snapshot_id` is set. So when you re-open an old plan you can see "this was generated when you weighed 78 kg with goal X." Confirm that's what you want.

---

## 6. Onboarding & portal (your #6 / #11)

When you click **Approva** on a plan, today the system does:
1. Sets plan status → `active`.
2. Dispatches an Inngest `plan/delivered` event (which can be wired to do anything — currently it doesn't email).
3. Shows you a banner with the portal URL.

You separately have **Condividi con Cliente** (sends a branded Resend email with the plan summary) and **Invita al portale** (provisions the auth user + emails the magic-link login).

Decisions:
- **6.a — Auto-send on approve?** Should clicking "Approva" automatically email the plan? Or keep it as a separate two-click flow (Approva, then Condividi)?
- **6.b — Auto-invite on approve?** If the client doesn't have portal access yet, should Approve also send the invite? Or always two separate buttons?
- **6.c — Welcome email content** for the portal invite. Send me a sentence or two of copy you'd like — short, warm, in your voice.
- **6.d — Self-service registration** — should a new client be able to register themselves at `/portal/login` without an invite? (Currently no — they must be invited.)

---

## 7. Branding / PDF / public-facing details

- **7.a — Logo** (PNG/SVG). Please attach.
- **7.b — Brand colors** — currently navy `#1a1a2e` + a yellow accent. Confirm or replace.
- **7.c — Italian legal text** for the PDF footer / portal footer:
    - Privacy notice (GDPR / Italian privacy)?
    - "Non sostituisce consulto medico" disclaimer?
    - Iscrizione albo / P.IVA / codice fiscale / contatto?
- **7.d — Cover page**: anything beyond `<Client Name> · <Plan Date>`? (Logo, your photo, contact, social handles?)
- **7.e — Email signature** for plan-share and invite emails. Send me a block of copy.

---

## 8. Tone / language

- **8.a — Formal "lei" or informal "tu"** with clients? (Today's mix is inconsistent.) Pick one.
- **8.b — "Mantenimento" vs "Equilibrio calorico"** — preferred term?
- **8.c — Technical vs plain** in the portal: do clients see "TEF / NEAT / EE" or do those become "termogenesi / movimento quotidiano / esercizio"?
- **8.d — Anything else terminology-wise** you want me to standardise.

---

## 9. Supplement library expansion

The spec explicitly excludes supplement prescriptions from its scope, so this is your call.

- **9.a — Master library additions.** Send me a list (name · dosage · timing · rationale · category · condition for auto-include) and I'll add them. Even 5–10 names with a one-liner each is enough.
- **9.b — Editable master library** — do you want a UI to add/edit/disable supplements globally (rather than only per-plan)?
- **9.c — Interaction warnings** — which interactions do you want flagged?
    - Iron + Calcium (timing)
    - Caffeine + Magnesium (timing)
    - Iron + tea/coffee tannins
    - Omega-3 dosage > 3 g/day → blood-thinning
    - Vit D + K2 (synergy suggestion when D is recommended)
    - Others?

---

## 10. Live OCR — which workout apps

Screenshot upload is wired end-to-end (coach side + portal). The OCR stub still returns `[]`. To wire the real Claude Vision call I need:

- **10.a — Which workout apps do your clients screenshot?** Strong / Hevy / Jefit / Apple Fitness / Garmin Connect / Polar Flow / Suunto / Whoop / Apple Watch summary screen / TrainHeroic / Excel sheets? Send me 2–3 sample screenshots per app and I'll tune the OCR prompt.
- **10.b — What should we extract?** Per-exercise: name, sets × reps × load, RPE, rest? Session-level: total time, HR avg/max, HR-zone minutes, kcal?
- **10.c — HR-zone minutes → SCP automatic** — when a screenshot has per-zone HR minutes and the modality is SCP-eligible, should we auto-feed SCP and use its EE? *(My default: yes when present.)*
- **10.d — Confidence threshold** — when OCR confidence < X, flag for manual review rather than auto-save.
- **10.e — Italian-language apps** — most of your clients' apps are in Italian or English?

---

## 11. Monitoring & check-ins

- **11.a — Check-in frequency by goal type** (today 7 days for everything):
    - Fat loss: every 7 days?
    - Muscle gain: 14 days?
    - Performance: 21 days?
    - Maintenance: 28 days?
- **11.b — Check-in form fields** — what do you actually want to ask the client? (Weight, energy 1–10, sleep 1–10, hunger 1–10, adherence %, stress 1–10, training adherence %, notes…)
- **11.c — Weight-flag alert thresholds** — at what Δ should the app alert you? (e.g. >+1 kg vs last week → flag; or > 1 % bodyweight Δ in one week.)
- **11.d — Adherence calculation** — % of meals logged? % of trainings logged? % of macros within tolerance? Combined score?
- **11.e — Photo cadence** — auto-prompt for a photo every Nth check-in? Or just optional?
- **11.f — Plicometry reminder** — auto-prompt every N weeks since last 7-site? (Spec is silent.)

---

## 12. Coach workflow (open-ended — any color helps)

Not strictly necessary but very useful for the plan-config wizard design:

- **12.a — Typical Monday morning**: which clients do you triage, in what order, using what signals? Where does the app help you, where does it slow you down?
- **12.b — Plan-generation decision order**: which steps do you make first → last? (Goal → routine → calories → macros → meals → integratori → guida → invio? Or different order?)
- **12.c — Single most common manual override** you do on a generated plan?
- **12.d — Most common reason** to re-generate a plan for an existing client (Δ weight, change of goal, change of routine, request from client)?
- **12.e — Distinct client types** — atleti agonisti vs amatoriali vs pazienti clinici — do you treat them very differently? Should the app know about these?
- **12.f — External systems** you'd want to integrate — CRM, calendar, billing, fatturazione elettronica, payment, accounting?

---

## How to answer

- **Best**: one doc / email reply with answers under each numbered section.
- **Good**: voice notes (I'll transcribe + structure).
- **OK**: piecewise replies — just tell us which section you're answering.

For §1 (rounding) and §2 (presets), even partial answers unblock real work. The rest can wait.

If anything is unclear, please push back — better one extra round than a wrong guess.
