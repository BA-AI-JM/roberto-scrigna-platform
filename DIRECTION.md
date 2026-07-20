# DIRECTION — Roberto Scrigna Platform (full-site, ratified 2026-07-20)
*Seed: the athlete-first client-home proposal (branch `design/client-home-proposal`), ratified by operator with amendments: CALM density, whole-site scope, concept round before build. Serves NORTHSTAR: "nothing invented, nothing lost, nothing hidden."*

## 1. Adjectives (exactly 3)
precise · warm · assured

## 2. Anti-adjectives (exactly 2)
Not **sterile** — the medical-white trap: precision sliding into cold laboratory UI. This is a practice built on care; warmth is load-bearing, not decoration.
Not **gamified** — the consumer-fitness trap: streaks, badges, neon dopamine chrome. Adherence support only; NORTHSTAR's honest-engagement clause is a design law here.

## 3. References (6, named)
- **In-repo athlete-first proposal** (screenshots on `design/client-home-proposal`) — contributes: triage-rail pattern, severity-tinted action cards, stat-row grammar, the interpretive clinical note; does not carry: its density ceiling (we calm it per operator ruling).
- **Linear (app shell)** — contributes: calm-professional restraint, quiet 1px borders, unhurried hierarchy; does not carry: dark-first cool grayscale (we are warm and light).
- **Stripe Dashboard** — contributes: tabular-numeral data tables, restrained accent discipline on light ground, professional trust; does not carry: enterprise nav breadth.
- **Apple Health (iOS)** — contributes: mobile clinical-data legibility, calm cards, per-metric color coding at low chroma; does not carry: its rainbow category palette (we hold one accent + functional severity roles).
- **Whoop (dashboards)** — contributes: athlete-physiology voice, recovery-style interpretive summaries; does not carry: dark neon consumer-gadget tone (borders our anti-adjective — taken for content structure only).
- **The existing plan PDF (navy/gold)** — contributes: artifact gravitas, cover/section rhythm worth keeping; does not carry: its separate palette — the artifact family folds into the teal identity (delight register M8).

