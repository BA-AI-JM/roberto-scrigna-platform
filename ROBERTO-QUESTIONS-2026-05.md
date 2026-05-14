# Questions for Roberto — May 2026

We've made a lot of defaults to avoid pestering you. **Skim the first section — if anything looks wrong, tell us.** The "questions" section at the bottom is the short list of things we genuinely need from you.

---

## Defaults we're going with (just say if any are wrong)

**Food rounding.** Solids to nearest 5 g · liquids to nearest 10 ml · integratori never round.

**Food unit weights** (whatever the math gives us snaps to the nearest whole unit when within ~15 %):

| | grams |
|---|---|
| 1 uovo intero medio | 50 g |
| 1 albume | 33 g |
| 1 fetta biscottata | 8 g |
| 1 fetta di pane | 30 g |
| 1 vasetto yogurt greco | 150 g |
| 1 scatoletta tonno (sgocciolato) | 80 g |
| 1 mela media | 150 g |
| 1 banana media | 120 g |
| 1 cucchiaio olio EVO | 10 g |
| 1 cucchiaino zucchero/miele | 5 g |
| 1 misurino proteine in polvere | 30 g |

**Day-type structures** (ready to pick when generating a plan): Media settimanale · ON/OFF (Allenamento/Riposo) · OFF / Pesi / Sport / Doppia · ON/OFF + Refeed. Anything else stays buildable via "Custom".

**Plans per client.** One active at a time; older plans archived.

**Deficit / surplus calculator.**
Fat loss: cap at 1.0 % bodyweight/week. Warn above 0.75 %.
Muscle gain: cap at 0.5 % bodyweight/week.
Minimum calories: Energy Availability ≥ 20 kcal/kg lean mass (spec-aligned).
If the client's timeline is impossible at the cap, we set the most aggressive plan and warn — we don't block.

**Refeed.** Auto-suggested after 14 days continuous deficit > 15 % of TDEE; refeed day = baseline training day + 20 % kcal, all in carbs.
**Deload.** Optional — suggested every 6 training weeks; same kcal, training day-type with reduced exercise expenditure.

**Approving a plan.** Approve sets it active. It does **not** auto-send — you click "Condividi" when ready. (Avoids accidental sends.)

**Portal invite.** Manual via "Invita al portale" button. The email says (current draft):

> *Ciao [nome], ti ho preparato il tuo piano nutrizionale personalizzato. Lo trovi nel portale, dove puoi consultarlo, scaricare il PDF e inviarmi i check-in settimanali. Accedi qui: [link]. A presto, Roberto.*

**Tone.** Tu (informal) with clients in app and PDF.

**Branding.** Navy `#1a1a2e` + yellow accent (current). Footer text (current draft):

> *Roberto Scrigna — Nutrizionista Sportivo · P.IVA [da inserire] · Iscritto all'albo [da inserire] · Questo piano è un supporto nutrizionale e non sostituisce il consulto medico. Trattamento dati conforme al GDPR.*

**Check-in defaults.** Fat loss every 7 days · muscle gain every 14 · maintenance every 28. Form asks: peso, energia 1–10, sonno 1–10, fame 1–10, aderenza dieta %, aderenza allenamento %, note. Alert when weight changes more than 1 % of bodyweight vs last check-in.

**Supplements we'll add to the library** (on top of what's already there): Curcumina (recovery / anti-infiammatorio) · Vitamine gruppo B (energia / stress) · Iodio + Selenio (tiroide) · MSM (articolare) · Mio-inositolo (donne / sindrome dell'ovaio policistico) · Spirulina (antiossidante / micronutrienti) · Glicina (sonno) · Tirosina (concentrazione / mood) · Coenzima Q10 (cardio / atleti master).

Auto-flagged interaction warnings: Ferro+Calcio (timing) · Caffeina+Magnesio (timing) · Omega-3 > 3 g/die (effetto anticoagulante) · Vit D senza K2.

**OCR.** We'll wire support first for Strong, Hevy, Apple Fitness, Garmin Connect, Polar Flow, and Apple Watch summary screens. Extracts exercise list (name · serie × ripetizioni × carico · RPE), session totals (durata, FC media/max, minuti per zona FC quando presenti, kcal). When HR-zone data is present and the modality is SCP-eligible, we feed it to the Sport Correction Protocol automatically.

---

## Things we actually need from you

**1. Three places the engine doesn't match the v4.4 spec — pick which one is right (or say "keep engine as-is"):**

a) Training-day fat. Spec says 1.0 g/kg bodyweight. Engine uses 0.9 g/kg on training, 1.0 on rest — so training has *less* fat than rest. Bug or your clinical practice?

b) Rest-day protein. Spec says 2.5 g/kg lean mass constant. Engine drops to 2.2 g/kg on rest days. Bug or your practice?

c) Salt. Spec says 1.5 g per litre of water. Engine uses 5 g base + 1.5 g training bonus (~25 % higher). Bug or your practice?

**2. Your refeed / deload protocols.** The defaults above are textbook. Tell us if you do something specific (e.g. "refeed = +500 kcal, carbs only, every 10 days").

**3. Logo and the real values for the footer:**
- Logo file (PNG or SVG, transparent background ideal)
- Your P.IVA / codice fiscale
- Albo di iscrizione (name + number)
- Anything else you want in the PDF footer or email signature

**4. Workout-app screenshots.** Send 2–3 sample screenshots per app you actually see from clients (Strong, Hevy, Garmin, Polar, Whoop, Apple Watch — whichever ones are real for you). We'll tune the OCR to read them.

**5. Any of the defaults wrong?** Anywhere in the section above where you'd do it differently — just say which item and what you'd change. One line per item is fine.

**6. One open-ended question:** what's the single most common manual override you do on a generated plan? (Tells us where the engine is consistently a bit off, so we can fix it at the source.)

---

That's it. Reply in any format — prose, voice note, paste this back with edits inline.
