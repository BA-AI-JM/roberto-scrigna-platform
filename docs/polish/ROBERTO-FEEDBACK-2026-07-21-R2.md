# Roberto feedback — round 2 (2026-07-21, typed list via Liam)

Status: CONFIRMED + answers 2026-07-22 folded:
- R14 SIGNED (5/5 ✅) + day-level classification rule: ≥250–300 kcal step = higher class (2000/2300/2550/2800 example). Media settimanale survives as target policy.
- R8 REFRAMED BY ROBERTO: veggie portions are FIBER-DRIVEN — 10–20 g fiber per 1000 kcal, inverse to energy (low kcal → 20 end, high kcal → 10 end). Gram bounds become sanity rails only.
- R4/13 addition confirmed: NEW check-in question "Qualità dell'allenamento 0–10" (digestion 1–10 exists).
- EF4 ANSWERED: tolerance = ±5% kcal, ±10% single macronutrient (160 g protein → ±16 g).
- Logo incoming from Roberto (brand application task when the asset arrives).
- MET review: separate session after everything else (still parked). Tags: [BUG]/[CHANGE]/[NEW]/[EF]/[SHIPPED-VERIFY]/[PROD-STATE].

## Status ledger (2026-07-22) — 13 of 16 shipped

Verdict: **R1, R3–R9, R13, R16 fully shipped; R14/R15 engine core shipped, wizard UI pending; R10/R11/R12 ride the same pending Model-B wizard; R2 is a prod-SQL action, not code.** Each "shipped" row cites the commit on `polish/audit-arc-2026-07`.

