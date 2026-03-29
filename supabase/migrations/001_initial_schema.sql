-- Roberto Scrigna Platform: Initial Database Schema
-- Batch 2 — Supabase migration
--
-- Tables: Client, ClientSnapshot, Plan, TrainingLog, CheckIn,
--         SupplementProtocol, SupplementItem, GuidanceBlock, Document,
--         Invoice, Partner, Notification, Task, Message, DiaryEntry, ExampleMeal
--
-- Conventions:
-- - UUIDs as primary keys (gen_random_uuid())
-- - Soft deletes (deleted_at)
-- - Audit columns (created_at, updated_at)
-- - snake_case naming
-- - RLS enabled on all tables

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Partner (Coach / Admin) ───────────────────────────────────────────────────

CREATE TABLE partner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL, -- links to Supabase auth.users
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('coach', 'admin', 'assistant')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ── Client ────────────────────────────────────────────────────────────────────

CREATE TABLE client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE, -- nullable: client may not have login yet
  partner_id UUID NOT NULL REFERENCES partner(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  sex TEXT CHECK (sex IN ('male', 'female')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_client_partner ON client(partner_id);
CREATE INDEX idx_client_status ON client(status) WHERE deleted_at IS NULL;

-- ── Client Snapshot (point-in-time measurements) ──────────────────────────────

CREATE TABLE client_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Basic measurements
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,1),
  age_years INTEGER,

  -- Body composition
  body_fat_pct NUMERIC(4,1),
  body_fat_method TEXT CHECK (body_fat_method IN ('7site', '3site', 'heuristic', 'override', 'dexa', 'bioimpedance')),

  -- Skinfold data (JSON for flexibility)
  skinfold_data JSONB,

  -- Activity
  daily_steps INTEGER,
  occupational_level TEXT CHECK (occupational_level IN ('sedentary', 'light', 'moderate', 'heavy', 'very_heavy')),

  -- Training schedule (7-element array: Mon-Sun)
  week_schedule TEXT[] CHECK (array_length(week_schedule, 1) = 7),

  -- Calculated values (denormalized for historical reference)
  bmr_kcal INTEGER,
  lean_mass_kg NUMERIC(5,2),
  fat_mass_kg NUMERIC(5,2),

  -- Photos
  photo_front_url TEXT,
  photo_side_url TEXT,
  photo_back_url TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshot_client ON client_snapshot(client_id);
CREATE INDEX idx_snapshot_taken ON client_snapshot(client_id, taken_at DESC);

-- ── Plan (nutrition plan per client) ──────────────────────────────────────────

CREATE TABLE plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  snapshot_id UUID REFERENCES client_snapshot(id),
  partner_id UUID NOT NULL REFERENCES partner(id),

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date DATE,
  end_date DATE,

  -- TDEE & macro targets per day type (JSONB for flexibility)
  -- Structure: { training: { tdee, protein, fat, carbs, ... }, rest: { ... }, ... }
  daily_targets JSONB NOT NULL DEFAULT '{}',

  -- Hydration
  water_ml_training INTEGER,
  water_ml_rest INTEGER,
  salt_g_training NUMERIC(3,1),
  salt_g_rest NUMERIC(3,1),

  -- Meal structure
  meals_per_day INTEGER DEFAULT 4,
  meal_distribution JSONB, -- e.g. { "breakfast": 0.25, "lunch": 0.35, ... }

  -- Configuration
  diet_emphasis TEXT CHECK (diet_emphasis IN ('high_protein', 'mixed', 'high_fat')),
  exercise_session JSONB, -- serialized ExerciseSession

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_plan_client ON plan(client_id);
CREATE INDEX idx_plan_status ON plan(status) WHERE deleted_at IS NULL;

-- ── Training Log ──────────────────────────────────────────────────────────────

CREATE TABLE training_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  plan_id UUID REFERENCES plan(id),

  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  day_type TEXT NOT NULL CHECK (day_type IN ('training', 'rest', 'refeed', 'deload')),

  -- Exercise data
  exercise_method TEXT CHECK (exercise_method IN ('heart_rate', 'met_value', 'session_estimate', 'default_estimate')),
  duration_min INTEGER,
  avg_heart_rate INTEGER,
  met_value NUMERIC(4,1),
  kcal_estimated INTEGER,
  kcal_calculated INTEGER,

  -- Steps
  steps INTEGER,

  -- Adherence
  training_notes TEXT,
  rpe NUMERIC(3,1), -- Rate of Perceived Exertion (1-10)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_log_client ON training_log(client_id);
CREATE INDEX idx_training_log_date ON training_log(client_id, logged_at DESC);

-- ── Check-In ──────────────────────────────────────────────────────────────────

CREATE TABLE check_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  plan_id UUID REFERENCES plan(id),

  check_in_date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  body_fat_pct NUMERIC(4,1),

  -- Subjective markers
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10),
  hunger_level INTEGER CHECK (hunger_level BETWEEN 1 AND 10),
  digestion INTEGER CHECK (digestion BETWEEN 1 AND 10),

  -- Adherence
  nutrition_adherence INTEGER CHECK (nutrition_adherence BETWEEN 0 AND 100),
  training_adherence INTEGER CHECK (training_adherence BETWEEN 0 AND 100),
  supplement_adherence INTEGER CHECK (supplement_adherence BETWEEN 0 AND 100),

  -- Photos
  photo_front_url TEXT,
  photo_side_url TEXT,
  photo_back_url TEXT,

  client_notes TEXT,
  coach_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkin_client ON check_in(client_id);
