# Roberto feedback — round 2 (2026-07-21, typed list via Liam)

Status: AWAITING confirmation. Tags: [BUG]/[CHANGE]/[NEW]/[EF]/[SHIPPED-VERIFY]/[PROD-STATE].

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