| R | Status | Evidence (sha · file:line) |
|---|--------|----------------------------|
| R1 | ✅ SHIPPED | `d60350f` — `harrisBenedictBmr` at `src/engine/bmr.ts:21`; manual BF% override → Katch-McArdle + wizard field |
| R2 | ◻ PROD-STATE (no code) | Migrations 023/024 (023 created in `3d9b04d`); resolved by SQL paste on prod — verify-after only, not a code deliverable |
| R3 | ✅ SHIPPED | `245eee4` — coach reply loop → `checkin.markReviewed` + portal display + `checkin/reviewed` notify |
| R4 | ✅ SHIPPED | `245eee4` — full-detail review shows every 0–10 scale + free text (not the 4-field card) |
| R5 | ✅ SHIPPED | `d10168d` — salt = 1 g/L water at `src/engine/hydration.ts:65` (replaces flat 6.5 g) |
| R6 | ✅ SHIPPED | `d4a78df` — fibre surfaced per meal / per day |
| R7 | ✅ SHIPPED | `d4a78df` — daily macro recap line above each day's meals |
| R8 | ✅ SHIPPED | `d10168d` veg floor 100 g (`solver.ts:68` `VEG: [100, 400]` — **ceiling = 400, Roberto's number, ambiguity resolved**) + `098cfdb` fibre-driven band 10–20 g/1000 kcal inverse (`hydration.ts:34` `fibreRatePer1000`) |
| R9 | ✅ SHIPPED | `d1d1566` — peri-workout pre/intra space + explicit intra-session water |
| R10 | ◐ REMAINING | Rides Model-B wizard rebuild (B-ui); routine-prefill verify pending through the new model |
| R11 | ✅ SHIPPED / re-verify | 2-sessions/day shipped in B4 `aeaa720`; re-verify through the B-ui rebuild |
| R12 | ◐ REMAINING | Closed by the B-ui rebuild (no mode template left to wipe) — B-ui not yet shipped |
| R13 | ✅ SHIPPED | `d4a78df` — Durata/RPE column headers on session rows |
| R14 | ✅ SIGNED + engine core / UI pending | Sign-off `3a6abc3`; engine `47f93b0`+`bb97583`; wizard/seam/cleanup remaining — see `docs/polish/MODEL-B-HANDOFF.md` |
| R15 | ✅ SHIPPED (engine) / UI pending | `47f93b0` — manual per-session kcal feeds expenditure (`src/engine/exercise.ts`, bypasses ×0.85); UI wiring rides B-ui |
| R16 | ✅ SHIPPED | `d4a78df` — supplement double-assign guard + assigned item leaves the picker |
| MET | ⏸ PARKED | Operator-deferred post-fix review (structural fix = R15) |

## Nuovo cliente
| # | Tag | Item |
|---|---|---|
| R1 | NEW+EF | Manual body-fat % entry when no measurements; BMR fallback WITHOUT body comp (Harris-Benedict, his explicit ask) instead of silent BMI heuristic. (Merges his items 1+3; Florian case.) |
| R2 | PROD-STATE | "Can't find clients in search/list/plan-generation since last update" = the prod DB missing migrations 023/024 (client.list errors). NOT new work: resolved by the SQL paste / rollback. Re-verify after. |

## Monitoraggio
| R3 | NEW | Reply to a check-in: coach comment on feedback (DB column check_in.review_notes exists; wire coach UI + portal display + notification). |
| R4 | CHANGE | Feedback review shows EVERY answer (all 0-10 scales incl. stress/hunger/digestive + free text), not the 4-field summary card. |

## Macros & generatore pasti
| R5 | BUG+EF | Salt rule: 1 g salt per 1 L water; water 30–40 mL/kg BW (his exact numbers). 6.5 g/day observed = current rule wrong. |
| R6 | NEW | Fiber intake shown per meal/day (engine already tracks fibreG — surface it). |
| R7 | CHANGE | Daily macro recap line above the day's meals (in addition to the column). |
| R8 | BUG+EF | Veggie portions: min 100 g / max 500 g per meal (⚠ he also says "100–400" for green sources — confirm which); max 1–2 green sources per meal; inverse-energy scaling (less kcal → more veggies). Kills 60 g pomodorini / 2 g broccoli. |
| R9 | CHANGE | Pre/intra-workout space in the meal plan incl. water during session (peri-workout box partially exists — surface + intra water). |
| R10 | BUG | Wizard should prefill the UPDATED training routine (he edited client, wizard asked from scratch — prefill exists, verify against new-snapshot path). |
| R11 | SHIPPED-VERIFY | Two workouts per day on the generation page — B4 shipped exactly this (2ª sessione); his note likely predates the deploy. Re-verify after SQL. |
| R12 | BUG | Changing periodization mode WIPES the entered schedule/sessions (mode template overwrites). Preserve sessions + remap day types instead of reset. |
| R13 | CHANGE | Column headers (Durata min / RPE) on the week-structure session rows. |
| R14 | CHANGE+EF | NEW day-type model: OFF / 1-session / 2-session / 3-session days ONLY; drop refeed/deload/light/medium/intense/double labels; energy expenditure of the scheduled workouts determines the day's level. SUPERSEDES the four-mode tier system confirmed 3 days ago. Big design task; his sign-off on consequences needed (refeed/deload params retire). |
| R15 | CHANGE+EF | Manual kcal per workout FEEDS the calculation (replaces MET when set) — flips the current display-only override by his explicit request. |

## Integratori
| R16 | BUG | Supplement double-assign: clicking twice assigns twice; assigned items should leave the pick list. |

## Question answered in chat: the 1,626 kcal (2h BJJ + 1h weights) calculation
Formula (engine/exercise.ts + training-modality.ts): kcal = weighted MET × kg × hours × 0.85.
BJJ Classe MET 9.0 × rpeFactor(RPE7)=1.08 → 9.72; Pesi MET 3.0 (no RPE adjust).
Weighted (120'+60') = 7.48 MET → ×3 h ×0.85 ≈ 19.07 kcal/kg → 1,626 at ~85 kg. Working as
DESIGNED; design assumes the MET holds for the full duration (real 2 h classes have more
downtime). R15 (manual kcal) is the structural fix; any MET retuning is Roberto's call.
