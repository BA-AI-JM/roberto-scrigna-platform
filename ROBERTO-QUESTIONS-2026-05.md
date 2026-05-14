# Questions for Roberto — to unblock Phase 1–2

**Date:** 2026-05-14
**Context:** I've shipped Phase 0 + every answer-independent piece of Phase 1–4 (see `FEEDBACK-RESOLUTION-PLAN-2026-05.md`). The questions below are what's blocking the remaining work. Please answer in as much detail as you can — the more specifics you give, the less guesswork goes into the engine and UI. Where I've proposed defaults, feel free to say "fine" / "no, do X instead" — concrete reactions are faster than open-ended design.

The most important section by far is **§1 (rounding)** — until I have these rules, every meal plan's gram amounts will keep coming out impractical.

---

## 1. Food quantity rounding (your #4, "macro planner" logic)

You said in the feedback that the rounding rules "had already been defined" in the macro planner. They are **not** in either GitHub repo, and we believe they're in the v4.4 spec doc (`Nutrition_Planning_System_Unified_Specification_v4_4.docx`) which lives in a separate `roberto-scrigna-handoff` repo we don't have access to. Two parallel questions:

### 1.a — Can you share the v4.4 spec?
- A PDF / DOCX / scan / paste of the relevant chapter is fine.
- If it's on someone else's GitHub or Drive, please share the link or have them add the repo to our account.
- Even partial: the rounding section, the macro-allocation section, the day-type definitions section.

### 1.b — If the doc is hard to dig up, please confirm or correct these defaults
Until we have the spec, I'll implement these. Tell me which are right, which are wrong, and what the actual rule should be.

| Food category | Proposed rule | Example |
|---|---|---|
| Solids ≥ 20 g (rice, pasta, oats, meat, cheese) | round to nearest **5 g** | 93 g → 95 g · 207 g → 205 g |
| Small solids < 20 g (oils, nut butters, parmesan) | round to nearest **1 g** | 11.4 g → 11 g |
| **Eggs** (whole) | snap to multiples of 50 g (≈ 1 egg = 50 g) | 78 g → 100 g (= 2 eggs) · 32 g → 50 g (= 1 egg) |
| **Egg whites** (separately) | round to nearest **5 g** | 73 g → 75 g |
| Bread / slices (pane, fette biscottate) | snap to whole-unit weights *that you give me* | (need: 1 fetta biscottata = ? g; 1 fetta di pane = ? g) |
| Yogurt / packaged servings (vasetto 125 g, 170 g) | snap to whole packets when within ±15% | 140 g of "yogurt vasetto 125 g" → 125 g |
| Liquids (milk, oil-by-volume, milk substitutes) | round to nearest **10 ml** | 187 ml → 190 ml |
| Protein powder | round to nearest **5 g** | 27 g → 25 g |
| Fruit (whole) | snap to typical units (1 mela = 150 g, 1 banana = 120 g) — list TBC | 165 g mela → 150 g (1 mela) |

**Specific questions:**
1. Which of these rules are wrong, and what's the right rule?
2. Are there foods that should *never* be rounded (e.g. integratori, oli per dosaggio preciso)?
3. After rounding, the daily macro total drifts by 1–3 %. **Do you prefer**: (a) round first then re-true the *largest* slot to absorb the drift, (b) round everything then recompute and accept the drift, (c) round only the foods within the slot that are *not* the protein anchor?
4. Should rounding be applied at **plan generation** or only at **plan export** (so internal math stays precise)? Or both?
5. **Unit-snapping list**: please send me your canonical list of "comune unità" — 1 fetta biscottata, 1 fetta di pane, 1 vasetto yogurt, 1 mela, 1 banana, 1 cucchiaio olio, 1 cucchiaino zucchero, etc. Even a quick voice-note transcribed → spreadsheet works.
6. Do these rules differ for **competition prep / weighing**-aware clients versus general clients? Some athletes weigh precisely — do they get tighter rounding (e.g. 1 g)?

---

## 2. Day-type structures and protocols (your #3)

Today the app assigns a day type by inference: any day with ≥ 1 training session = "training", others = "rest". `refeed` and `deload` exist in the engine but no UI ever picks them. You want the **professional to decide the structure**.

