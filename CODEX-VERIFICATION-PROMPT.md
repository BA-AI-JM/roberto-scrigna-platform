# Codex Verification: Sport Correction Protocol

## Your Mission

You are an independent verifier. Your job is to determine whether the Sport Correction Protocol (SCP) implementation on branch `feat/sport-correction-protocol` is spec-faithful, architecturally sound, and production-ready. You have NO loyalty to the builder — you are here to find problems.

## Context

The SCP is a 10-stage pipeline that calculates exercise energy expenditure (EEE) from heart rate zone data. It lives at `src/engine/sport-correction/` (14 source files + 3 test files). It integrates into the existing `src/engine/exercise.ts` as "Method 0" — opt-in when `session.scpData` is present.

The canonical spec is: `docs/Nutrition_Planning_System_Unified_Specification_v4_4.docx` in the sibling repo `/Users/liamcann/projects/roberto-scrigna-handoff/docs/`.

## What To Verify

### 1. Arithmetic Fidelity (CRITICAL)

Trace both worked examples **by hand** through the actual code (not the tests — the tests could be wrong too):

**Spec A.5 — BJJ Mixed Class:**
- Input: male, 30y, 70kg, GRAPPLING/mixed, Tier 2
- Post-cutoff zones: <Z1=2, Z1=18, Z2=28, Z3=22, Z4=9, Z5=3 (total=82min)
- Device: 780 kcal
- Expected: Profile G (no STRENGTH override), Z1 moving (MET 1.3), HI=14.6% → E=0.82, HR model total = **342 kcal**, device correction = 0.44
- Stage 6b should NOT trigger (not STRENGTH category)

**Spec A.7 — Hypertrophy:**
- Input: male, 34y, 82kg, STRENGTH/hypertrophy, Tier 2
- Post-cutoff zones: <Z1=21, Z1=25, Z2=12, Z3=5, Z4=2, Z5=0 (total=65min)
- Device: 410 kcal
- Expected: Profile G + STRENGTH conservative override (Z3-Z5 capped at 5.0 net), Z1 standing (MET 1.0), HI=3.1% → E=0.78, HR model = **128 kcal**, benchmark = **182 kcal** (with E applied), midpoint = **155 kcal**, device correction = 0.38
- Stage 6b trigger: (belowZ1+Z1)/active = (21+25)/65 = 70.8% ≥ 50% ✓

For each stage, read the actual code function, compute the value yourself, and compare. Report any divergence.

### 2. Spec Divergence Hunt

Read the spec sections covering:
- Stage 6 MET assignment (Profile G/L/CYCLIC, caps, net rules)
- Stage 6b (trigger criteria, benchmark formula, blend rule)
- Stage 7 (efficiency factor E)
- Stage 4 (below-Z1 classification Options A-E)
- Stage 5 (Z1 character — standing vs moving)

For each, ask: **does the code match the spec exactly?** Known documented divergence: Stage 7 uses a formula for HI<10% instead of the table value 0.87 — this is documented and intentional (the worked example gives 0.78, contradicting the table).

Flag anything else that doesn't match.

### 3. Architecture Smells

- Are there any circular imports?
- Is the pipeline order in `index.ts` correct? (Stage 6 must come before 4 and 5 because they depend on the profile; Stage 7 must come before 8; Stage 6b must come after 8)
- Does the `runBenchmark` signature match how it's called in `index.ts`? (Check parameter count and order)
- Is the CYCLIC E=1.0 path actually unreachable in Stage 6b? (CYCLIC is never STRENGTH, so the benchmark should never trigger for CYCLIC — verify this)
- Does `exercise.ts` correctly fall through when SCP returns null?

### 4. Type Safety

- Does `SCPInput.categoryId` accept all 8 categories?
- Can the `SessionType` union ever produce a value that has no profile in `getSportProfile`?
- Is `scpData` properly typed on `ExerciseSession`?

### 5. Edge Cases

- What happens if ALL zone minutes are 0?
- What happens if `totalRecordedMin` is less than the sum of zone minutes?
- What happens if `weightKg` is 0? (Division by zero in constant?)
- What happens for a STRENGTH/circuit session with HI=12%? (E should be 0.82, benchmark MET should be 5.0)

### 6. Integration Safety

- Does the existing test suite still pass? (`bun test` — expect 379/383, 4 pre-existing Playwright failures)
- Does `bun run build` succeed?
- Is the SCP truly opt-in? (i.e., if no `scpData` is present on a session, does the existing Keytel path run unchanged with the 0.85 factor?)

## How To Report

Score each axis 1-10:

| Axis | Score | Evidence |
|------|-------|----------|
| Arithmetic fidelity (A.5) | ? | [your trace] |
| Arithmetic fidelity (A.7) | ? | [your trace] |
| Spec compliance | ? | [divergences found] |
| Architecture | ? | [smells found] |
| Type safety | ? | [issues found] |
| Edge case handling | ? | [failures found] |
| Integration safety | ? | [test results] |
| **Overall** | ? | |

If overall < 8, list exactly what needs fixing before merge.
If overall ≥ 8, state "PASS — ready to merge" with any non-blocking notes.

## Commands

```bash
cd /Users/liamcann/projects/roberto-scrigna
git checkout feat/sport-correction-protocol
bun test
bun run build
```

The spec docx can be extracted with:
```python
import zipfile, xml.etree.ElementTree as ET
z = zipfile.ZipFile('/Users/liamcann/projects/roberto-scrigna-handoff/docs/Nutrition_Planning_System_Unified_Specification_v4_4.docx')
xml_content = z.read('word/document.xml')
tree = ET.fromstring(xml_content)
texts = []
for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    t = ''.join(node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text)
    if t.strip(): texts.append(t)
full = '\n'.join(texts)
```

Search for "Priority 3: Sport Correction Protocol" for Stage 0-10 definitions.
Search for "APPENDIX A" for worked examples A.5 and A.7.