## 4. Typographic voice
Display: **Fraunces** (variable, sparing — H1s, login, PDF covers, the interpretive note's voice). Body/UI: **IBM Plex Sans** (guaranteed tabular+lining numerals for every clinical figure; warm-technical character; solid Italian diacritics). Rationale: a warm editorial voice over engineered numbers — the practice is human, the numbers are exact.
Banned (module + seed): Inter as identity, Roboto/system-ui as identity, pure geometric coldness.

## 5. Palette seed + color strategy
Dominant: **warm bone/ivory canvas** with ink (not #000) text. Accent: **the committed teal family** (`--brand #1d9e75` ramp already engineered in globals.css — adopted, not reinvented). Chroma ceiling: muted — pastel tints for fills; saturated teal only on primary actions and active states.
Color strategy: **restrained** (one accent ≤10% of surface). Two scoped exceptions, named: (a) **severity roles** (red/amber triage tints at ~10% fill) are functional signals, not palette; (b) **data-viz roles** (kcal amber / P blue / C violet / F green, already alive on the review page) live only inside charts and macro figures, capped there.

## 6. Signature element
**"La nota"** — every data surface closes with one plain-Italian sentence of clinical interpretation in a distinct voice treatment: Fraunces italic, soft-ink, thin teal left-rule. Dashboard triage, check-in review, progress, plan review, the PDF, even key emails. It is the product's soul made visible — Roberto's judgment attached to every number — cheap to build, impossible to mistake for a template. (The generation→reveal choreography is reserved as the signature *moment* for FD-6/motion-craft; the nota is the signature *element*.)

## 7. Banned defaults (seed list + brief-specific)
Seed list in force: Inter-as-identity · AI-purple gradients · hero+3-equal-cards · pure #000 · generic placeholder names · untouched-default icon set (Lucide stays as base but disciplined: 1.75px stroke, filled active states, never emoji) · centered-hero-with-nothing.
Brief-specific: **emoji-as-iconography** (the shipped sin — 📊✅📅⚠️ all die) · dark mode at launch (token discipline first, per plan) · streak/badge gamification chrome · the navy/gold artifact palette as a separate system · "coach"/"nutrizionista" lexical drift (one word everywhere: *il tuo nutrizionista*).

---
Style module: **minimalist-ui** (best-fit signal: "calm B2B, content-first" — a clinical data product under a CALM ruling; warm canvas + pastel spot-accents + 1px borders are exactly the proposal's language). Runner-up rejected: `design-taste-frontend` (its VARIANCE-8 baseline fights the calm ruling; a specific module fits, so the default baseline loses). Also rejected: `industrial-brutalist-ui` (data-density fits, but hazard-red tactical voice contradicts warm clinical care).
Dials: VARIANCE=4 · MOTION=4 · DENSITY=5 (coach surfaces may run denser *tables* inside calm chrome; portal leans 4 — two-register density, one chrome). Stated deviations from 8/6/4 baseline are deliberate, per the operator's "not too busy."
Tension check: (1) audience↔adjective — "warm" vs expert efficiency: resolved, warmth lives in chrome+voice, precision in data grammar. (2) **brand-color contrast — FLAGGED FORWARD to FD-2**: the teal ramp's AA pairs were verified against white; the new warm-bone canvas changes the base — recompute every pair. (3) reference↔anti-adjective — Whoop borders "gamified/dark": annotated does-not-carry; structure only. (4) brief-raised — density dial vs coach cockpit-appetite: resolved via the two-register rule above.
Diverges from prior direction on: first DIRECTION.md for this project, n/a (lineage: extends the June proposal rather than diverging — ratified explicitly).

---
## Reference-round amendments (2026-07-20, operator: "we can do a bit better")
Eight field references captured to `docs/polish/concepts/references/` (Whoop, TrainingPeaks, Everfit, Healthie, Levels, Attio, Amie, Linear — all opened for operator). Three inspected at depth by the design lane. Five concrete upgrades bound into concepts v2 and the build:
1. **Type-scale conviction** (Whoop, Levels): the moment that matters speaks at 34–44px Fraunces in-app (day header, plan reveal, "Oggi", login) and larger on artifacts — v1's 24–26px was polite where it should be assured.
2. **Humanity through image** (Levels, Whoop): chrome alone is not warmth. Login panel, portal header band, PDF cover, and key empty states carry warm photographic/textural moments — bone-light food and practice photography in OUR palette; never dark-consumer washes (anti-adjective guard holds).
3. **Hero-object presentation** (Attio): the generated plan is presented as an object under a soft ambient wash at the reveal — the product's own artifact treated with reverence.
4. **Micro-refinement layer** (Attio, Linear): kbd hints on coach surfaces, pill CTAs, 2–3% ambient gradients, purposeful eyebrow labels — the distance between clean and expensive.
5. **Emptier defaults** (operator instinct + Attio): fewer, larger elements; dashboard stat strip drops to three; more air between panels. Calm, pushed further.
Imported: conviction, atmosphere, refinement. NOT imported: their darkness, their English-consumer tone, their gamified edges.

---
## Theme ruling (2026-07-20, operator: "Levels × Everfit, light and dark, really clean")
Supersedes the launch dark-mode ban (operator ruling at the token-compile moment — the cheapest it will ever be).
- **One semantic token system, two themes, simultaneous.** Light = coach default (clinical daytime, print-adjacent). Dark = first-class, offered by default on the athlete portal (evening/gym context); both available everywhere.
- **Canvas evolution:** light shifts ivory → barely-warm greige/white (the Levels/Everfit clean-neutral read); dark = warm charcoal, never pure #000. Teal remains the single accent in both themes; severity + data-viz roles re-tuned per theme at AA.
- **Warmth relocates** from canvas color to the three theme-invariant carriers: Fraunces at conviction scale, neutral-studio athletic/practice photography (Everfit/Levels grammar, our subjects, both-theme-safe), and la nota. Anti-sterile guard holds by these, not by cream.
- **FD-2 consequence:** contrast recompute now runs against BOTH bases; every semantic pair ships with light+dark values or ships not at all.
