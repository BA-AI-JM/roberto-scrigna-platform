# What the v4.4 spec answers — and what's still open

**Date:** 2026-05-14
**Source:** `Nutrition_Planning_System_Unified_Specification_v4_4.docx` (internal version label says "Version 4.2" — same canon, ~3500 lines).
**Method:** Read end-to-end; answers cross-referenced against the questions in `ROBERTO-QUESTIONS-2026-05.md`.

The spec **does not** answer everything. It's the canonical source for the macro engine and meal-plan-creator algorithm, and explicitly **scopes out** product-level UX (onboarding, branding, copy, supplement prescriptions). It also doesn't pin gram-level rounding or a target-date-driven deficit calculator. Both still need Roberto.

---

## 🟢 Answered by the spec — implement these

### 1. Macros (P / F / C)
- **Protein**: `protein_per_ffm_g_per_kg × FFM_kg`. Default **2.5 g/kg FFM**; allowed range **2.0–3.0**.
- **Fat**: `fat_per_bw_g_per_kg × BW_kg`. Default **1.0 g/kg BW**; allowed range **0.5–1.5**. Hard floor **0.5 g/kg** in aggressive hypocaloric phases (warn but allow if practitioner overrides).
- **Carbs**: remainder. `carbs_g = (TDEE_*_kcal − P×4 − F×9) / 4`.
- **Macro overrides** (`macros.rules.macro_overrides`): practitioner can set absolute g for any/all of P/F/C, bypassing the formula. The plan-config wizard must surface this.
- **Energy Availability**: `EA = (intake − exercise) / FFM`. Bands: >45 optimal · 30–45 adequate · <30 low · <20 critical. Show this in the wizard / review page.

### 2. Day-type system
- **Flexible 1–4 day types** with customizable labels — not a fixed `training/rest/refeed/deload` enum.
- Recommended presets per the spec & worked examples: **OFF / TRAINING** (simple); **OFF / WEIGHTS / SPORT / DOUBLE** (full periodisation); a `high_volume_day` 4th slot is allowed.
- **A "double training day" is first-class** in the spec (e.g. morning sport + evening weights) — exercise kcal of both sessions sum into `TDEE_double`.
- Single-mode: when no periodisation, use `day_type_mode: "single"` with one "diet" day.

### 3. Training-day macro allocation (not carbs-only)
- On training days, **P and F also rise**, not just C. Suggested allocation of the additional energy: ~75–81 % carbs, 12–18 % protein, 4–10 % fat.
- Simplified rule: training day = +5–10 g P and +3–5 g F over rest day; remainder → C.
- Concrete example from §A.2: WEIGHTS day +5 g P / +3 g F vs OFF; SPORT day +8 g P / +5 g F vs OFF; DOUBLE day +10 g P / +6 g F vs OFF.

### 4. NEAT
- **Primary formula**: `NEAT_kcal = steps × bodyweight_kg × 0.0005`. Matches the engine.
- **Fallback** (no steps): activity multiplier × (BMR + TEF), multiplier in **1.1–1.5** range (spec is explicit — do **not** go higher).
- Step-count inference from occupation (when missing): sedentary midpoint 4000, light 6500, moderate 10000.
- **Practitioner override** `neat_override_kcal` — supported.

### 5. BMR + TEF
- **BMR**: Katch-McArdle `370 + 21.6 × FFM_kg`. Practitioner override `bmr_override_kcal` allowed.
- **TEF**: `0.10 × BMR`. Matches the engine.

### 6. Exercise EE priority order (spec is explicit)
1. **Sport Correction Protocol** (when HR zone data + sport category present)
2. **RPE → MET** (preferred when no zones): `kcal = BW × hours × MET`, with MET ranges 3–8 by RPE (modality-aware). **Strength training is capped at MET 3 regardless of RPE.**
3. **Modality estimate** fallback table (kcal/hr ranges per modality)

This validates the engine's Method 0/1/2/3 priority — and is the canonical reason we should never fall through to the flat 300 kcal default if any of the three above are usable.

### 7. Sport taxonomy (Roberto's #10 — fully answered by Appendix D)
The canonical list:

**GRAPPLING** → BJJ Class/Sparring/Drilling/Open Mat/Competition · Wrestling · Judo · Sambo
**STRIKING** → Boxing Class/Sparring/Bag-Shadow/Pads · Muay Thai Class/Sparring · Kickboxing · Karate · Taekwondo
**MMA** → MMA Class · Striking Focus · Grappling Focus · Sparring · Competition
**STRENGTH** → Strength · Hypertrophy · Power/Olympic · Circuit · Calisthenics · Machines/Gym
**HIIT / FUNCTIONAL** → CrossFit/WOD · HIIT Intervals · Circuit Training · Boot Camp
**CYCLIC** → Running (Easy/Steady/Intervals/Long/Race) · Cycling · Rowing · Swimming
**TEAM** → Football Training/Match · Basketball Training/Match · Rugby · Hockey
**RACKET** → Tennis Singles/Doubles · Padel · Squash · Badminton

Each maps to a specific `(category_id, session_type, profile)` tuple. **Build the intake modality picker from this list** — this also auto-resolves SCP `category_id` and `session_type` without separate questions. The previous intake list ("Forza / Ipertrofia / Cardio LISS / ...") was a placeholder.

### 8. Meal distribution (Roberto's #2/#3 on meal-plan structure)
- **Slots**: 3 / 4 / 5 / 6 meals with labels (Breakfast, Lunch, Snack, Dinner, plus Snack1/Snack2 for 5–6, Pre-bed for 6).
- **Energy distribution templates** are specified for each meal count × training time (morning/afternoon/evening) — exact percentages. Currently the engine probably uses static templates; needs cross-check against the spec table.
- **Protein distribution**: roughly even ±10 % across meals (toggle: Even / Heavier morning / Heavier evening).
- **Fat timing**: reduce fat in the 90–120 min window around training.
- **Carb periodization toggle**: Front-load / Even / Back-load / **Train-centric** (default). On OFF days, reduce dinner carbs proportionally.
- **Pre-bed meal** (6-meal only): bias toward protein (casein), moderate fat, low carbs.

### 9. Meal-plan scaling and tolerances (Roberto's #4 — *almost* answered)
The spec **does** define:
- **Scale-factor bounds**: 0.7–1.4 typical, 0.5–1.5 absolute (flag as "significantly modified" outside the typical range).
- **Per-ingredient floors/ceilings**:
    - Proteins (meat/fish/eggs): **min 50 g** scaling floor.
    - Vegetables: **min 150 g** per main meal.
    - Oils/fats: **max 21 g** (1.5 tbsp) per meal.
    - Cheese: **max 40 g** per meal.
    - Condiments/spices: **never scale**, keep at base amount.
- **Macro scaling priorities** per category (default order for carbs: cereals > legumes > starchy veg > fruit; protein: lean meat/fish > eggs > dairy > legumes; fat: olive oil > nuts > avocado > inherent). Practitioner toggle: `default | minimise_fruit | minimise_grains | custom`.
- **Fat rules per meal**: `no_added_oil` / `uses_added_oil` / `conditional_oil`.
- **Tolerance bands**:

  | Level | Protein | Fat | Carbs | Energy |
  |---|---|---|---|---|
  | Per-meal | ±5 g | ±5 g | ±10 g | ±50 kcal |
  | Per-day | ±10 g | ±10 g | ±15 g | ±100 kcal |

  Current engine uses `{P 10, F 10, C 15, kcal 100}` per-day → **matches**. Per-meal tolerances aren't checked today.
- **Tightening levers** (§10.8.2): adjust protein portions ±20 g, starch ±30 g, oil ±½ tbsp.