### 2.a — Which preset structures should I offer?
For each, say **YES** (build it) / **NO** (don't bother) / **MODIFY** (with notes):

1. **Media settimanale** — single set of macros applied every day (today's behavior collapsed into one).
2. **ON / OFF** — two day types: Allenamento (ON) and Riposo (OFF). What you have today.
3. **Leggero / Medio / Pesante** — three intensity tiers; coach assigns each weekday to one. Macros differ per tier.
4. **ON / OFF / REFEED** — adds 1–2 high-carb refeed days for clients in deep deficit.
5. **ON / OFF / DELOAD** — adds reduced-load deload weeks (auto-applied every Nth week?).
6. **Carb cycling** — high / medium / low carb days assigned independently of training. Frequency rules?
7. **Custom** — coach manually labels each weekday with a free-text day type and supplies macros.
8. **Other** — anything I'm missing?

### 2.b — How are macros differentiated between day types?
For each day type that's not "average", what changes vs the baseline? Pick a model:
- **Calorie shift only**: same macro ratio, different total kcal (e.g. training day +300 kcal).
- **Carb shift only**: protein + fat fixed, carbs vary.
- **Independent macros**: each day type has its own P / F / C in grams.
- **Rule-based**: I give a rule (e.g. "training day: +1 g/kg carbs, +200 kcal").

Concrete example I need to code: client TDEE_rest = 2000 kcal, TDEE_training = 2300 kcal, deficit goal 250 kcal/day. What should each day's macros look like?

### 2.c — Multiple active plans per client?
- Can one client have **multiple "active" plans at once** (e.g. a "fase di definizione" plus a separate "settimana di prova carb cycling")?
- Or strictly one active at a time, with older plans becoming "completato" / "archiviato"?
- If multiple: how does the portal decide which one to show the client? (Manual selection? Default to most recent?)

### 2.d — Refeed / deload triggers
- Should refeed days be **manually assigned** or **auto-recommended** (e.g. every 10–14 days in deficit)?
- Same question for deload weeks — auto-suggest after N training weeks?
- For each, what's the macro/calorie change vs the baseline training day?

### 2.e — Weekly EE table view
You asked for "a simple table showing Monday: 2 sessions, swimming + CrossFit, estimated 2900 kcal; Tuesday: rest, 2200 kcal; ...". Confirm the columns you want:
- Day of week
- Day type (Allenamento / Riposo / Refeed / Deload / …)
- Sessions of the day (modality + duration)
- TDEE for the day
- Apporto pianificato (kcal)
- Δ (deficit / surplus / mantenimento)

Should this be view-only in the review page, or fully editable in a plan-config wizard? (I assume editable — confirm.)

---

## 3. Client context history model (your #1)

We need to decide how "edit the client" interacts with measurement history. My current default is:

> Editing the client creates a **new dated snapshot** that carries the updated goal + training routine + measurements. The engine always reads "latest". Untouched fields carry over from the previous snapshot so each row is a complete picture.

Is that right, or would you prefer one of:

- **A. Single editable "scheda corrente"** — the client's current goal/routine lives in a separate editable record (you can rewrite it any time); measurements remain immutable history. Two stores, two UIs.
- **B. New-snapshot model (my default)** — every edit dates a new snapshot; nothing is ever overwritten.
- **C. Hybrid** — measurements are immutable history (B); goal + routine are mutable single records (A).

**Follow-up questions:**
1. When you "aggiorna la scheda" with no new measurements (only new goal), should it still create a snapshot? Or just update the live goal?
2. Should you be able to **see** the goal/routine that was active at the time each plan was generated? (For audit / explaining old plans to clients?)
3. How do you want the patient **photos** versioned? Tied to a snapshot (set per measurement session)? Independent gallery? Or both views?

---

## 4. Target-date deficit & aggressiveness (your #9)

You want: "current weight, target weight, time available, weekly loss needed, estimated avg deficit, aggressiveness level."

### 4.a — Aggressiveness expression
Which do you want to drive (and clamp) the deficit? Pick one — both is fine but be explicit:
- **% of bodyweight per week** (e.g. 0.5 % / 0.75 % / 1.0 % / 1.25 %).
- **% of TDEE** (e.g. 10 % / 15 % / 20 % / 25 %).
- **Absolute kcal/day deficit** (e.g. 200 / 400 / 600).
- **Combination** — set primary expression + a hard cap from the other.

### 4.b — Caps & safety rules
- Lower-bound on calories: what's your floor? (Common defaults: 1.2 × BMR; or `lean_mass_kg × 22 kcal`; or absolute 1200 kcal F / 1500 kcal M.)
- Maximum sustainable deficit per week — when do you say "the timeline is unrealistic, push the deadline"?
- Should the app **block** the coach from approving a plan that violates these rules, or just **warn**?

### 4.c — Worked example
Client: M, 35 y, 90 kg → 80 kg in 12 weeks. TDEE 2600 kcal.
- Δ weight = -10 kg → required weekly loss ≈ 0.83 kg/wk
- 1 kg fat ≈ 7700 kcal → required daily deficit ≈ 913 kcal/day
- That's 35 % of TDEE → very aggressive.

**What should the app do?**
- Tell the coach "questo deficit è oltre la soglia 0.75 %/sett — extend the target date to ~20 weeks OR accept aggressive deficit + refeeds."
- Auto-suggest a more conservative timeline (e.g. 20 weeks instead of 12)?
- Auto-set refeed cadence when deficit > X %?

### 4.d — Surplus (muscle gain) rules
For target-date surplus (e.g. "gain 5 kg lean in 16 weeks"):
- Same expression (% BW/wk)?
- Lean gain rate caps (e.g. 0.25–0.5 % BW/wk for natural lifters)?
- Surplus distribution: same across days? Bigger on training? Refeed-style?

### 4.e — Refeed / diet-break protocol
- Frequency: every 7 / 10 / 14 / 21 days, or adaptive based on deficit depth?
- Magnitude: how many kcal added on a refeed day vs baseline? Mostly carbs?
- Diet break (multi-day at maintenance) — built-in? Or out of scope?

---

## 5. Macro composition rules

Today the engine has built-in defaults; please confirm or adjust.

### 5.a — Protein
- Default target: protein in g/kg lean mass — what range?
- Defaults today: ~2.0 g/kg lean (rest) / ~2.2 g/kg (training). Confirm?
- **Per goal**: fat loss vs muscle gain vs maintenance vs performance — same range or different?
- Minimum protein floor (absolute g/day) for very lean / very heavy clients?
- Max useful intake — at what point does adding more lose value (e.g. > 2.8 g/kg)?

### 5.b — Fat
- Default fat: 0.8 g/kg bodyweight, or % of total kcal, or "remainder after P and C"?
- Minimum fat floor (essential fatty acid floor: typically 0.5 g/kg or 20 % of kcal)?
- Goal-specific differences?

### 5.c — Carbs
- Currently the remainder after P + F. Confirm.
- Carb periodization (training vs rest):
    - Training day = +X g carbs over rest? (specify rule)
    - Should pre/post-workout carb allocation matter at meal-plan level, or only as a guideline?

### 5.d — Per-meal distribution
Today the meal plan distributes daily macros across 3–6 meals via a fractional template. Examples for 4 meals: colazione 22%, pranzo 30%, spuntino 15%, cena 33%. Should:
- The distribution be **goal-aware** (e.g. higher protein at colazione for muscle gain)?
- Vary by **day type** (training day shifts carbs around the workout)?
- Or stay as a single global template?

### 5.e — Diet emphasis flags
The engine has a `dietEmphasis` parameter that affects TEF — does the **coach** ever set this, or is it always auto-derived from goal?

---

## 6. Hydration & salt

Engine returns water_ml and salt_g per day. Confirm formula:
- Currently `water_ml = bodyweight_kg × 35 ml + 500 ml on training days`. Right?
- Salt: typically 1.5–2 g/day baseline + 1–1.5 g per hour of training. Right?
- Climate / sweat-rate adjustments — do you want a "clima caldo" toggle?
- For specific sports (endurance / combat), different defaults?

---

## 7. Body composition methods (your audit's open item)

When no plicometria is provided, the engine falls back to a **BMI heuristic** — imprecise. Decisions:

1. **Default fallback** — confirm BMI heuristic, or should it instead refuse to generate a plan until plicometria is captured?
2. **Bioimpedance / DEXA input** — should I add a field to enter a measured BF% directly (overriding both skinfolds and the heuristic)? You have `bodyFatPctOverride` already; should I surface it in the intake/edit UI?
3. **3-site vs 7-site preference** — if a coach has 7-site, that's preferred. If only 3-site, should I require the male/female specific sites or accept any 3?
4. **Periodic re-plicometria reminder** — auto-prompt every N weeks?

---

## 8. Activity / sport taxonomy unification (your #10)

The "martial arts on phone not desktop" issue: it's two separate dropdowns at different abstraction levels:
- **Intake modality** (in the training-routine editor): Forza, Ipertrofia, Cardio LISS, Cardio HIIT, Crossfit, Yoga/Mobilità, Sport di squadra, Arti marziali, Ciclismo, Corsa, Nuoto, Altro.
- **Training-log session type** (when logging an actual session): strength, hypertrophy, cardio, hiit, flexibility, deload, other.
- **SCP category** (for HR-zone correction): GRAPPLING, STRIKING, MMA, STRENGTH, HIIT, CYCLIC, TEAM, RACKET.

Questions:
1. **Canonical list**: please send the complete list of activities/sports your clients do. I'll make this the single canonical "modalità" list across the app.
2. **MET values**: if you know the MET (Compendium of Physical Activities) value for each, send those too. Otherwise I'll use reasonable defaults.
3. **SCP mapping**: which of these are appropriate for the Sport Correction Protocol? (SCP works best for: grappling, striking, MMA, strength training, HIIT, cyclic endurance.)
4. **What about pure rest-modal stuff** (yoga, mobility, sauna, walking)? Treated as "training day" or "rest day"?
5. Should the **training-log session type** be removed entirely and replaced by the modality list?

---

## 9. Plan-configuration wizard (your #2 — editing side)

Showing the per-day TDEE breakdown is in place. You wanted the coach to **edit** these before generating the plan. Confirm the editable fields:

- [ ] Per-day TDEE (override the engine's calculation)
- [ ] Per-day exercise kcal (override exercise component only)
- [ ] Per-day activity level / occupational level
- [ ] Per-day macro grams (P / F / C, or % shares)
- [ ] Per-day water + salt
- [ ] Meal count (per day or fixed for the week)
- [ ] Goal type (fat loss / maintenance / muscle gain / performance) at plan time, independent of the client's stored goal?
- [ ] Custom notes per day

**Question**: should the wizard let you save a plan as a **template** to apply to other clients?

---

## 10. Workout-screenshot OCR — live Claude Vision integration (your #8)

Screenshot upload is built (coach + client portal). The OCR is still a stub. To wire the real Claude Vision call I need:

1. **Which apps do your clients use?** Strong / Hevy / Jefit / Apple Fitness / Garmin Connect / Polar Flow / Suunto / Whoop / Apple Watch screenshots — each has a different visual layout. Send me a few sample screenshots per app and I'll tune the prompt.
2. **What should we extract?**
    - Per-exercise: name, sets × reps × load, rest, RPE? — confirm fields and priority.
    - Session-level: total time, kcal (if shown), HR avg/max, HR-zone minutes (if shown)?
3. **Per-zone HR minutes** are gold for the Sport Correction Protocol (Method 0). When the screenshot includes them, should we auto-feed SCP and use its result as the exercise EE? (My default: yes when present + the modality is one SCP supports.)
4. **Confidence threshold** — what's the minimum OCR confidence to auto-fill exercises vs flag for manual review?
5. **Italian vs English** — your clients' apps are mostly in Italian (e.g. "Distensioni su panca")? In English? Mixed?

---

## 11. Supplement library

Today there are 20 fixed supplements with auto-inclusion rules. You said you want to "add more supplements."

1. **What's missing from the library?** Send a list (name, dosage, timing, rationale, category, when to recommend) and I'll add them.
2. **Coach-edit-only library** vs **fully editable per-client**: today you can add ad-hoc supplements per plan (the "Salva modifiche" button now persists this). Do you also want a UI to manage the **master library** (add / edit / disable globally)?
3. **Interaction warnings** — you flagged this in an earlier audit. Which interactions matter most? (Iron+Calcium, Caffeine+Magnesium-timing, Omega-3 dosage, Vit D + K2 synergy, Iron + tea/coffee, …)
4. **Forms / brands** — should I track a recommended form (e.g. "magnesio bisglicinato vs ossido") per supplement? Brand recommendations?

---

## 12. PDF / branded delivery

Roberto's PDF is fairly built but please confirm:

1. **Logo** — send a PNG/SVG.
2. **Colors** — preferred brand colors (currently navy / gold).
3. **Cover-page text** — anything beyond client name + plan date?
4. **Disclosures / legal text** — Italian privacy notice, "non sostituisce consulto medico", iscrizione albo, partita IVA, codice fiscale, ECM credentials?
5. **Footer**: any contact info / website / Instagram handle to standardize?
6. **Sections you want to add / remove** from the current PDF?

---

## 13. Tone, language, and copy

The app is Italian. Confirm:
1. **Formal vs informal** — currently uses "lei" in some places and "tu" in others. Pick one for clients, one for the coach UI.
2. **Glossary / preferred terms**: e.g. "Mantenimento" or "Equilibrio calorico"? "Aggiusta porzioni" or "Adatta porzioni"? "Allenamento" or "Sessione"?
3. **Italian vs Latin nutritional terms** (e.g. "Termogenesi indotta dagli alimenti" vs "TEF"). Do clients prefer plain Italian everywhere, or are technical terms fine on the coach side?

---

## 14. Onboarding flow (your #6 / #11)

1. When you **approve a plan**, should the system automatically:
    - Send the client the plan via email? (today: only if you click "Condividi con Cliente")
    - Provision portal access if they don't have it yet? (today: only via the new "Invita al portale" button)
    - Both, automatically, on approve?
2. **Welcome email content** for new clients (when invited to portal): brief intro from Roberto? Instructions on what to do first? Send me copy.
3. **Self-service registration** — should a brand-new client be able to register themselves at `/portal/login`? Or always coach-invited?

---

## 15. Monitoring & check-ins

1. **Check-in frequency** by goal type — what are your defaults? (Today: 7 days for everything.)
    - Fat loss: 7 days?
    - Muscle gain: 14 days?
    - Performance: 21 days?
    - Maintenance: 28 days?
2. **What questions are in the check-in form** today vs what you want? Send the canonical list.
3. **Weight-flag alert thresholds** — at what Δ should the app alert you? (e.g. +1 kg vs last week → flag.)
4. **Adherence calculation** — how do you want it computed? (% of meals logged, % of training sessions logged, % of macro targets hit ±5 %?)
5. **Photo cadence** — auto-suggest a photo upload every Nth check-in?

---

## 16. Coach workflow questions (open-ended — these help me design well)

You don't have to answer these in detail, but **any color helps**:

1. Walk me through a typical Monday morning: which clients do you triage, in what order, using what data? Where does the app help you, where does it slow you down?
2. When you generate a plan, in what order do you make decisions? (Goal → routine → calories → macros → meals → integratori → guida → invio?) I want the wizard to match.
3. What's the single most common manual override you do on a generated plan?
4. What's the most common reason you re-generate a plan for an existing client?
5. Are there client types you handle very differently? (e.g. atleti agonisti vs amatoriali vs pazienti clinici)? Should the app know about these?
6. What integrations would you want with **other systems** (CRM, calendar, billing, payment, accounting/fatturazione elettronica)?

---

## How to answer

- **Best**: a single doc / email reply with answers under each numbered section.
- **Good**: voice notes — I'll transcribe and structure.
- **OK**: piecewise replies (just tell us which sections you're answering so we know what's still pending).
- **For the v4.4 spec (§1.a)**: a file share / link is much faster than re-typing the rules.

If a question is ambiguous, please ask back — I'd rather take an extra round than guess wrong and have to rework.