CREATE INDEX idx_checkin_date ON check_in(client_id, check_in_date DESC);

-- ── Supplement Protocol ───────────────────────────────────────────────────────

CREATE TABLE supplement_protocol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plan(id),
  name TEXT NOT NULL DEFAULT 'Default Protocol',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplement_protocol_plan ON supplement_protocol(plan_id);

-- ── Supplement Item ───────────────────────────────────────────────────────────

CREATE TABLE supplement_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES supplement_protocol(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL, -- e.g. "5g", "1000IU"
  timing TEXT, -- e.g. "morning", "pre-workout", "with meal"
  frequency TEXT NOT NULL DEFAULT 'daily', -- e.g. "daily", "training_days", "3x_week"
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplement_item_protocol ON supplement_item(protocol_id);

-- ── Guidance Block (reusable coaching content) ────────────────────────────────

CREATE TABLE guidance_block (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown content
  category TEXT, -- e.g. "nutrition", "training", "recovery", "mindset"
  tags TEXT[] DEFAULT '{}',
  is_template BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_guidance_partner ON guidance_block(partner_id);
CREATE INDEX idx_guidance_category ON guidance_block(category) WHERE deleted_at IS NULL;

-- ── Document (generated PDFs, exports) ────────────────────────────────────────

CREATE TABLE document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES client(id),
  plan_id UUID REFERENCES plan(id),
  partner_id UUID NOT NULL REFERENCES partner(id),

  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('meal_plan', 'supplement_plan', 'check_in_report', 'progress_report', 'invoice', 'other')),
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_document_client ON document(client_id);
CREATE INDEX idx_document_plan ON document(plan_id);

-- ── Invoice ───────────────────────────────────────────────────────────────────

CREATE TABLE invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),

  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  amount_cents INTEGER NOT NULL, -- store in cents to avoid float issues
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_pct NUMERIC(4,2) DEFAULT 0,

  issued_date DATE,
  due_date DATE,
  paid_date DATE,

  description TEXT,
  line_items JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_invoice_client ON invoice(client_id);
CREATE INDEX idx_invoice_status ON invoice(status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_invoice_number ON invoice(invoice_number) WHERE deleted_at IS NULL;

-- ── Notification ──────────────────────────────────────────────────────────────

CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL, -- can be partner or client auth_user_id
  sender_id UUID, -- null for system notifications

  title TEXT NOT NULL,
  body TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('check_in_due', 'plan_ready', 'message', 'payment', 'system', 'reminder')),
  action_url TEXT,

  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_recipient ON notification(recipient_id, is_read);
CREATE INDEX idx_notification_created ON notification(recipient_id, created_at DESC);

-- ── Task ──────────────────────────────────────────────────────────────────────

CREATE TABLE task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),
  client_id UUID REFERENCES client(id),

  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_task_partner ON task(partner_id);
CREATE INDEX idx_task_status ON task(partner_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_client ON task(client_id) WHERE client_id IS NOT NULL;

-- ── Message ───────────────────────────────────────────────────────────────────

CREATE TABLE message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('coach', 'client', 'system')),
  sender_id UUID, -- partner_id or client auth_user_id

  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]', -- array of { url, filename, mime_type }

  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_client ON message(client_id, created_at DESC);