**What the spec does NOT define** (Roberto's actual ask):
- Gram-level rounding ("round to nearest 5 g", "eggs snap to 50 g multiples", "liquids to 10 ml", "1 fetta biscottata = X g").
- A snap-to-unit table.

**Still need from Roberto.** My §1.b table in `ROBERTO-QUESTIONS-2026-05.md` is the right thing to push on — the spec gives no shortcut.

### 10. Hydration & salt (Roberto's #6)
- **Water**: `water_ml = ml_per_kg × BW_kg`. Default `ml_per_kg = 37.5` (one §3.2 example uses 35; the v4.2 schema default is 37.5).
- **Salt**: `salt_g = salt_per_liter_g × water_liters`. Default `salt_per_liter_g = 1.5`.
- Rounded values are surfaced (the §A.2 example rounds water to 0.1 L and salt to nearest g).
- No climate / sweat-rate adjustment is specified — out of scope (practitioner override the only mechanism).

### 11. Body composition
- **Primary**: Jackson-Pollock 7-site (`bf_method = "jackson_pollock_7_site"`). Formulas in Appendix B.
- **Fallback**: 3-site (sex-specific). Males: chest + abdomen + thigh. Females: triceps + suprailiac + thigh. Formulas in Appendix B.
- **Last resort**: estimation table (BMI-anchored) with `method = "estimated"`. Spec marks this as imprecise — flag the limitation.
- **Siri equation** (BD → BF%): `BF% = (495 / BD) − 450`.

### 12. Post-plan calibration (Roberto's #15 — partial answer)
After 2+ weeks of adherence data:

| Δ from expected | Adjust |
|---|---|
| ±0.2 kg/wk | none |
| 0.2–0.5 kg/wk | TDEE ±5 % (~100–150 kcal) |
| 0.5–1.0 kg/wk | TDEE ±10 % (~200–300 kcal) |
| >1.0 kg/wk | re-evaluate inputs (likely measurement error) |

Note: spec explicitly says this is **practitioner workflow guidance, not automated** — but a "suggested adjustment" hint in the check-in UI would be very on-brand.

### 13. User configuration toggles (Roberto's #2 wizard scope)
Spec defines these toggles that the wizard should expose:
- `diet_pattern`: Omnivore | Pescatarian | Vegetarian | Vegan | Dairy-free | Gluten-aware | Low-FODMAP (default: Omnivore)
- `meal_count`: 3 | 4 | 5 | 6 (default: 3)
- `carb_periodization`: Front-load | Even | Back-load | Train-centric (default: Train-centric)
- `protein_distribution`: Even | Heavier morning | Heavier evening (default: Even)
- `scaling_preference`: default | minimise_fruit | minimise_grains | custom (default: default)
- `complexity`: Minimal | Standard | Gourmet (default: Standard)
- `satiety_bias`: High-volume | Neutral | Energy-dense (default: Neutral)

The existing intake form only exposes meal_count and a few allergens. The plan-config wizard should add the rest.

---

## 🟡 Spec confirms a direction but leaves the dial to Roberto

### 14. Day-type *labels* and how many to offer
- Spec allows 1–4 day types with **custom labels**. So Roberto's choice of presets (ON/OFF, Light/Medium/Heavy, +Refeed, +Deload) is a UX-level decision; the engine + schema already support it.
- The schema's `tdee_kcal.day_types[]` is an array of `{label, kcal}` — completely flexible.
- **Recommendation**: offer the spec's worked-example pattern (OFF / WEIGHTS / SPORT / DOUBLE) and the simpler ON/OFF as presets, plus "Custom" with up to 4 labels. Still ask Roberto to confirm.

### 15. Macro-override surface
- Spec explicitly supports `macros.rules.macro_overrides` and `bmr_override_kcal` / `neat_override_kcal`. The wizard should surface all of these as editable inputs with engine-calculated defaults pre-filled.

### 16. Substitution system
- Spec defines **meal-level swap families** (e.g. Yogurt Bowl ↔ Cereal Bowl ↔ Porridge for breakfast; Cod+Potato ↔ Tuna+Pasta for lean fish lunches) and **ingredient-level swap families** (White fish: Cod ↔ Haddock ↔ Sea Bass; Grains: Rice ↔ Quinoa ↔ Couscous).
- Each MealOption exposes 2–4 pre-validated swaps. The "Usa come principale" feature I built now has a richer canonical set to pull from.
- **Action**: implement the spec's swap families as the canonical alternatives source.

---

## 🔴 Still need Roberto's answers — spec is silent

### 17. **Gram-level rounding and unit-snapping (Roberto's #4)**
Spec defines tolerances, mins and maxes for ingredient grams — but **no** "round to nearest N g" rule and **no** unit-snap table (egg = 50 g, 1 fetta biscottata = ?, 1 vasetto yogurt = 125 g, 1 mela = 150 g, etc.). Push §1.b of `ROBERTO-QUESTIONS-2026-05.md` — this is still the single highest blocker.

### 18. **Target-date-driven deficit & aggressiveness calculator (Roberto's #9)**
Spec has post-plan **calibration** logic (after 2 weeks of data), but no upfront "client weighs 90 kg, wants 80 kg in 12 weeks → here's the deficit" calculator. The macro engine starts from `intake = TDEE` and lets the practitioner apply deficit/surplus *afterwards*. The aggressiveness expression / cap / safety floor is **not** in the spec.

→ §4 of the questions doc still needs Roberto: which expression (%BW/wk vs %TDEE vs absolute kcal), what cap, what the engine should do when the requested timeline implies a deficit above the cap.

### 19. **Supplement library expansion / interaction warnings (Roberto's #11)**
Spec explicitly **excludes** supplement prescriptions: *"No medical advice, diagnoses, or supplement prescriptions beyond listing what the user already takes."* This is an out-of-scope-for-the-spec but in-scope-for-the-app product decision. Push §11 of the questions doc.

### 20. **Refeed / deload triggers and magnitudes (Roberto's #2.d)**
Spec supports custom day-type labels and 1–4 day types, so refeed/deload *can* be modelled as a day type with its own macros — but the spec doesn't prescribe **when** (every 10 days? after N weeks of deficit?) or **how much** the refeed adds. Practitioner decision.

### 21. **Onboarding flow, portal invite, welcome email content (Roberto's #14)**
Out of scope for the spec. Pure product UX. Push §14.

### 22. **Branding, logo, Italian copy / tone (Roberto's #12, #13)**
Out of scope for the spec. Push §12 and §13.

### 23. **Live OCR — workout app coverage (Roberto's #10)**
Out of scope for the spec. We have the schema (HR zone minutes per session feeds SCP), but which apps Roberto's clients use and what we extract from each is practitioner input. Push §10.

### 24. **Monitoring KPIs and check-in frequency (Roberto's #15)**
Spec has calibration rules (§12 above) but check-in *cadence* and KPI choice are product decisions. Push §15.

---

## What changes in our implementation as a result

Concrete updates I should make, sorted by impact (each is a separate small commit):

1. **Replace the placeholder intake modality list** with the canonical Appendix D list (display name → category_id, session_type, profile). This:
   - Makes SCP reachable from the UI automatically.
   - Unifies the activity taxonomy across intake / training-log / SCP categories (resolves Roberto's #10 misunderstanding).
   - Updates the engine's `MODALITY_MET` mapping in `src/services/training-modality.ts` to derive METs from `(category, session_type, profile)` instead of free-text modality strings.

2. **Update the training-modality MET defaults** to align with the spec's MET tables (§3.2 STEP 5: "RPE → MET" + the modality fallback table). E.g. strength training is **always** MET 3 regardless of RPE — our current code multiplies by RPE which over-counts strength sessions. **Fix this.**

3. **Day-type schema migration**: the current engine has `DayType = "training" | "rest" | "refeed" | "deload"` (4 fixed values). The spec wants flexible labels with up to 4 day types. **Defer until Roberto confirms which preset structures he wants**, but plan the migration shape now.

4. **Training-day macro allocation** to follow the spec's +P/+F rules, not carbs-only. Audit `src/engine/macros.ts` for the current allocation logic — likely diverges from spec.

5. **Add the missing user toggles** to the plan-config wizard: `carb_periodization`, `protein_distribution`, `scaling_preference`, `complexity`, `satiety_bias`, `diet_pattern`. The schema field names align with the spec's `macros.rules` and meal-plan inputs.

6. **Expose macro overrides** (P_g, F_g, C_g, BMR override, NEAT override) in the wizard — already in the spec's `macros.rules.macro_overrides` schema.

7. **Per-meal tolerance check** in the meal-plan validator (currently only per-day). Add per-meal `±5 g P / ±5 g F / ±10 g C / ±50 kcal`.

8. **Energy Availability output** — surface `EA = (intake − exercise) / FFM` on the review page with the spec's status bands (Optimal/Adequate/Low/Critical). Today we don't.

9. **Strength MET cap of 3 in RPE-based estimation** — the engine currently uses `MODALITY_MET["Forza"] = 5.0` and an RPE multiplier. The spec is explicit: strength training is MET 3 regardless of RPE. **This is a bug** — likely overestimating strength-day TDEE by 30–60 % vs spec.

10. **Hydration**: confirm `ml_per_kg = 37.5` (spec schema default) vs `35` (one §3.2 example). Use 37.5.

---

## In one sentence

The spec **completes the engine and meal-plan calc story** — including a canonical sport taxonomy (Appendix D) that lets us unify the dropdowns and reach SCP automatically — but it **explicitly punts on practical food rounding, target-date deficit aggressiveness, supplement strategy, and all product-level UX**. So my §1 (rounding tables), §4 (deficit), §11 (supplements), §12–15 (product) questions remain the right ones to push to Roberto; §2 (day-type structure preset choice), §7 (wizard editable fields), and §10 (OCR app coverage) are partially answered.
