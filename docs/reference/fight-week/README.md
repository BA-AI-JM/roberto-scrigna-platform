# Fight-week reference material

Two of Roberto's real Acute Weight Manipulation protocols, received 2026-07-21 for the
Fight-Week module (product plan section E). **Reference material, not like-for-like
specs** — the module's TEMPLATE MODEL (docs/polish/PLAN-2026-07-21-PRODUCT-COMPLETION.md
§E) is what gets built; per-athlete values are always Roberto's, typed or confirmed by
him. The app computes only arithmetic (countdowns, rehydration totals from the entered
cut, the ÷3 refuel helper) — never cut values (NORTHSTAR/EF).

| File | What it is |
|---|---|
| `Acute-Weight-Manipulation-Protocol.docx` | Source of Model 1 §3's example: flat 2100-kcal days, −7→weigh-in table, the ÷3 post-weigh-in rule ("INS": deficit ÷ 3 → 2/3 liquids + 1/3 dense food) |
| `Acute-Weight-Manipulation-Protocol-EN.txt` | Second worked case: per-day boxing schedule ("BOXING 40' @8"), per-day fibre bounds, 2400→1800 kcal taper, refuel macro RANGES (P 120–150 / F 50–70 / C 650–800 / fibre <20 per 24h), carbohydrate mouth-rinse protocol |

## Variances between the two (why the template has fields, not constants)

- Fluid replacement post-weigh-in: both use 150% of cut here; Model 1's older text
  said 120–150% → coefficient is editable, default 150.
- Water values: single ("3.5L"), range ("5–6L"), or sub-litre ("500mL–1L").
- Fibre: explicit per-day bounds in the EN.txt, absent in the docx.
- Sample meal days: present per-day in both but with different structures → free-text
  meal template per day, not a structured schema.
- Weigh-in-time dependency: day −1 changes shape with morning vs afternoon weigh-in
  (EN.txt "**" note) → early/late flag on the protocol.