CREATE INDEX idx_message_unread ON message(client_id, is_read) WHERE is_read = false;

-- ── Diary Entry (client food/activity diary) ──────────────────────────────────

CREATE TABLE diary_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  plan_id UUID REFERENCES plan(id),

  entry_date DATE NOT NULL,
  meal_slot TEXT, -- e.g. "breakfast", "lunch", "snack_1", "dinner"

  -- What was consumed
  food_items JSONB NOT NULL DEFAULT '[]', -- array of { food_id, name, grams, kcal, protein, carbs, fat }

  -- Totals for this entry
  total_kcal NUMERIC(7,1),
  total_protein_g NUMERIC(6,1),
  total_carbs_g NUMERIC(6,1),
  total_fat_g NUMERIC(6,1),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diary_client ON diary_entry(client_id);
CREATE INDEX idx_diary_date ON diary_entry(client_id, entry_date DESC);

-- ── Example Meal (template meals for plan generation) ─────────────────────────

CREATE TABLE example_meal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),

  name TEXT NOT NULL,
  description TEXT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout')),

  -- Macro profile per serving
  kcal_per_serving NUMERIC(7,1) NOT NULL,
  protein_g NUMERIC(6,1) NOT NULL,
  carbs_g NUMERIC(6,1) NOT NULL,
  fat_g NUMERIC(6,1) NOT NULL,

  -- Ingredients (for scaling)
  ingredients JSONB NOT NULL DEFAULT '[]', -- array of { food_id, name, grams }

  -- Filtering
  tags TEXT[] DEFAULT '{}', -- e.g. ["high_protein", "low_fat", "vegetarian"]
  allergens TEXT[] DEFAULT '{}', -- e.g. ["gluten", "dairy", "nuts"]
  is_active BOOLEAN NOT NULL DEFAULT true,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_example_meal_partner ON example_meal(partner_id);
CREATE INDEX idx_example_meal_type ON example_meal(meal_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_example_meal_tags ON example_meal USING GIN(tags) WHERE deleted_at IS NULL;
CREATE INDEX idx_example_meal_allergens ON example_meal USING GIN(allergens) WHERE deleted_at IS NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_protocol ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
ALTER TABLE message ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_meal ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: Partner access ──────────────────────────────────────────────
-- Partners can see their own data and their clients' data.

-- Partner: can read own record
CREATE POLICY partner_self ON partner
  FOR ALL USING (auth_user_id = auth.uid());

-- Client: partner can manage their clients
CREATE POLICY client_partner_access ON client
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Client Snapshot: via client → partner
CREATE POLICY snapshot_partner_access ON client_snapshot
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Plan: partner owns plans
CREATE POLICY plan_partner_access ON plan
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Training Log: via client → partner
CREATE POLICY training_log_partner_access ON training_log
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Check-In: via client → partner
CREATE POLICY checkin_partner_access ON check_in
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Supplement Protocol: via plan → partner
CREATE POLICY supplement_protocol_partner_access ON supplement_protocol
  FOR ALL USING (
    plan_id IN (
      SELECT id FROM plan WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Supplement Item: via protocol → plan → partner
CREATE POLICY supplement_item_partner_access ON supplement_item
  FOR ALL USING (
    protocol_id IN (
      SELECT id FROM supplement_protocol WHERE plan_id IN (
        SELECT id FROM plan WHERE partner_id IN (
          SELECT id FROM partner WHERE auth_user_id = auth.uid()
        )
      )
    )
  );

-- Guidance Block: partner owns
CREATE POLICY guidance_partner_access ON guidance_block
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Document: partner owns
CREATE POLICY document_partner_access ON document
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Invoice: partner owns
CREATE POLICY invoice_partner_access ON invoice
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Notification: recipient can see own
CREATE POLICY notification_recipient ON notification
  FOR ALL USING (recipient_id = auth.uid());

-- Task: partner owns
CREATE POLICY task_partner_access ON task
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Message: via client → partner
CREATE POLICY message_partner_access ON message
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Diary Entry: via client → partner
CREATE POLICY diary_partner_access ON diary_entry
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Example Meal: partner owns
CREATE POLICY example_meal_partner_access ON example_meal
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- ── Updated At Trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'partner', 'client', 'client_snapshot', 'plan', 'training_log',
      'check_in', 'supplement_protocol', 'supplement_item', 'guidance_block',
      'document', 'invoice', 'task', 'diary_entry', 'example_meal'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
