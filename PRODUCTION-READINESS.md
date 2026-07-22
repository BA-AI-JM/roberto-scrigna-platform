> ⚠️ **This document is an informational snapshot, not the deploy authority.** Deploy readiness
> is proven per-release by a dated release manifest (commit + migrations + env + smoke evidence).
> Governing status lives in [`NORTHSTAR.md`](./NORTHSTAR.md),
> [`docs/polish/PLAN-OF-RECORD.md`](./docs/polish/PLAN-OF-RECORD.md), and the audit register
> ([`docs/polish/01-CODE-GAP-REGISTER.md`](./docs/polish/01-CODE-GAP-REGISTER.md)).

# Roberto Scrigna Platform — Production Readiness Snapshot

**As of:** 2026-07-22 · branch `polish/audit-arc-2026-07`
**Shape:** Core application shipped and green. One feature workstream (Model B day-type rebuild)
has its engine merged but its wizard UI + serialization still open. Production DB is two
migrations behind the repo (023/024 pending operator apply).

---

## Build Verification

| Check | Status | Evidence |
|-------|--------|---------|
| TypeScript | **Green** | `bunx tsc --noEmit` — 0 errors |
| Vitest (unit) | **Green** | `bunx vitest run` — 125 files, **1230 passed** (+3 expected-fail, +3 todo), 0 unexpected failures |
| Contrast (design gate) | **Green** | `python3 scripts/check-contrast.py` — **22/22 pairs pass** WCAG-AA, both themes |
| Production build | **Gated in CI** | `.github/workflows/ci.yml` runs typecheck · unit · build on every push/PR (Bun 1.3.11) |
| Clinical fidelity | **Green** | Fixture plans pinned in the engine suite (e.g. Niccolò `793a9bac` decodes unchanged) |

---

## Shipped — Coach app

| Feature | Notes |
|---------|-------|
| Login / sessions | Supabase Auth, cookie-based (`authRouter`) |
| Dashboard | Live tRPC counts, onboarding card for zero-data state (`dashboardRouter`) |
| Athlete list / detail / edit | Search, status tabs, pagination, mobile cards (`clientRouter`, `clients/[id]`) |
| Cooperation types | `abbonamento` / `consulenza` / `fight_camp` + `is_free` flag (migration `023`) |
| Editable anamnesis | Fully editable post-intake (`clients/[id]/edit/page.tsx:176`) |
| Intake wizard | Weight, height, occupational level, skinfolds → snapshot (`plans/new/IntakeForm.tsx`) |
| Plan generation & wizard | Engine pipeline behind the plan wizard (`plans/generate`, `plan-wizard/`, `planRouter`) |
| Plan review | Meal ingredients with gram amounts, Italian slot labels (`plans/[id]/review`) |
| Plan sharing | Resend email with macro summary + draft guard |
| Courtesy invoicing | CRUD, auto-numbering, payment methods `contanti`/`bonifico`/`sumup` (migration `024`), non-fiscal "Documento di cortesia" PDF (`src/pdf/invoice-renderer.ts:572`) |
| Documents / legal / signatures | `documentRouter`, `legalRouter`, `signatureRouter` (migrations `009`/`010`) |
| Tasks & guidance | `taskRouter`, `guidanceRouter` |
| Check-in monitoring | Token-based submission + coach **review** workflow (`checkin.ts` `batchReview`/`markReviewed`) — a review-and-flag loop, not a chat |
| GDPR erasure | `gdprRouter` + `021_gdpr_mechanism.sql` |
| Practice identity | `practiceProfileRouter` + migrations `015`/`022` (codice fiscale, albo, P.IVA on letters/invoices) |
| Notifications | Live feed, mark-as-read (`notificationRouter`) |

## Shipped — Client portal

| Feature | Notes |
|---------|-------|
| Portal login | Magic-link OTP via Supabase Auth (`/portal/login`) |
| Portal dashboard | Active plan with meals + gram amounts, check-in status, coach contact |
| Portal check-in | Public token route `/portal/checkin/[token]`, no session required |
| Urgent feedback | Portal channel to flag the coach; explicitly not a chat (migration `013`) |

## Shipped — Engine

| Area | Notes |
|------|-------|
| BMR | **Katch-McArdle preferred**; **Harris-Benedict fallback** when body composition is only a BMI guess (`src/engine/bmr.ts:30-48`) |
| Body fat | 7-site / 3-site / heuristic, with **manual override** taking priority (`src/engine/body-fat.ts:96,105`) |
| TDEE / macros | BMR + NEAT + Exercise + TEF per day-type; protein=LBM, fat=BW, carbs as remainder |
| Meal plan | Per-ingredient solver, slot-class substitutions, fibre floor/cap (combat-sport restriction, `FIBRE_RESTRICTION_CAP_G`), computed sodium |
| Model B engine | Per-day target resolution (override > weekly average > expenditure−goal); surplus is carb-led. **Merged & proven** — see Remaining for the UI |

## Shipped — Background & serverless

| Area | Notes |
|------|-------|
| Inngest | **13 registered functions** (`src/lib/inngest/functions.ts:1101`): plan/checkin/invoice/message/weight events, 6 daily scanners, delivery-outbox reconciler |
| Email | Resend branded templates (plan delivery, check-in, invoice, share, magic link) |
| Serverless PDF | `@sparticuz/chromium-min` 147.0.2 + `puppeteer-core` 24.42.0; runtime pack download on Vercel |

---

## Remaining

| Item | State | Reference |
|------|-------|-----------|
| Model B wizard UI ("Struttura settimana" rebuild) | Open — engine merged, UI is pure plumbing | `docs/polish/MODEL-B-HANDOFF.md` §B-ui |
| Plan serialization v3 (per-day grouping) | **GATED** behind a value-equivalence RED→GREEN proof (NORTHSTAR-frozen seam) | `docs/polish/MODEL-B-HANDOFF.md` §B-seam |
| Retire legacy day-type labels | Open — enum values stay readable so legacy plans decode | `docs/polish/MODEL-B-HANDOFF.md` §B-cleanup |
| Apply migrations 023 / 024 to production | Pending operator paste; `client.list` errors until applied | `DEPLOYMENT-GUIDE.md` §2.2, `docs/polish/PLAN-2026-07-21-PRODUCT-COMPLETION.md` (R2) |

---

## Deployment Requirements

See [`DEPLOYMENT-GUIDE.md`](./DEPLOYMENT-GUIDE.md) for full instructions. Summary:

- Deployed remote is **`agentarmy72-del/main`** (Vercel); `BA-AI-JM` is parity-only
- **Vercel Pro** required — PDF generation exceeds the Hobby 10s function timeout
- **Supabase Cloud** / **Inngest** / **Resend** — free tiers sufficient; Resend needs a verified domain
- 8 core environment variables + Chromium pack config (`RESEND_API_KEY` is prod-only)
- Partner record INSERT required post-migration; apply pending migrations 023/024 before go-live

---

## Runtime Verification Required

Static analysis (TypeScript, 1230 unit tests, contrast gate) is complete. Verify these against
the live instance per release — see `DEPLOYMENT-GUIDE.md` §6 for the full checklist:

- [ ] PDF generation on Vercel (Puppeteer + `@sparticuz/chromium-min` 147 pack)
- [ ] Portal magic-link email delivery (Resend)
- [ ] Inngest endpoint registration → all 13 functions discovered → runs complete
- [ ] Check-in form renders via public token URL
- [ ] Mobile hamburger sidebar on a real device
- [ ] Migrations 023/024 applied; `client.list` returns without error
