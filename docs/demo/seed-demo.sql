-- Demo seed: three realistic diary entries for Niccolò Ambrosi on 2026-07-20.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING. Additive only — never touches
-- the pre-existing demo state (active plan, check-ins, snapshot).
-- food_items shape mirrors portal.addDiaryEntry / DiaryEntryList:
--   [{name, grams, kcal, protein, carbs, fat}]

INSERT INTO diary_entry (id, client_id, plan_id, entry_date, meal_slot, food_items,
  total_kcal, total_protein_g, total_carbs_g, total_fat_g, notes)
VALUES
(
  'd1a10000-0000-4000-8000-000000000001',
  '9dacdf1b-a9b2-4881-8049-f241ebea53ec',
  '793a9bac-0e75-47c0-909f-3c4df552a4fc',
  '2026-07-20',
  'breakfast',
  '[{"name":"Fiocchi d''avena","grams":80,"kcal":304,"protein":10.8,"carbs":53.2,"fat":5.6},
    {"name":"Albume d''uovo","grams":200,"kcal":104,"protein":21.8,"carbs":1.4,"fat":0.4},
    {"name":"Banana","grams":120,"kcal":107,"protein":1.3,"carbs":27.4,"fat":0.4},
    {"name":"Mirtilli","grams":50,"kcal":29,"protein":0.4,"carbs":7.3,"fat":0.2}]'::jsonb,
  544, 34.3, 89.3, 6.6,
  'Colazione come da piano, prima della sessione.'
),
(
  'd1a10000-0000-4000-8000-000000000002',
  '9dacdf1b-a9b2-4881-8049-f241ebea53ec',
  '793a9bac-0e75-47c0-909f-3c4df552a4fc',
  '2026-07-20',
  'lunch',
  '[{"name":"Riso basmati","grams":100,"kcal":349,"protein":8.1,"carbs":77.5,"fat":1.1},
    {"name":"Petto di pollo","grams":180,"kcal":198,"protein":41.4,"carbs":0,"fat":3.6},
    {"name":"Zucchine grigliate","grams":200,"kcal":34,"protein":2.6,"carbs":6.2,"fat":0.6},
    {"name":"Olio extravergine d''oliva","grams":10,"kcal":90,"protein":0,"carbs":0,"fat":10}]'::jsonb,
  671, 52.1, 83.7, 15.3,
  NULL
),
(
  'd1a10000-0000-4000-8000-000000000003',
  '9dacdf1b-a9b2-4881-8049-f241ebea53ec',
  '793a9bac-0e75-47c0-909f-3c4df552a4fc',
  '2026-07-20',
  'post_workout',
  '[{"name":"Yogurt greco 0%","grams":170,"kcal":97,"protein":17.3,"carbs":6.1,"fat":0.3},
    {"name":"Mandorle","grams":20,"kcal":116,"protein":4.2,"carbs":4.4,"fat":10.0},
    {"name":"Miele","grams":10,"kcal":30,"protein":0,"carbs":8.1,"fat":0}]'::jsonb,
  243, 21.5, 18.6, 10.3,
  'Dopo la sessione di forza.'
)
ON CONFLICT (id) DO NOTHING;

-- Backdated weight snapshots matching the completed check-ins (13 lug 92.0,
-- 19 lug 91.7) so the portal "Progressi" chart — which plots client_snapshot
-- rows only — shows the real descending trend, consistent with check-in facts.
INSERT INTO client_snapshot (id, client_id, taken_at, weight_kg, notes)
VALUES
('d1a20000-0000-4000-8000-000000000001',
 '9dacdf1b-a9b2-4881-8049-f241ebea53ec',
 '2026-07-13 08:30:00+02', 92.0, 'Check-in settimanale'),
('d1a20000-0000-4000-8000-000000000002',
 '9dacdf1b-a9b2-4881-8049-f241ebea53ec',
 '2026-07-19 08:30:00+02', 91.7, 'Check-in settimanale')
ON CONFLICT (id) DO NOTHING;
