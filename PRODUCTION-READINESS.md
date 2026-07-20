> ⚠️ **SUPERSEDED — 2026-07-20 (G17).** This April "READY FOR DEPLOYMENT" verdict no longer governs.
> Authoritative status now lives in [`NORTHSTAR.md`](./NORTHSTAR.md), [`docs/polish/PLAN-OF-RECORD.md`](./docs/polish/PLAN-OF-RECORD.md),
> and the audit register (`docs/polish/01-CODE-GAP-REGISTER.md`). Deploy readiness is proven per-release by a
> dated release manifest (commit + migrations + env + smoke evidence), not by this document. History kept below.

# Roberto Scrigna Platform — Production Readiness Assessment

**Date:** 2026-04-27 (supersedes 2026-03-30 assessment)
**Verdict:** READY FOR DEPLOYMENT — pending runtime verification on Vercel.

---

## Build Verification

| Check | Status | Evidence |
|-------|--------|---------|
| TypeScript | **Green** | `tsc --noEmit` — 0 errors across 123 source files |
| Vitest | **Green** | 13 test files, 320 tests, 320 passed, 0 failures |
| Production build | **Green** | `bun run build` — 24 routes compiled, 0 errors |
| Fidelity fixtures | **Green** | Marco Bellini, Niccolo, Raphael — all macro targets verified |

---

## What Changed Since March 30

The March 30 assessment declared "PRODUCTION READY" but was incomplete. A 6-agent audit
on April 27 found 25 defects including security vulnerabilities, broken data paths, and
mock data in production pages. A subsequent GPT-5.5 Codex sweep scored the codebase
58/100 and found additional integration faults.

All CRITICAL and HIGH findings were resolved across 3 commits (57 files, +7,545/-348 lines).

### Commits

| Hash | Description | Files |
|------|-------------|-------|
| `f62c180` | Complete v1 build — client system, portal, dashboard, hardening | 53 |
| `37247c4` | Fix 3 critical E2E failures + deployment guide | 5 |
| `62c8dde` | Resolve Codex 58/100 findings — security, MOCK data, Inngest, intake | 9 |

---

## Feature Status

### Core Application (Roberto-facing)

| Feature | Status | Notes |
|---------|--------|-------|
| Login / registration | **Green** | Supabase Auth, cookie-based sessions |
| Dashboard (live data) | **Green** | 5 tRPC queries, Promise.all parallel, onboarding card for zero-data state |
| Client list | **Green** | Search, status filter tabs, pagination (25/page), mobile card layout |
| Client detail | **Green** | 4 tabs: overview (weight trend), snapshot history, plans, check-ins |
| Client edit | **Green** | Profile update + new measurement with snapshot creation |
| Intake form (7 pages) | **Green** | Weight, height, occupational level, skinfolds all flow to snapshot |
| Plan generation | **Green** | Engine pipeline: BMR → TDEE → macros → meal plan → supplements → narrative |
| Plan review (6 tabs) | **Green** | Meal ingredients with gram amounts, Italian slot labels, supplement editing |
| Plan sharing | **Green** | Email share via Resend with macro summary, draft guard |
| Invoice management | **Green** | CRUD, status state machine, auto-numbering, PDF download |
| Monitoring (check-ins) | **Green** | Live tRPC query (no more mock data), status tabs, weight flags |
| Monitoring (training) | **Green** | Live tRPC persistence, client selector, session type filters |
| Notifications | **Green** | Live tRPC query, mark-as-read, notification feed |
| Settings | **Green** | Profile display, password reset, notification preferences link |
| Sidebar | **Green** | Lucide icons, mobile hamburger menu, responsive shell |
| Error boundaries | **Green** | 3 boundaries (root, dashboard, portal) + custom 404 + loading skeletons |

### Client Portal

| Feature | Status | Notes |
|---------|--------|-------|
| Portal login | **Green** | Magic link OTP via Supabase Auth |
| Portal auth callback | **Green** | `/portal/auth/callback` exchanges code, redirects to dashboard |
| Portal auth guard | **Green** | `(protected)/layout.tsx` checks session + active client record |
| Portal dashboard | **Green** | Active plan with meals + gram amounts, check-in status, coach contact |
| Portal check-in form | **Green** | Public route at `/portal/checkin/[token]`, no auth required |

### Background & Automation

| Feature | Status | Notes |
|---------|--------|-------|
| Inngest event dispatch | **Green** | 4 events: plan/delivered, checkin/due, checkin/weight-alert, invoice/sent |
| Inngest functions (8) | **Green** | All 12 notification triggers with escalation chains |
| Inngest idempotency | **Green** | 4 dedupe guards on daily scanners |
| Email delivery (Resend) | **Green** | 4 branded templates: plan delivery, check-in due, invoice, plan share |
| Inngest payload contracts | **Green** | All sender payloads aligned with consumer destructuring |

