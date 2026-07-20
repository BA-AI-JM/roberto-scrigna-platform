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
