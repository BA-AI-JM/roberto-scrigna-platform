# Meta-prompted exercise pass — findings

**Target:** production (`https://www.scrignanutrition.app`), merged `main` @ `6ac2aed`
(PR stack #58/#59/#60/#56).
**Method:** `e2e/exercise-pass.spec.ts` derives coverage from the app's own route map
(`src/app/**`) and, per page, the interactive elements the DOM renders. Each route is
asserted **healthy**: no uncaught JS exception (React crash), no error-boundary text, no
5xx; guarded routes must redirect cleanly to a login screen. Run in **native Italian**
(no page-translation — Chrome auto-translate triggers a `NotFoundError` reconciliation
crash that is *not* an app bug).

**Result: 37 / 37 reachable-surface checks pass — clean bill. 0 broken interactions, 0
crashes, 0 console errors, 0 error boundaries, 0 5xx.** 11 authenticated coach checks
skipped (need an operator session — see split).

## Coverage split (what could be exercised headless vs what needs auth)

| Surface | Auth | Exercised | Result |
|---|---|---|---|
| `/login` (coach) | none | ✅ load, password-form enable gate, "Password dimenticata?" toggle, console | healthy |
| `/register` (coach) | none | ✅ load, health | healthy |
| `/portal/login` (patient) | none | ✅ load, magic-link enable gate, console | healthy |
| `/portal` (landing) | none | ✅ redirects → `/portal/login` | healthy |
| 11 coach `(dashboard)/*` routes | needs coach session | ✅ **unauth redirect** → `/login` | clean redirect, no crash |
| 7 patient `portal/(protected)/*` routes | needs patient session | ✅ **unauth redirect** → `/portal/login` | clean redirect, no crash |
| 6 dynamic `[id]` routes (dummy id) | needs coach session | ✅ unauth redirect → login | clean redirect, no crash |
| 7 token / e2e-harness routes | mixed | ✅ probed (see finding #1) | no crash |
| **11 coach dashboard interactions** | **coach password** | ⛔ **skipped — needs operator** | — |
| **patient portal interactions** | **patient magic-link (inbox)** | ⛔ **not reachable headless** | — |

**Why the authed surfaces need an operator:** the coach app authenticates with **email +
password** (`/login`), the patient app with a **magic-link emailed to the patient**
(`/portal/login`). Neither can be established headless without real credentials / the
patient inbox. The spec ships an **env-gated coach block** — pass `COACH_EMAIL` /
`COACH_PASSWORD` (real coach creds) and the 11 coach-dashboard routes are exercised
read-only (navigation + control enumeration, no destructive clicks). Patient coverage
would need a magic-link captured from the patient inbox.

## Findings

### 1. (Minor / cosmetic) Two e2e-harness routes return HTTP 200 with a branded-404 body
`/portal/feedback-e2e` and `/portal/firma-e2e/[requestId]` return **HTTP 200** while
rendering the branded "404 — Pagina non trovata" page (the harness is correctly gated off
in prod via `notFound()`, so **no functionality is exposed**). By contrast `/kcal-e2e` and
`/reminder-e2e/[clientId]` return a true **404**. The inconsistency is a status-code nit
(SEO / correctness), **not** a functional or security issue — the harness content is not
reachable in production. Suggest making the two portal harness routes hard-404 in prod for
consistency, or leave as-is (no user impact).

### Everything else: clean
- All guarded routes redirect to the correct login screen unauthenticated — no guarded
  content leaks, no crash, no 500.
- Real signing route `/portal/firma/[id]` and coach `/monitoring/checkin/[id]` correctly
  redirect to login; patient `/portal/checkin/[id]` renders (token-gated public check-in,
  by design).
- Form gating works: coach "Accedi" and patient "Invia link di accesso" stay disabled
  until valid input, then enable. "Password dimenticata?" is a live control.
- Zero console errors across every reachable page.

## Run it

```bash
# public + guarded + harness coverage against prod (default)
BASE_URL=https://www.scrignanutrition.app npx playwright test --config playwright.exercise.config.ts

# against a local dev server
BASE_URL=http://localhost:3100 npx playwright test --config playwright.exercise.config.ts

# unlock the authenticated coach-dashboard block (read-only)
COACH_EMAIL=… COACH_PASSWORD=… BASE_URL=… npx playwright test --config playwright.exercise.config.ts
```
