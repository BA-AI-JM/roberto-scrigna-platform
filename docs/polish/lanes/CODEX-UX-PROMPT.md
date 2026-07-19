# TASK: Experience audit — Codex lane (code-derived)

You are the CODEX LANE of a two-lane independent experience audit. The other lane judges screenshots visually; YOU judge the experience as encoded in code. Do NOT read any `UX-AUDIT-FABLE*` or `02-DELIGHT*` file. Read `docs/polish/DELIGHT-RUBRIC.md` FIRST (personas, macro journeys, micro dims M1–M10, output schema).

## Contract
- Deliverable: write the full report to `docs/polish/lanes/UX-AUDIT-CODEX.md` following the rubric's output schema. Every finding: file:line + Deduction + concrete Fix.
- Acceptance: `test -s docs/polish/lanes/UX-AUDIT-CODEX.md`; every cited file:line opens to what you claim. Fabrication = lane failure. State explicitly at the top WHICH evidence you used (code only, or code+images).
- ALLOWED: read src/**, e2e/**, docs/polish/DELIGHT-RUBRIC.md, docs/polish/baseline-sweep/manifest.json (route inventory); grep/rg; `bunx tsc --noEmit` if needed. You may attempt to view docs/polish/baseline-sweep/*/*.png if your harness supports images — if not, say so and proceed code-only.
- PROHIBITED: build/dev/supabase/playwright runs; git mutations; installs; network; writing anything except your one report file.

## Code-derived UX evidence to mine (minimum)
1. STATES (M3): for each key page (dashboard, clients, plans list, generate wizard, review, invoices, monitoring, portal dashboard/plan/diary/progress/checkin): does the code render loading skeletons, empty states, error states, success feedback? Cite the JSX branches. List pages with missing branches.
2. IDENTITY (M1): design-token surface — tailwind.config / globals.css / CVA variants: how many hardcoded colors, is there a semantic palette, dark mode presence, font stack. Count `bg-brand` vs raw `bg-zinc-*`/hex usage as a proxy for token discipline.
3. HIERARCHY (M2): the generate wizard (1,568 lines) and review page (1,920) — how many cards/sections stack on one screen; any progressive disclosure.
4. MOTION (M4): grep transition/animate classes + any framer-motion/CSS keyframes. What happens during plan generation — is there ANY generation-wait experience (spinner? progress? nothing?). Cite.
5. COPY (M5): sample 30 user-facing strings across coach + portal: consistent Italian? tone? Any leftover English in client-facing surfaces? List with file:line.
6. MOBILE (M6): portal pages — responsive classes, tap-target sizes (h-*, p-* on buttons), fixed widths that break 390px.
7. A11Y (M9): focus-visible styles, aria-* usage count, alt texts, label associations, contrast-risky classes (zinc-400 on white etc.).
8. PERCEIVED SPEED (M10): react-query usage — optimistic updates? staleTime? suspense? debounced previews (previewWeek)?
9. EMAILS/PDF (M8): src/lib/resend templates + src/pdf renderer — visual structure quality, branding presence.
Work persona-first (P-COACH vs P-CLIENT), map findings to macro journeys 1–10, and end with "Signature-moment candidates" + "What 10/10 requires" per the rubric schema. Depth over listing: the operator's question is WHY it reads 4/10 and what to build instead.