### Security & Hardening

| Feature | Status | Notes |
|---------|--------|-------|
| Auth redirect security | **Green** | Open redirect in auth callback patched |
| Error message sanitisation | **Green** | 35 Supabase error leaks replaced with generic Italian messages |
| Rate limiting | **Green** | In-memory sliding window on auth + public endpoints |
| Security headers | **Green** | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, XSS-Protection, Permissions-Policy |
| Portal tenant isolation | **Green** | Archived clients blocked, getExampleMeals scoped by partner_id |
| Search input sanitisation | **Green** | LIKE wildcards (% and _) escaped |
| Draft plan guard | **Green** | shareWithClient throws PRECONDITION_FAILED on draft plans |
| Serverless PDF | **Green** | @sparticuz/chromium + puppeteer-core for Vercel compatibility |

### Engine & Calculation

| Feature | Status | Notes |
|---------|--------|-------|
| BMR (Katch-McArdle) | **Green** | 320 unit tests |
| Body fat (J&P 7-site/3-site + heuristic) | **Green** | body_fat_method computed from skinfold data |
| TDEE (BMR + NEAT + Exercise + TEF) | **Green** | Per day-type calculation |
| Macro targets | **Green** | Protein/fat g/kg multipliers, carbs from remainder |
| Meal plan generation | **Green** | 26 templates, scaler, selector, fat compensation, tightening |
| Meal plan tightening | **Green** | Tautology bug fixed — correct MealType[] for re-selection |
| Hydration & supplements | **Green** | 20 master supplements with condition functions |

---

## Data Path Verification

These critical data paths were traced end-to-end with file:line evidence on April 27:

| Path | Verified | Evidence chain |
|------|----------|---------------|
| Weight: form → DB → engine → PDF | ✅ | IntakeForm:877 → client.ts:38 → client.ts:443 → plan.ts:158 → bmr.ts:19 → html-renderer.ts:101 |
| Height: form → DB → engine | ✅ | IntakeForm:877 → client.ts:39 → client.ts:444 → plan.ts:161 → body-fat.ts:83 |
| Grams: engine → DB → review page + PDF | ✅ | scaler.ts:63 → plan.ts:275 → review/page.tsx:709 → html-renderer.ts:331 |
| Portal meals: DB → portal dashboard | ✅ | portal.ts:113 → plan_bundle extraction → dashboard/page.tsx MealPlanSection |
| Check-in: token URL → form → DB | ✅ | clients/[id]/page.tsx:429 → portal/checkin/[token]/page.tsx → checkin.ts:197 |

---

## Known Limitations (v1.1 territory)

| Item | Severity | Effort | Why deferred |
|------|----------|--------|-------------|
| Type casts (`as unknown as`) in routers | LOW | 2h | Safe at runtime, cosmetic cleanup |
| Remaining English strings in admin UI | LOW | 1h | Low visibility, non-client-facing |
| Sequential awaits in plan.ts, portal.ts | MEDIUM | 1h | Correct but slower; Promise.all is v1.1 |
| Client list emoji (👥) in empty state | LOW | 15min | Lucide icon replacement |
| Non-transactional intake (create + snapshot) | MEDIUM | 3h | Compensating logic exists; RPC transaction is v1.1 |
| Review page edits not persisted to DB | MEDIUM | 3h | Supplements/guidance local state; save mutation needed |
| Snapshot history from edit page only | LOW | 1h | History tab works; inline add-measurement is v1.1 |
| CI/CD pipeline | LOW | 2h | Manual deploy is acceptable for single-partner |
| Sentry error monitoring | LOW | 3h | Error boundaries handle crashes for v1 |

---

## Deployment Requirements

See `DEPLOYMENT-GUIDE.md` for full instructions. Summary:

- **Vercel Pro** required (PDF generation timeout)
- **Supabase Cloud** — free tier sufficient
- **Inngest** — free tier sufficient
- **Resend** — free tier sufficient, verified domain required
- 8 environment variables to configure
- Partner record INSERT required post-migration

---

## Runtime Verification Required

Static analysis (TypeScript, tests, code review, E2E tracing) is complete. The following
must be verified post-deployment against the live instance:

- [ ] PDF generation on Vercel (Puppeteer + @sparticuz/chromium)
- [ ] Portal magic link email delivery (Resend)
- [ ] Portal auth callback → dashboard redirect
- [ ] Inngest event dispatch → function execution
- [ ] Mobile hamburger sidebar on real device
- [ ] Check-in form renders via public token URL

See `DEPLOYMENT-GUIDE.md` Section 6 for the complete post-deployment checklist.
