# Questions for Roberto — May 2026

Thanks for sharing the v4.4 spec. It answered most of the technical questions. The list below is what's still genuinely open, organised by urgency.

**If you only have 10 minutes, answer the three questions in 🚨 Section A.** Everything else can come later.

For each question I've proposed a default in **bold**. If you're happy with it, just say *"OK with defaults for §X"* and we'll proceed.

---

## 🚨 Section A — These 3 are blocking real work

### A1. How should food amounts round?

Right now the app outputs amounts like "93 g pasta, 187 ml milk, 78 g eggs". You said in your feedback the rounding logic from the macro planner isn't being applied. The spec doesn't define exact rounding rules either — that's your call.

**(a) Default precision** — pick one:

- [ ] **Standard: solids round to nearest 5 g, liquids to nearest 10 ml.** *(recommended)* → 93 g → 95 g · 187 ml → 190 ml
- [ ] Tighter: solids 5 g for ≥ 20 g, 0.5 g below 20 g, liquids 5 ml. (For athletes who weigh precisely.)
- [ ] Looser: solids 10 g, liquids 10 ml. (Mass-market friendly.)

**(b) "Whole unit" foods** — please give the per-unit grams. Best-guess is fine:

| Food | 1 unit = ? grams |
|---|---|
| Uovo intero (medio) | _____ g (proposed **50**) |
| Albume | _____ g (proposed **30**) |
| Fetta biscottata | _____ g (proposed **10**) |
| Fetta di pane integrale | _____ g (proposed **30**) |
| Vasetto yogurt greco | _____ g (proposed **125 or 170**) |
| Mela media | _____ g (proposed **150**) |
| Banana media | _____ g (proposed **120**) |
| Cucchiaio olio EVO | _____ g (proposed **10**) |
| Cucchiaino zucchero/miele | _____ g (proposed **5**) |
| Misurino proteine in polvere | _____ g (proposed **30**) |
| **Anything else** that should snap to whole units? | … |

**(c) Foods that should NEVER round** (e.g. integratori with precise dosing): _______________

> If you just say "OK with defaults", I'll use all the proposed values above.

---

### A2. Which plan structures should the app offer?

The spec lets a plan have 1–4 day types with custom labels. Please pick which presets to put in the dropdown when generating a new plan:

- [ ] **Media settimanale** *(one day type — collapses the week into a single average)*
- [ ] **ON / OFF — Allenamento / Riposo** *(your current default)*
- [ ] **OFF / Pesi / Sport / Doppia sessione** *(the spec's 4-day worked example)*
- [ ] **Leggero / Medio / Pesante** *(three intensity tiers; you assign each weekday to one)*
- [ ] **ON / OFF + Refeed** *(adds 1–2 high-carb refeed days)*
- [ ] **ON / OFF + Deload** *(adds reduced-load deload days)*
- [ ] **Carb cycling** *(high / medium / low carb days, independent of training)*
- [ ] **Custom** *(coach manually labels up to 4 day types per plan)*

> Tick whichever you want first-class. Unchecked ones can still be built via "Custom".

**(b) Can one client have multiple active plans at the same time?** (e.g. a "phase 1" plus a "test week with carb cycling")
- [ ] **No — one active plan at a time.** *(recommended)*
- [ ] Yes — multiple. If yes: which one does the client see in the portal? Most recent / coach-pinned?

---

### A3. How does the app calculate the calorie deficit when a client says "I want to weigh X by date Y"?

The spec is silent on the upfront calculator. You asked for this in your feedback.

**(a) What expression drives the deficit?**
- [ ] **% of bodyweight per week, capped at 1.0 % / week.** *(recommended — clinically standard)*
- [ ] % of TDEE, capped at 25 %.
- [ ] Both — primary in % BW, soft-warn if > 25 % TDEE.

**(b) Minimum kcal floor (the app blocks anything below this):**
- [ ] **Energy Availability ≥ 20 kcal/kg lean mass.** *(recommended — spec-aligned)*
- [ ] Absolute floor: 1200 kcal F / 1500 kcal M.
- [ ] 1.2 × BMR.

**(c) When the math says the timeline is unrealistic:**
- [ ] **Allow it but flag "aggressivo" and auto-suggest a longer timeline** (e.g. "consigliamo 20 settimane invece di 12"). *(recommended)*
- [ ] Block it — force the coach to extend the timeline.
- [ ] Allow up to the cap and silently extend the date.

**(d) For muscle gain (surplus) — same logic, just inverted?** With cap at 0.5 % BW/week for natural lifters?
- [ ] **Yes, same logic.** *(recommended)*
- [ ] No — different rules. Please describe.

---

## 🟡 Section B — Important but not blocking (10 min each)

### B1. Three places the engine doesn't match the spec — pick the right one

I won't change these without your call because the fidelity tests are calibrated against real plans you've delivered.

**(a) Training-day fat** — spec wants 1.0 g/kg BW + small bump on training; engine has **less** fat on training days (0.9 g/kg) than rest days (1.0 g/kg).
- [ ] Use spec (training fat ≥ rest fat)
- [ ] **Keep engine as-is — your clinical practice.** *(recommended — you've shipped this for months)*

**(b) Rest-day protein** — spec wants 2.5 g/kg lean mass constant; engine drops to 2.2 g/kg on rest days.
- [ ] Use spec (constant 2.5)
- [ ] **Keep engine as-is.** *(recommended)*

**(c) Salt formula** — spec wants 1.5 g/L × water; engine uses 5 g rest + 1.5 g training bonus (~25 % higher).
- [ ] Switch to spec formula
- [ ] **Keep engine as-is.** *(recommended)*

> If you don't have a strong opinion, "Keep engine as-is" on all three is the safe default.

### B2. Refeed / deload — when do they trigger and how big is the boost?

Only relevant if you ticked Refeed or Deload above.

- **How is a refeed scheduled?** *(if applicable)*
    - [ ] Coach picks manually per plan.
    - [ ] **App auto-suggests after N days in deficit, coach approves.** *(recommended)*
    - [ ] App auto-schedules every Nth day.
- **How big is a refeed day (vs the baseline training day)?** Please describe — e.g. "+300 kcal, all carbs" or "+15 % of TDEE, P/F unchanged":  _________________
- Same questions for deload — _________________

### B3. Should approving a plan automatically send it to the client?

Today there are two separate buttons: **Approva** (changes status) and **Condividi con Cliente** (sends the email). And **Invita al portale** if they don't have access yet.

- [ ] Two-click flow (current) — Approve, then Condividi if you want.
- [ ] **One-click: Approve also sends the email + invites them to portal if needed.** *(recommended)*
- [ ] One-click but only emails if the client already has portal access.

**Welcome email copy** (the message that goes to a new client with the portal link) — please send 2–3 sentences in your voice:
> _____________________________________________________

### B4. Client history model

When you "edit" a client with new measurements / new goal / new training routine:

- [ ] **Create a new dated snapshot every time; old snapshots are read-only history.** *(current behavior — recommended)*
- [ ] Keep one editable "scheda corrente" that you overwrite; only measurements are dated.

> If the recommended option is fine, just say so.

---

## 🟢 Section C — When you have time

### C1. Branding for the PDF and emails
- Logo (PNG or SVG): ______________
- Colors: today navy `#1a1a2e` + a yellow accent. Replace?
- Italian legal text for the footer (privacy, "non sostituisce consulto medico", iscrizione albo, P.IVA): _________________
- Email signature: _________________

### C2. Tone — formal "lei" or informal "tu" with clients?
- [ ] **Tu** *(recommended for sport-nutrition clients)*
- [ ] Lei
- [ ] Mixed (e.g. tu in app, lei in PDF). Please describe.

### C3. Supplements
- Please send a list of supplements you want added to the library — even 5–10 names with *name · dosage · timing · rationale · when to recommend* is enough.
- Interactions you want flagged automatically? (Iron+Calcium timing, Caffeine+Magnesium timing, Iron + tea/coffee, Omega-3 > 3g/day, Vit D + K2 synergy, …)

### C4. Workout-screenshot OCR
- Which apps do your clients screenshot? (Strong, Hevy, Apple Fitness, Garmin Connect, Polar Flow, Whoop, Apple Watch summary, …) — sending 2–3 sample screenshots per app would let me tune the prompt.
- For each screenshot, what should we extract? (Exercise list + sets/reps/load + RPE? Session HR avg/max? HR-zone minutes? Total kcal?)

### C5. Check-ins
- Check-in frequency by goal: fat loss every ___ days · muscle gain every ___ · maintenance every ___ ?
- Which questions should the form ask the client? (weight, energy 1–10, sleep, hunger, adherence %, stress, training adherence %, notes?)
- Alert me when client weight changes by more than ___ kg vs last week.

### C6. Anything else (open-ended)
A few minutes of stream-of-consciousness here is gold:
- Walk through your typical Monday triage. Where does the app help, where does it slow you down?
- The single most common manual override you do on a generated plan?
- Most common reason to re-generate a plan for an existing client?
- Any external system you'd want integrated (CRM, calendar, fatturazione elettronica, payment)?

---

## How to reply

Easiest: paste this doc back to us with your answers under each question. Voice notes also work — we'll transcribe. Even partial replies help — **§A is where the value is**.

If anything is unclear, please push back. Better one extra round than the wrong default.
