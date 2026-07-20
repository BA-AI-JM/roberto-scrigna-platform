-- apply-pending.sql
-- Generated 2026-07-20T10:15:20.122Z; paste the entire bundle into Supabase SQL Editor.
-- Each migration is atomic and skipped when its filename is already ledgered.

-- Bootstrap only: migration 018 remains the source of record and performs backfill.
CREATE TABLE IF NOT EXISTS schema_migrations_applied (
  filename TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);
ALTER TABLE schema_migrations_applied ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON schema_migrations_applied;
CREATE POLICY schema_migrations_applied_service_role_only
  ON schema_migrations_applied FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 001_initial_schema.sql
DO $migration_guard_0$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '001_initial_schema.sql'
  ) THEN
    EXECUTE $migration_statement_0_0$
-- Roberto Scrigna Platform: Initial Database Schema
-- Reconciled with all tRPC routers and Inngest functions
--
-- Tables: Partner, Client, ClientSnapshot, Plan, TrainingLog, CheckIn,
--         CheckInToken, SupplementProtocol, SupplementItem, GuidanceBlock,
--         Document, Invoice, Notification, NotificationSettings, Task,
--         Message, DiaryEntry, ExampleMeal
--
-- Conventions:
-- - UUIDs as primary keys (gen_random_uuid())
-- - Soft deletes (deleted_at) where applicable
-- - Audit columns (created_at, updated_at)
-- - snake_case naming
-- - RLS enabled on all tables

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
$migration_statement_0_0$;
    EXECUTE $migration_statement_0_1$
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
$migration_statement_0_1$;
    EXECUTE $migration_statement_0_2$
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
$migration_statement_0_2$;
    EXECUTE $migration_statement_0_3$
CREATE INDEX idx_client_partner ON client(partner_id);
$migration_statement_0_3$;
    EXECUTE $migration_statement_0_4$
CREATE INDEX idx_client_status ON client(status) WHERE deleted_at IS NULL;
$migration_statement_0_4$;
    EXECUTE $migration_statement_0_5$
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
$migration_statement_0_5$;
    EXECUTE $migration_statement_0_6$
CREATE INDEX idx_snapshot_client ON client_snapshot(client_id);
$migration_statement_0_6$;
    EXECUTE $migration_statement_0_7$
CREATE INDEX idx_snapshot_taken ON client_snapshot(client_id, taken_at DESC);
$migration_statement_0_7$;
    EXECUTE $migration_statement_0_8$
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
  -- Also stores plan_bundle and macro_payload from the engine
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
$migration_statement_0_8$;
    EXECUTE $migration_statement_0_9$
CREATE INDEX idx_plan_client ON plan(client_id);
$migration_statement_0_9$;
    EXECUTE $migration_statement_0_10$
CREATE INDEX idx_plan_status ON plan(status) WHERE deleted_at IS NULL;
$migration_statement_0_10$;
    EXECUTE $migration_statement_0_11$
-- ── Training Log ──────────────────────────────────────────────────────────────
-- Used by training-log.ts router (partner-facing) and portal.ts (client-facing)

CREATE TABLE training_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID REFERENCES partner(id),
  plan_id UUID REFERENCES plan(id),

  -- Date/time
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_date DATE, -- ISO date from training-log router

  -- Day/session classification
  day_type TEXT CHECK (day_type IN ('training', 'rest', 'refeed', 'deload')),
  session_type TEXT CHECK (session_type IN ('strength', 'hypertrophy', 'cardio', 'hiit', 'flexibility', 'deload', 'other')),

  -- Exercise data
  exercise_method TEXT CHECK (exercise_method IN ('heart_rate', 'met_value', 'session_estimate', 'default_estimate')),
  duration_min INTEGER,
  duration_minutes INTEGER, -- used by training-log router
  avg_heart_rate INTEGER,
  met_value NUMERIC(4,1),
  kcal_estimated INTEGER,
  kcal_calculated INTEGER,

  -- Steps
  steps INTEGER,

  -- Adherence
  training_notes TEXT,
  rpe NUMERIC(3,1), -- Rate of Perceived Exertion (1-10)
  perceived_effort INTEGER CHECK (perceived_effort BETWEEN 1 AND 10),

  -- Exercise details (JSON array of exercise entries)
  exercises JSONB DEFAULT '[]',

  -- Screenshot / OCR
  screenshot_urls TEXT[] DEFAULT '{}',
  ocr_extracted BOOLEAN DEFAULT false,
  ocr_raw_text TEXT,
  ocr_confidence NUMERIC(3,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
$migration_statement_0_11$;
    EXECUTE $migration_statement_0_12$
CREATE INDEX idx_training_log_client ON training_log(client_id);
$migration_statement_0_12$;
    EXECUTE $migration_statement_0_13$
CREATE INDEX idx_training_log_date ON training_log(client_id, logged_at DESC);
$migration_statement_0_13$;
    EXECUTE $migration_statement_0_14$
CREATE INDEX idx_training_log_session_date ON training_log(client_id, session_date DESC);
$migration_statement_0_14$;
    EXECUTE $migration_statement_0_15$
CREATE INDEX idx_training_log_partner ON training_log(partner_id) WHERE partner_id IS NOT NULL;
$migration_statement_0_15$;
    EXECUTE $migration_statement_0_16$
-- ── Check-In ──────────────────────────────────────────────────────────────────
-- Matches checkin.ts router columns exactly

CREATE TABLE check_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),
  plan_id UUID REFERENCES plan(id),

  -- Token-based auth for client-facing form
  token UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'reviewed')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,

  -- Measurements
  weight_kg NUMERIC(5,2),
  body_fat_pct NUMERIC(4,1),
  waist_cm NUMERIC(5,1),
  hip_cm NUMERIC(5,1),

  -- Also keep check_in_date for portal router compatibility
  check_in_date DATE,

  -- Subjective markers
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10),
  hunger_level INTEGER CHECK (hunger_level BETWEEN 1 AND 10),
  digestive_health INTEGER CHECK (digestive_health BETWEEN 1 AND 10),

  -- Adherence
  adherence_pct INTEGER CHECK (adherence_pct BETWEEN 0 AND 100),
  nutrition_adherence INTEGER CHECK (nutrition_adherence BETWEEN 0 AND 100),
  training_adherence INTEGER CHECK (training_adherence BETWEEN 0 AND 100),
  supplement_adherence INTEGER CHECK (supplement_adherence BETWEEN 0 AND 100),

  -- Photos (array of URLs)
  photos TEXT[] DEFAULT '{}',

  -- Notes
  notes TEXT,
  review_notes TEXT,

  -- Weight deviation tracking
  weight_deviation_kg NUMERIC(5,2),
  weight_flagged BOOLEAN NOT NULL DEFAULT false,

  -- AI summary
  ai_summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_0_16$;
    EXECUTE $migration_statement_0_17$
CREATE UNIQUE INDEX idx_checkin_token ON check_in(token);
$migration_statement_0_17$;
    EXECUTE $migration_statement_0_18$
CREATE INDEX idx_checkin_client ON check_in(client_id);
$migration_statement_0_18$;
    EXECUTE $migration_statement_0_19$
CREATE INDEX idx_checkin_partner ON check_in(partner_id);
$migration_statement_0_19$;
    EXECUTE $migration_statement_0_20$
CREATE INDEX idx_checkin_status ON check_in(partner_id, status);
$migration_statement_0_20$;
    EXECUTE $migration_statement_0_21$
CREATE INDEX idx_checkin_date ON check_in(client_id, check_in_date DESC);
$migration_statement_0_21$;
    EXECUTE $migration_statement_0_22$
CREATE INDEX idx_checkin_flagged ON check_in(partner_id, weight_flagged) WHERE weight_flagged = true;
$migration_statement_0_22$;
    EXECUTE $migration_statement_0_23$
-- ── Check-In Token ────────────────────────────────────────────────────────────
-- Used by portal.ts getCheckInStatus

CREATE TABLE check_in_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_0_23$;
    EXECUTE $migration_statement_0_24$
CREATE UNIQUE INDEX idx_checkin_token_value ON check_in_token(token);
$migration_statement_0_24$;
    EXECUTE $migration_statement_0_25$
CREATE INDEX idx_checkin_token_client ON check_in_token(client_id);
$migration_statement_0_25$;
    EXECUTE $migration_statement_0_26$
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
$migration_statement_0_26$;
    EXECUTE $migration_statement_0_27$
CREATE INDEX idx_supplement_protocol_plan ON supplement_protocol(plan_id);
$migration_statement_0_27$;
    EXECUTE $migration_statement_0_28$
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
$migration_statement_0_28$;
    EXECUTE $migration_statement_0_29$
CREATE INDEX idx_supplement_item_protocol ON supplement_item(protocol_id);
$migration_statement_0_29$;
    EXECUTE $migration_statement_0_30$
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
$migration_statement_0_30$;
    EXECUTE $migration_statement_0_31$
CREATE INDEX idx_guidance_partner ON guidance_block(partner_id);
$migration_statement_0_31$;
    EXECUTE $migration_statement_0_32$
CREATE INDEX idx_guidance_category ON guidance_block(category) WHERE deleted_at IS NULL;
$migration_statement_0_32$;
    EXECUTE $migration_statement_0_33$
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
$migration_statement_0_33$;
    EXECUTE $migration_statement_0_34$
CREATE INDEX idx_document_client ON document(client_id);
$migration_statement_0_34$;
    EXECUTE $migration_statement_0_35$
CREATE INDEX idx_document_plan ON document(plan_id);
$migration_statement_0_35$;
    EXECUTE $migration_statement_0_36$
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
$migration_statement_0_36$;
    EXECUTE $migration_statement_0_37$
CREATE INDEX idx_invoice_client ON invoice(client_id);
$migration_statement_0_37$;
    EXECUTE $migration_statement_0_38$
CREATE INDEX idx_invoice_status ON invoice(status) WHERE deleted_at IS NULL;
$migration_statement_0_38$;
    EXECUTE $migration_statement_0_39$
CREATE UNIQUE INDEX idx_invoice_number ON invoice(invoice_number) WHERE deleted_at IS NULL;
$migration_statement_0_39$;
    EXECUTE $migration_statement_0_40$
-- ── Notification ──────────────────────────────────────────────────────────────
-- Matches notification.ts router and inngest/functions.ts

CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),
  client_id UUID REFERENCES client(id),

  trigger TEXT NOT NULL CHECK (trigger IN (
    'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
    'plan_expiring', 'invoice_overdue', 'invoice_paid',
    'task_due_today', 'task_overdue', 'new_message',
    'training_logged', 'milestone_reached'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',

  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_0_40$;
    EXECUTE $migration_statement_0_41$
CREATE INDEX idx_notification_partner ON notification(partner_id, read);
$migration_statement_0_41$;
    EXECUTE $migration_statement_0_42$
CREATE INDEX idx_notification_created ON notification(partner_id, created_at DESC);
$migration_statement_0_42$;
    EXECUTE $migration_statement_0_43$
-- ── Notification Settings ─────────────────────────────────────────────────────
-- Per-partner notification preferences (notification.ts getSettings/updateSettings)

CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id) UNIQUE,
  triggers JSONB NOT NULL DEFAULT '{}', -- { trigger_name: { enabled, email, inApp } }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_0_43$;
    EXECUTE $migration_statement_0_44$
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
$migration_statement_0_44$;
    EXECUTE $migration_statement_0_45$
CREATE INDEX idx_task_partner ON task(partner_id);
$migration_statement_0_45$;
    EXECUTE $migration_statement_0_46$
CREATE INDEX idx_task_status ON task(partner_id, status) WHERE deleted_at IS NULL;
$migration_statement_0_46$;
    EXECUTE $migration_statement_0_47$
CREATE INDEX idx_task_client ON task(client_id) WHERE client_id IS NOT NULL;
$migration_statement_0_47$;
    EXECUTE $migration_statement_0_48$
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
$migration_statement_0_48$;
    EXECUTE $migration_statement_0_49$
CREATE INDEX idx_message_client ON message(client_id, created_at DESC);
$migration_statement_0_49$;
    EXECUTE $migration_statement_0_50$
CREATE INDEX idx_message_unread ON message(client_id, is_read) WHERE is_read = false;
$migration_statement_0_50$;
    EXECUTE $migration_statement_0_51$
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
$migration_statement_0_51$;
    EXECUTE $migration_statement_0_52$
CREATE INDEX idx_diary_client ON diary_entry(client_id);
$migration_statement_0_52$;
    EXECUTE $migration_statement_0_53$
CREATE INDEX idx_diary_date ON diary_entry(client_id, entry_date DESC);
$migration_statement_0_53$;
    EXECUTE $migration_statement_0_54$
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
$migration_statement_0_54$;
    EXECUTE $migration_statement_0_55$
CREATE INDEX idx_example_meal_partner ON example_meal(partner_id);
$migration_statement_0_55$;
    EXECUTE $migration_statement_0_56$
CREATE INDEX idx_example_meal_type ON example_meal(meal_type) WHERE deleted_at IS NULL;
$migration_statement_0_56$;
    EXECUTE $migration_statement_0_57$
CREATE INDEX idx_example_meal_tags ON example_meal USING GIN(tags) WHERE deleted_at IS NULL;
$migration_statement_0_57$;
    EXECUTE $migration_statement_0_58$
CREATE INDEX idx_example_meal_allergens ON example_meal USING GIN(allergens) WHERE deleted_at IS NULL;
$migration_statement_0_58$;
    EXECUTE $migration_statement_0_59$
-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE partner ENABLE ROW LEVEL SECURITY;
$migration_statement_0_59$;
    EXECUTE $migration_statement_0_60$
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
$migration_statement_0_60$;
    EXECUTE $migration_statement_0_61$
ALTER TABLE client_snapshot ENABLE ROW LEVEL SECURITY;
$migration_statement_0_61$;
    EXECUTE $migration_statement_0_62$
ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
$migration_statement_0_62$;
    EXECUTE $migration_statement_0_63$
ALTER TABLE training_log ENABLE ROW LEVEL SECURITY;
$migration_statement_0_63$;
    EXECUTE $migration_statement_0_64$
ALTER TABLE check_in ENABLE ROW LEVEL SECURITY;
$migration_statement_0_64$;
    EXECUTE $migration_statement_0_65$
ALTER TABLE check_in_token ENABLE ROW LEVEL SECURITY;
$migration_statement_0_65$;
    EXECUTE $migration_statement_0_66$
ALTER TABLE supplement_protocol ENABLE ROW LEVEL SECURITY;
$migration_statement_0_66$;
    EXECUTE $migration_statement_0_67$
ALTER TABLE supplement_item ENABLE ROW LEVEL SECURITY;
$migration_statement_0_67$;
    EXECUTE $migration_statement_0_68$
ALTER TABLE guidance_block ENABLE ROW LEVEL SECURITY;
$migration_statement_0_68$;
    EXECUTE $migration_statement_0_69$
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
$migration_statement_0_69$;
    EXECUTE $migration_statement_0_70$
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
$migration_statement_0_70$;
    EXECUTE $migration_statement_0_71$
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
$migration_statement_0_71$;
    EXECUTE $migration_statement_0_72$
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
$migration_statement_0_72$;
    EXECUTE $migration_statement_0_73$
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
$migration_statement_0_73$;
    EXECUTE $migration_statement_0_74$
ALTER TABLE message ENABLE ROW LEVEL SECURITY;
$migration_statement_0_74$;
    EXECUTE $migration_statement_0_75$
ALTER TABLE diary_entry ENABLE ROW LEVEL SECURITY;
$migration_statement_0_75$;
    EXECUTE $migration_statement_0_76$
ALTER TABLE example_meal ENABLE ROW LEVEL SECURITY;
$migration_statement_0_76$;
    EXECUTE $migration_statement_0_77$
-- ── RLS Policies: Partner access ──────────────────────────────────────────────
-- Partners can see their own data and their clients' data.

-- Partner: can read own record
CREATE POLICY partner_self ON partner
  FOR ALL USING (auth_user_id = auth.uid());
$migration_statement_0_77$;
    EXECUTE $migration_statement_0_78$
-- Client: partner can manage their clients
CREATE POLICY client_partner_access ON client
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_78$;
    EXECUTE $migration_statement_0_79$
-- Client Snapshot: via client → partner
CREATE POLICY snapshot_partner_access ON client_snapshot
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_79$;
    EXECUTE $migration_statement_0_80$
-- Plan: partner owns plans
CREATE POLICY plan_partner_access ON plan
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_80$;
    EXECUTE $migration_statement_0_81$
-- Training Log: via client → partner (or direct partner_id)
CREATE POLICY training_log_partner_access ON training_log
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_81$;
    EXECUTE $migration_statement_0_82$
-- Check-In: via partner_id
CREATE POLICY checkin_partner_access ON check_in
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_82$;
    EXECUTE $migration_statement_0_83$
-- Check-In Token: via client → partner
CREATE POLICY checkin_token_partner_access ON check_in_token
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_83$;
    EXECUTE $migration_statement_0_84$
-- Supplement Protocol: via plan → partner
CREATE POLICY supplement_protocol_partner_access ON supplement_protocol
  FOR ALL USING (
    plan_id IN (
      SELECT id FROM plan WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_84$;
    EXECUTE $migration_statement_0_85$
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
$migration_statement_0_85$;
    EXECUTE $migration_statement_0_86$
-- Guidance Block: partner owns
CREATE POLICY guidance_partner_access ON guidance_block
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_86$;
    EXECUTE $migration_statement_0_87$
-- Document: partner owns
CREATE POLICY document_partner_access ON document
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_87$;
    EXECUTE $migration_statement_0_88$
-- Invoice: partner owns
CREATE POLICY invoice_partner_access ON invoice
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_88$;
    EXECUTE $migration_statement_0_89$
-- Notification: partner owns
CREATE POLICY notification_partner_access ON notification
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_89$;
    EXECUTE $migration_statement_0_90$
-- Notification Settings: partner owns
CREATE POLICY notification_settings_partner_access ON notification_settings
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_90$;
    EXECUTE $migration_statement_0_91$
-- Task: partner owns
CREATE POLICY task_partner_access ON task
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_91$;
    EXECUTE $migration_statement_0_92$
-- Message: via client → partner
CREATE POLICY message_partner_access ON message
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_92$;
    EXECUTE $migration_statement_0_93$
-- Diary Entry: via client → partner
CREATE POLICY diary_partner_access ON diary_entry
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client WHERE partner_id IN (
        SELECT id FROM partner WHERE auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_0_93$;
    EXECUTE $migration_statement_0_94$
-- Example Meal: partner owns
CREATE POLICY example_meal_partner_access ON example_meal
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_0_94$;
    EXECUTE $migration_statement_0_95$
-- ── Updated At Trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
$migration_statement_0_95$;
    EXECUTE $migration_statement_0_96$
-- Apply to all tables with updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'partner', 'client', 'client_snapshot', 'plan', 'training_log',
      'check_in', 'supplement_protocol', 'supplement_item', 'guidance_block',
      'document', 'invoice', 'notification_settings', 'task',
      'diary_entry', 'example_meal'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
$migration_statement_0_96$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('001_initial_schema.sql', '9ddfe1c4bb66f6c1b03ad14142cacfe9df5f6a51ef4c278d1e225aad1db055ac', 'migration-runner');
  END IF;
END
$migration_guard_0$;

-- 002_client_media_storage.sql
DO $migration_guard_1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '002_client_media_storage.sql'
  ) THEN
    EXECUTE $migration_statement_1_0$
-- Roberto Scrigna Platform: Client media storage
--
-- Adds a private "client-media" Storage bucket that hosts:
--   client-photos/<partner_id>/<client_id>/<file>       — client photos
--   training-screenshots/<partner_id>/<client_id>/<file> — workout screenshots
--
-- RLS policies on storage.objects:
--   • Partners can SELECT/INSERT/UPDATE/DELETE objects whose path is rooted
--     under their own partner_id.
--   • Clients can SELECT objects rooted under their own client_id.
--
-- After applying this migration the buckets are usable from the browser
-- directly via the Supabase JS client (the user's JWT is checked against the
-- RLS policy at upload/list/read time — no signed URLs required for partners).

-- ── Bucket ────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-media',
  'client-media',
  false,
  10485760, -- 10 MiB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
$migration_statement_1_0$;
    EXECUTE $migration_statement_1_1$
-- ── Policies ──────────────────────────────────────────────────────────────────

-- Partner full access for their own partner_id subtree.
DROP POLICY IF EXISTS "client_media_partner_all" ON storage.objects;
$migration_statement_1_1$;
    EXECUTE $migration_statement_1_2$
CREATE POLICY "client_media_partner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM partner WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM partner WHERE auth_user_id = auth.uid()
    )
  );
$migration_statement_1_2$;
    EXECUTE $migration_statement_1_3$
-- Client can read their own subtree (for portal photo viewing).
DROP POLICY IF EXISTS "client_media_client_read" ON storage.objects;
$migration_statement_1_3$;
    EXECUTE $migration_statement_1_4$
CREATE POLICY "client_media_client_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  );
$migration_statement_1_4$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('002_client_media_storage.sql', '214eda99fc41a4834ef7dca29baf5ec7220a69a067969d9477dc4dfc16aa90a6', 'migration-runner');
  END IF;
END
$migration_guard_1$;

-- 003_client_media_client_write.sql
DO $migration_guard_2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '003_client_media_client_write.sql'
  ) THEN
    EXECUTE $migration_statement_2_0$
-- Roberto Scrigna Platform: allow clients to upload their own training screenshots
--
-- The 002 migration only granted clients READ access to the "client-media"
-- bucket. To let the client log workouts from the portal with attached
-- screenshots, we need an INSERT/UPDATE/DELETE policy scoped strictly to the
-- training-screenshots/<partner_id>/<client_id>/... subtree. Client photos
-- under client-photos/... remain partner-only.

DROP POLICY IF EXISTS "client_media_client_training_write" ON storage.objects;
$migration_statement_2_0$;
    EXECUTE $migration_statement_2_1$
CREATE POLICY "client_media_client_training_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'training-screenshots'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'training-screenshots'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  );
$migration_statement_2_1$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('003_client_media_client_write.sql', 'a6f5dc43727dc17de4ffc4fc7498d0fac58792f6686a778777e793741a328815', 'migration-runner');
  END IF;
END
$migration_guard_2$;

-- 004_training_log_session_type_freeform.sql
DO $migration_guard_3$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '004_training_log_session_type_freeform.sql'
  ) THEN
    EXECUTE $migration_statement_3_0$
-- Roberto Scrigna Platform: relax training_log.session_type to free-form text
--
-- The base schema constrained session_type to a fixed 7-value enum
-- ('strength', 'hypertrophy', 'cardio', 'hiit', 'flexibility', 'deload',
-- 'other'). Roberto's feedback (May 2026 #10) flagged that this dropdown
-- lacked the activity types he actually uses ("Arti marziali" etc).
--
-- The intake form and SCP categoriser have been unified on the v4.4 spec
-- Appendix D modality taxonomy. This migration removes the CHECK constraint
-- so the training-log form can write the same canonical Italian display
-- names (e.g. "Pesi — Ipertrofia", "BJJ — Sparring", "Corsa — Costante").
--
-- Existing rows with legacy values ('strength', 'cardio', etc.) remain valid
-- and continue to render — the UI falls back to displaying the value itself
-- when no friendly label is found.

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'training_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%session_type%'
  LOOP
    EXECUTE 'ALTER TABLE training_log DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END$$;
$migration_statement_3_0$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('004_training_log_session_type_freeform.sql', '59855b070dcd5627ae74437b234c895c7fd7cb554bedc51592c80fda3689b454', 'migration-runner');
  END IF;
END
$migration_guard_3$;

-- 005_training_log_exercise_method_freeform.sql
DO $migration_guard_4$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '005_training_log_exercise_method_freeform.sql'
  ) THEN
    EXECUTE $migration_statement_4_0$
-- Roberto Scrigna Platform: relax training_log.exercise_method to free-form text
--
-- The base CHECK ('heart_rate' | 'met_value' | 'session_estimate' |
-- 'default_estimate') doesn't include 'sport_correction_protocol', which is
-- now used when OCR-extracted HR-zone data is fed into the SCP engine to
-- derive an exercise-energy estimate (see training-log.ts create).
--
-- Pattern matches migration 004: drop the inline CHECK via a DO block so the
-- column accepts the broader set of methods (and stays validated at the Zod
-- layer in the tRPC schema).

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'training_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%exercise_method%'
  LOOP
    EXECUTE 'ALTER TABLE training_log DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END$$;
$migration_statement_4_0$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('005_training_log_exercise_method_freeform.sql', '174532ce6fd1377624f913d2363cbfbad241ab907ec2c5a74540886a7c6f1b92', 'migration-runner');
  END IF;
END
$migration_guard_4$;

-- 006_plan_versioning_and_feedback.sql
DO $migration_guard_5$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '006_plan_versioning_and_feedback.sql'
  ) THEN
    EXECUTE $migration_statement_5_0$
-- 006_plan_versioning_and_feedback.sql
-- Lifecycle-spine increment 1: plan versioning + feedback-reminder cadence.
--
-- Idempotent (the dev runner re-applies every file): all changes use
-- IF NOT EXISTS / DROP ... IF EXISTS so re-running is a no-op.

-- ── Plan versioning columns ──────────────────────────────────────────────────
-- A plan version chain: the root plan has parent_plan_id = NULL and
-- version_number = 1; each new version points parent_plan_id at the ROOT and
-- bumps version_number = max(chain) + 1. version_label carries Roberto's
-- human convention (v1, v1.1, v1.2 for tweaks/regenerations; v2 for a brand-new
-- plan). change_reason records why the version was cut. feedback_check_in_id
-- links the version to the check-in (feedback questionnaire) that prompted it.
ALTER TABLE plan ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES plan(id);
$migration_statement_5_0$;
    EXECUTE $migration_statement_5_1$
ALTER TABLE plan ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
$migration_statement_5_1$;
    EXECUTE $migration_statement_5_2$
ALTER TABLE plan ADD COLUMN IF NOT EXISTS version_label TEXT;
$migration_statement_5_2$;
    EXECUTE $migration_statement_5_3$
ALTER TABLE plan ADD COLUMN IF NOT EXISTS change_reason TEXT;
$migration_statement_5_3$;
    EXECUTE $migration_statement_5_4$
ALTER TABLE plan ADD COLUMN IF NOT EXISTS feedback_check_in_id UUID REFERENCES check_in(id);
$migration_statement_5_4$;
    EXECUTE $migration_statement_5_5$
-- Fast lookup of a version chain by its root.
CREATE INDEX IF NOT EXISTS idx_plan_parent_plan_id ON plan(parent_plan_id);
$migration_statement_5_5$;
    EXECUTE $migration_statement_5_6$
-- ── Notification: allow the 'feedback_requested' trigger ─────────────────────
-- The trigger CHECK is an inline constraint named notification_trigger_check.
-- Drop and re-create it with the new value appended (idempotent across re-runs).
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
$migration_statement_5_6$;
    EXECUTE $migration_statement_5_7$
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested'
));
$migration_statement_5_7$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('006_plan_versioning_and_feedback.sql', '2be55a48bf0b6dbbba184027b215168e0b71d0ddb1476ea49453a195d855207c', 'migration-runner');
  END IF;
END
$migration_guard_5$;

-- 007_placeholder_skipped.sql
DO $migration_guard_6$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '007_placeholder_skipped.sql'
  ) THEN
    EXECUTE $migration_statement_6_0$
-- Migration 007 — INTENTIONALLY SKIPPED (placeholder, no-op)
--
-- The hand-numbered migration sequence jumps 006 → 008; there is no functional
-- migration 007. This file exists only so the sequence reads contiguously and a
-- future reader (or James applying migrations via the Supabase SQL Editor) is not
-- left wondering whether an 007 was lost. It applies NOTHING.
--
-- Numbering history: 006_plan_versioning_and_feedback.sql is followed directly by
-- 008_plan_update_suggested_trigger.sql. The 007 slot was skipped during
-- development and never used. No schema object depends on a "007".
--
-- Safe to apply (no-op) or to leave unapplied — it changes nothing either way.

DO $$
BEGIN
  -- no-op: documentation placeholder for the skipped 007 slot
  NULL;
END $$;
$migration_statement_6_0$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('007_placeholder_skipped.sql', 'c52937399ec02cff128bb371f35edcf14a00ccd4d8ff5470da2b9ac45e3690d8', 'migration-runner');
  END IF;
END
$migration_guard_6$;

-- 008_plan_update_suggested_trigger.sql
DO $migration_guard_7$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '008_plan_update_suggested_trigger.sql'
  ) THEN
    EXECUTE $migration_statement_7_0$
-- 008_plan_update_suggested_trigger.sql
-- #25 Stage A: allow the 'plan_update_suggested' notification trigger.
--
-- The plan-update heuristic (weight-change → suggest regenerate) emits a
-- COACH-SCOPED notification (client_id = NULL) suggesting the coach regenerate
-- a plan after a client loses ≥10% bodyweight. This adds the new trigger value
-- to the notification.trigger CHECK constraint. PROMPT LAYER ONLY — no plan is
-- ever mutated by this feature; the coach applies it via the existing #24
-- createVersion flow.
--
-- Idempotent (mirrors 006): DROP ... IF EXISTS then re-CREATE the constraint
-- with the full value list (all existing triggers + the new one), so re-running
-- is a no-op.

ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
$migration_statement_7_0$;
    EXECUTE $migration_statement_7_1$
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested',
  'plan_update_suggested'
));
$migration_statement_7_1$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('008_plan_update_suggested_trigger.sql', '9842ff8ab965babe8a2bd85d1d03e92bfb9d5a7b0d1ae3eb115676601f7aa6f5', 'migration-runner');
  END IF;
END
$migration_guard_7$;

-- 009_legal_documents.sql
DO $migration_guard_8$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '009_legal_documents.sql'
  ) THEN
    EXECUTE $migration_statement_8_0$
-- 009_legal_documents.sql
-- Requirement #29 (Legal & GDPR compliance) — Stage 1: VERSIONED engagement-letter
-- template store. #29 is Tier 2 — the app generates + versions the letter; the
-- binding SIGNATURE is delegated to an eIDAS e-signature provider in Stage 2
-- (a signature_request table lands in that migration, NOT here).
--
-- This migration intentionally contains ONLY the versioned document store:
-- NO acceptance/audit table, NO storage bucket, NO consent/Tessera tables.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Fully idempotent (CREATE ... IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS). Re-running the file is a no-op.
--
-- Immutability (KB §2 "previously accepted/published documents must never be
-- overwritten"): a legal_document_version row's CONTENT is never rewritten — a
-- new version is a NEW row. No updated_at column; not added to the 001 updated_at
-- trigger array; no deleted_at. `status` may transition active -> replaced/archived
-- (a lifecycle flag), and a BEFORE UPDATE trigger enforces that ONLY status may
-- change — content columns are frozen even against a partner's own RLS-scoped writes.

-- ── legal_document (one container per partner per doc_kind) ───────────────────
CREATE TABLE IF NOT EXISTS legal_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),
  doc_kind TEXT NOT NULL CHECK (doc_kind IN ('engagement_letter', 'privacy_notice', 'health_consent')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, doc_kind)
);
$migration_statement_8_0$;
    EXECUTE $migration_statement_8_1$
CREATE INDEX IF NOT EXISTS idx_legal_document_partner ON legal_document(partner_id);
$migration_statement_8_1$;
    EXECUTE $migration_statement_8_2$
-- ── legal_document_version (immutable, versioned) ────────────────────────────
CREATE TABLE IF NOT EXISTS legal_document_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_document_id UUID NOT NULL REFERENCES legal_document(id),
  version_number INTEGER NOT NULL,
  version_label TEXT,
  language TEXT NOT NULL DEFAULT 'it',
  body_md TEXT NOT NULL,
  content_hash TEXT NOT NULL,       -- sha256(body_md), computed in the app
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'replaced')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legal_document_id, version_number)
);
$migration_statement_8_2$;
    EXECUTE $migration_statement_8_3$
CREATE INDEX IF NOT EXISTS idx_legal_document_version_doc ON legal_document_version(legal_document_id);
$migration_statement_8_3$;
    EXECUTE $migration_statement_8_4$
CREATE INDEX IF NOT EXISTS idx_legal_document_version_active ON legal_document_version(legal_document_id) WHERE status = 'active';
$migration_statement_8_4$;
    EXECUTE $migration_statement_8_5$
-- ── Immutability guard: legal_document_version content is frozen ──────────────
-- RLS grants partners UPDATE (needed for the active -> replaced status flip when
-- publishing a new version), but the document CONTENT must never be rewritten.
-- This trigger rejects any change to content columns; only `status` may change.
CREATE OR REPLACE FUNCTION legal_document_version_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body_md IS DISTINCT FROM OLD.body_md
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.legal_document_id IS DISTINCT FROM OLD.legal_document_id
     OR NEW.language IS DISTINCT FROM OLD.language
     OR NEW.version_label IS DISTINCT FROM OLD.version_label
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'legal_document_version content is immutable; only status may change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
$migration_statement_8_5$;
    EXECUTE $migration_statement_8_6$
DROP TRIGGER IF EXISTS trg_legal_document_version_freeze ON legal_document_version;
$migration_statement_8_6$;
    EXECUTE $migration_statement_8_7$
CREATE TRIGGER trg_legal_document_version_freeze
  BEFORE UPDATE ON legal_document_version
  FOR EACH ROW EXECUTE FUNCTION legal_document_version_freeze();
$migration_statement_8_7$;
    EXECUTE $migration_statement_8_8$
-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE legal_document ENABLE ROW LEVEL SECURITY;
$migration_statement_8_8$;
    EXECUTE $migration_statement_8_9$
ALTER TABLE legal_document_version ENABLE ROW LEVEL SECURITY;
$migration_statement_8_9$;
    EXECUTE $migration_statement_8_10$
-- Partner-full (mirrors document_partner_access, 001:627). FOR ALL USING also
-- gates INSERT/UPDATE — Postgres reuses the USING expression as WITH CHECK when
-- none is given, exactly as the existing partner-table policies rely on. The
-- freeze trigger constrains what an UPDATE may actually change.
DROP POLICY IF EXISTS legal_document_partner_access ON legal_document;
$migration_statement_8_10$;
    EXECUTE $migration_statement_8_11$
CREATE POLICY legal_document_partner_access ON legal_document
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_8_11$;
    EXECUTE $migration_statement_8_12$
DROP POLICY IF EXISTS legal_document_version_partner_access ON legal_document_version;
$migration_statement_8_12$;
    EXECUTE $migration_statement_8_13$
CREATE POLICY legal_document_version_partner_access ON legal_document_version
  FOR ALL USING (
    legal_document_id IN (
      SELECT id FROM legal_document
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );
$migration_statement_8_13$;
    EXECUTE $migration_statement_8_14$
-- Client read-own (mirrors client_media_client_read, 002:56) — the in-scope
-- client may read their professional's published template (e.g. to view the
-- letter before signing). Defence-in-depth; the runtime path uses service role.
DROP POLICY IF EXISTS legal_document_client_read ON legal_document;
$migration_statement_8_14$;
    EXECUTE $migration_statement_8_15$
CREATE POLICY legal_document_client_read ON legal_document
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT partner_id FROM client WHERE auth_user_id = auth.uid())
  );
$migration_statement_8_15$;
    EXECUTE $migration_statement_8_16$
DROP POLICY IF EXISTS legal_document_version_client_read ON legal_document_version;
$migration_statement_8_16$;
    EXECUTE $migration_statement_8_17$
CREATE POLICY legal_document_version_client_read ON legal_document_version
  FOR SELECT TO authenticated
  USING (
    legal_document_id IN (
      SELECT ld.id FROM legal_document ld
      JOIN client c ON c.partner_id = ld.partner_id
      WHERE c.auth_user_id = auth.uid()
    )
  );
$migration_statement_8_17$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('009_legal_documents.sql', '6659ceb270a372a89b28bed1f21c225732b6c18ea1d61e02ae56c21a4af1abf0', 'migration-runner');
  END IF;
END
$migration_guard_8$;

-- 010_signature_requests.sql
DO $migration_guard_9$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '010_signature_requests.sql'
  ) THEN
    EXECUTE $migration_statement_9_0$
-- 010_signature_requests.sql
-- Requirement #29 — in-app signature (SES) + provider-agnostic e-sign seam.
-- STACKS ON 009_legal_documents.sql: references legal_document_version. Apply
-- order is 009 then 010.
--
-- One shared table serving BOTH signing tiers behind the EsignProvider seam:
--   (1) internal SES (default) — the patient accepts in-app; we record who/when/
--       which-version and regenerate a stamped signed PDF on demand.
--   (2) a real eIDAS provider (Stage 2 / v1.5) — populates external_request_id /
--       signed_document_path / certificate_url / provider_audit_ref instead.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Fully idempotent. Re-running is a no-op.
--
-- IMMUTABILITY: once status='signed', a BEFORE UPDATE trigger blocks ALL further
-- changes (mirrors the legal_document_version freeze pattern from 009).

-- ── signature_request (shared by both tiers) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS signature_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),
  document_version_id UUID NOT NULL REFERENCES legal_document_version(id),
  provider TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled')),
  accepted_at TIMESTAMPTZ,                 -- internal SES: when the patient accepted
  accepted_by UUID,                        -- auth.users.id of the accepting patient
  acceptance_method TEXT,                  -- e.g. 'in_app_ses'
  signed_document_path TEXT,               -- external providers only (internal regenerates on demand)
  external_request_id TEXT,                -- external provider's request id
  certificate_url TEXT,                    -- external provider's completion certificate
  provider_audit_ref TEXT,                 -- external provider's audit-trail reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_9_0$;
    EXECUTE $migration_statement_9_1$
CREATE INDEX IF NOT EXISTS idx_signature_request_client ON signature_request(client_id);
$migration_statement_9_1$;
    EXECUTE $migration_statement_9_2$
CREATE INDEX IF NOT EXISTS idx_signature_request_partner ON signature_request(partner_id);
$migration_statement_9_2$;
    EXECUTE $migration_statement_9_3$
CREATE INDEX IF NOT EXISTS idx_signature_request_version ON signature_request(document_version_id);
$migration_statement_9_3$;
    EXECUTE $migration_statement_9_4$
-- ── Immutability guard: a signed request is frozen ───────────────────────────
CREATE OR REPLACE FUNCTION signature_request_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'signature_request is immutable once signed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
$migration_statement_9_4$;
    EXECUTE $migration_statement_9_5$
DROP TRIGGER IF EXISTS trg_signature_request_freeze ON signature_request;
$migration_statement_9_5$;
    EXECUTE $migration_statement_9_6$
CREATE TRIGGER trg_signature_request_freeze
  BEFORE UPDATE ON signature_request
  FOR EACH ROW EXECUTE FUNCTION signature_request_freeze();
$migration_statement_9_6$;
    EXECUTE $migration_statement_9_7$
-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE signature_request ENABLE ROW LEVEL SECURITY;
$migration_statement_9_7$;
    EXECUTE $migration_statement_9_8$
-- Partner-full for their own clients' requests (create/read/manage). FOR ALL
-- USING also gates partner INSERT/UPDATE (USING reused as WITH CHECK).
DROP POLICY IF EXISTS signature_request_partner_access ON signature_request;
$migration_statement_9_8$;
    EXECUTE $migration_statement_9_9$
CREATE POLICY signature_request_partner_access ON signature_request
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_9_9$;
    EXECUTE $migration_statement_9_10$
-- Client may READ their own requests.
DROP POLICY IF EXISTS signature_request_client_read ON signature_request;
$migration_statement_9_10$;
    EXECUTE $migration_statement_9_11$
CREATE POLICY signature_request_client_read ON signature_request
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );
$migration_statement_9_11$;
    EXECUTE $migration_statement_9_12$
-- NO client UPDATE policy — intentional. The ONLY acceptance path is the
-- server-side service-role router (signature.acceptSignature), which bypasses RLS
-- and authoritatively stamps status='signed' + accepted_by=<authenticated client>.
-- A prior version granted a client-direct UPDATE (accept -> signed), but its
-- WITH CHECK did not pin partner_id / document_version_id / accepted_by, so a
-- JWT-armed client could, in the same accept, reassign the request into another
-- partner's tenant scope or forge the acceptor. With RLS enabled and no client
-- UPDATE policy, such a write is default-denied outright. DROP any previously
-- applied instance so re-running converges to the hardened state (idempotent).
DROP POLICY IF EXISTS signature_request_client_accept ON signature_request;
$migration_statement_9_12$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('010_signature_requests.sql', '6c6cebe506dbde946a935491930b99ce2a77fe6c9764d53ce6ea08b907002635', 'migration-runner');
  END IF;
END
$migration_guard_9$;

-- 011_snapshot_edit_audit.sql
DO $migration_guard_10$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '011_snapshot_edit_audit.sql'
  ) THEN
    EXECUTE $migration_statement_10_0$
-- 011_snapshot_edit_audit.sql
-- #5 (retroactive measurement editing): an APPEND-ONLY audit trail of coach edits
-- to a past client_snapshot (client.editSnapshot). Each edit records the changed
-- fields (before -> after, changed-only) + who edited + when.
--
-- MIGRATION NUMBER: 011 — the previously-missing number in the sequence
-- (009/010 = #29, 011 = #5 THIS FILE, 012 = #07, 013 = #28, 014 = #10). Independent
-- of every other branch: it adds ONE new table and touches NO shared object (in
-- particular it does NOT alter notification_trigger_check or any other constraint).
-- Applies BEFORE 012 (only ordering requirement: after 001, which defines
-- client_snapshot + client).
--
-- APPEND-ONLY: this table has INSERT + SELECT RLS policies and NO update/delete
-- policy, so RLS default-denies UPDATE and DELETE for authenticated users — the
-- audit trail is immutable, mirroring the legal_document_version / signature_request
-- immutability pattern (here achieved purely by absence of a write path, since —
-- unlike signature_request — there is no legitimate client/partner update path).
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE) —
-- re-running is a no-op. Writes NO application data.

CREATE TABLE IF NOT EXISTS snapshot_edit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES client_snapshot(id),
  client_id UUID NOT NULL REFERENCES client(id),
  edited_by UUID,                       -- auth.users.id of the editing partner
  changed_fields JSONB NOT NULL,        -- { field: { before, after } } — changed-only
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_10_0$;
    EXECUTE $migration_statement_10_1$
CREATE INDEX IF NOT EXISTS idx_snapshot_edit_audit_snapshot
  ON snapshot_edit_audit(snapshot_id, edited_at DESC);
$migration_statement_10_1$;
    EXECUTE $migration_statement_10_2$
CREATE INDEX IF NOT EXISTS idx_snapshot_edit_audit_client
  ON snapshot_edit_audit(client_id, edited_at DESC);
$migration_statement_10_2$;
    EXECUTE $migration_statement_10_3$
ALTER TABLE snapshot_edit_audit ENABLE ROW LEVEL SECURITY;
$migration_statement_10_3$;
    EXECUTE $migration_statement_10_4$
-- Partner may INSERT audit rows for their OWN clients' snapshots (client → partner).
DROP POLICY IF EXISTS snapshot_edit_audit_partner_insert ON snapshot_edit_audit;
$migration_statement_10_4$;
    EXECUTE $migration_statement_10_5$
CREATE POLICY snapshot_edit_audit_partner_insert ON snapshot_edit_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );
$migration_statement_10_5$;
    EXECUTE $migration_statement_10_6$
-- Partner may READ their OWN clients' audit rows.
DROP POLICY IF EXISTS snapshot_edit_audit_partner_read ON snapshot_edit_audit;
$migration_statement_10_6$;
    EXECUTE $migration_statement_10_7$
CREATE POLICY snapshot_edit_audit_partner_read ON snapshot_edit_audit
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );
$migration_statement_10_7$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('011_snapshot_edit_audit.sql', 'e68bcc7c003221a9ba34359c375bca2499022b6a83c44507369321db60d8caec', 'migration-runner');
  END IF;
END
$migration_guard_10$;

-- 012_reminder_settings.sql
DO $migration_guard_11$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '012_reminder_settings.sql'
  ) THEN
    EXECUTE $migration_statement_11_0$
-- 012_reminder_settings.sql
-- Build #07: customizable per-client monitoring reminders (coach sets per-client
-- check-in + body-composition reminder cadence). Independent of the #29 stack and #5.
--
-- WHY A NEW TABLE: notification_settings is PER-PARTNER (partner_id UNIQUE, a JSONB
-- of global trigger prefs) — the wrong cardinality for per-client cadence. A clean
-- per-client table keyed by client_id is correct and keeps RLS simple.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- SELF-CONTAINED: depends only on the base schema (001's client + notification
-- tables) — it does NOT depend on the #29 migrations 009/010 (or any 011). The
-- '012' number just sorts it last; apply it any time after 001. Fully idempotent
-- (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS) — re-running is a no-op.
--
-- DEFAULTS preserve today's behaviour: check_in_every_days = 21 matches the
-- hardcoded FEEDBACK_DUE_DAYS the feedback/check-in cron uses now (so existing
-- clients are unchanged); body_comp_every_days = 0 means OFF (body-comp reminders
-- are NET-NEW and opt-in — no surprise emails for existing clients).

-- ── client_reminder_settings (one row per client) ────────────────────────────
CREATE TABLE IF NOT EXISTS client_reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) UNIQUE,
  check_in_every_days INTEGER NOT NULL DEFAULT 21
    CHECK (check_in_every_days BETWEEN 1 AND 90),
  body_comp_every_days INTEGER NOT NULL DEFAULT 0   -- 0 = off (opt-in)
    CHECK (body_comp_every_days BETWEEN 0 AND 90),
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_11_0$;
    EXECUTE $migration_statement_11_1$
CREATE INDEX IF NOT EXISTS idx_client_reminder_settings_client ON client_reminder_settings(client_id);
$migration_statement_11_1$;
    EXECUTE $migration_statement_11_2$
-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE client_reminder_settings ENABLE ROW LEVEL SECURITY;
$migration_statement_11_2$;
    EXECUTE $migration_statement_11_3$
-- Partner-full for their own clients (mirrors the client-scoped policies, via the
-- client -> partner join). FOR ALL USING also gates partner INSERT/UPDATE.
DROP POLICY IF EXISTS client_reminder_settings_partner_access ON client_reminder_settings;
$migration_statement_11_3$;
    EXECUTE $migration_statement_11_4$
CREATE POLICY client_reminder_settings_partner_access ON client_reminder_settings
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );
$migration_statement_11_4$;
    EXECUTE $migration_statement_11_5$
-- Client may read their own (defence-in-depth; the cron uses the service role).
DROP POLICY IF EXISTS client_reminder_settings_client_read ON client_reminder_settings;
$migration_statement_11_5$;
    EXECUTE $migration_statement_11_6$
CREATE POLICY client_reminder_settings_client_read ON client_reminder_settings
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );
$migration_statement_11_6$;
    EXECUTE $migration_statement_11_7$
-- ── Allow the net-new reminder/feedback notification triggers ────────────────
-- The trigger CHECK is the inline constraint notification_trigger_check; drop and
-- re-create it with the full existing value list. This list carries the UNION of
-- every net-new trigger added by the parallel unmerged migrations —
-- 'body_comp_due' (this #07 migration) AND 'urgent_feedback' (013 / #28) — so that
-- 012 and 013 are ORDER-INDEPENDENT: whichever is applied last, both values survive
-- and neither ADD CONSTRAINT fails against a row the other migration already wrote.
-- (idempotent: DROP IF EXISTS + ADD.)
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
$migration_statement_11_7$;
    EXECUTE $migration_statement_11_8$
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested', 'plan_update_suggested',
  'body_comp_due', 'urgent_feedback'
));
$migration_statement_11_8$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('012_reminder_settings.sql', 'd0b030e2cccc70e00137dd0bfbbc94cc19bf47073bafb64da8f900f22b187936', 'migration-runner');
  END IF;
END
$migration_guard_11$;

-- 013_urgent_feedback.sql
DO $migration_guard_12$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '013_urgent_feedback.sql'
  ) THEN
    EXECUTE $migration_statement_12_0$
-- 013_urgent_feedback.sql
-- Build #28: urgent-feedback + injury-report channel — a SEPARATE channel from
-- the 3-weekly structured feedback (check_in, already ships) and NOT real-time
-- chat. #28 only CAPTURES the submission + NOTIFIES the coach; it MUST NOT
-- auto-regenerate the plan (per Roberto's heuristics — regeneration stays manual).
--
-- MIGRATION NUMBER: 013. 009/010 are #29 (PRs 41/43), 011 is reserved by #5
-- (snapshot-edit), 012 is #07 (PR 48) → 013 is the next unused number.
--
-- WHY A DEDICATED TABLE: the `message` table is freeform (body TEXT) and can't
-- hold the structured injury fields (area/severity/onset/limitations); check_in
-- is the structured 3-weekly feedback. A dedicated table keeps the injury report
-- queryable and statusable.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Self-contained (depends only on the base schema 001: client, partner,
-- notification). Fully idempotent — re-running is a no-op.

-- ── urgent_feedback (urgent feedback + structured injury reports) ─────────────
CREATE TABLE IF NOT EXISTS urgent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),
  kind TEXT NOT NULL CHECK (kind IN ('urgent_feedback', 'injury_report')),
  message TEXT NOT NULL,
  injury_area TEXT,         -- injury_report only
  injury_severity TEXT,     -- injury_report only
  injury_onset DATE,        -- injury_report only
  limitations TEXT,         -- injury_report only
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_12_0$;
    EXECUTE $migration_statement_12_1$
CREATE INDEX IF NOT EXISTS idx_urgent_feedback_client ON urgent_feedback(client_id, created_at DESC);
$migration_statement_12_1$;
    EXECUTE $migration_statement_12_2$
CREATE INDEX IF NOT EXISTS idx_urgent_feedback_partner ON urgent_feedback(partner_id, status);
$migration_statement_12_2$;
    EXECUTE $migration_statement_12_3$
-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE urgent_feedback ENABLE ROW LEVEL SECURITY;
$migration_statement_12_3$;
    EXECUTE $migration_statement_12_4$
-- Client: insert + read their OWN submissions.
DROP POLICY IF EXISTS urgent_feedback_client_insert ON urgent_feedback;
$migration_statement_12_4$;
    EXECUTE $migration_statement_12_5$
CREATE POLICY urgent_feedback_client_insert ON urgent_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
    -- the stamped partner_id must be the client's REAL partner (no cross-tenant inject)
    AND partner_id IN (SELECT partner_id FROM client WHERE auth_user_id = auth.uid())
  );
$migration_statement_12_5$;
    EXECUTE $migration_statement_12_6$
DROP POLICY IF EXISTS urgent_feedback_client_read ON urgent_feedback;
$migration_statement_12_6$;
    EXECUTE $migration_statement_12_7$
CREATE POLICY urgent_feedback_client_read ON urgent_feedback
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );
$migration_statement_12_7$;
    EXECUTE $migration_statement_12_8$
-- Partner: read + update (status) their OWN clients' submissions.
DROP POLICY IF EXISTS urgent_feedback_partner_read ON urgent_feedback;
$migration_statement_12_8$;
    EXECUTE $migration_statement_12_9$
CREATE POLICY urgent_feedback_partner_read ON urgent_feedback
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_12_9$;
    EXECUTE $migration_statement_12_10$
DROP POLICY IF EXISTS urgent_feedback_partner_update ON urgent_feedback;
$migration_statement_12_10$;
    EXECUTE $migration_statement_12_11$
CREATE POLICY urgent_feedback_partner_update ON urgent_feedback
  FOR UPDATE TO authenticated
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_12_11$;
    EXECUTE $migration_statement_12_12$
-- ── Allow the reminder/feedback notification triggers (the coach alert) ───────
-- The coach is notified via the existing notification table (priority 'urgent'),
-- so the #2 per-client feed surfaces it. Rebuild the CHECK with the full value
-- list. This list carries the UNION of every net-new trigger added by the parallel
-- unmerged migrations — 'urgent_feedback' (this #28 migration) AND 'body_comp_due'
-- (012 / #07) — so that 012 and 013 are ORDER-INDEPENDENT: whichever is applied
-- last, both values survive and neither ADD CONSTRAINT fails against a row the
-- other migration already wrote.
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
$migration_statement_12_12$;
    EXECUTE $migration_statement_12_13$
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested', 'plan_update_suggested',
  'body_comp_due', 'urgent_feedback'
));
$migration_statement_12_13$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('013_urgent_feedback.sql', 'e50806b98d1cd596f7cdf502db28c0748b1d42a744a0cc3eebb47106aa2fe669', 'migration-runner');
  END IF;
END
$migration_guard_12$;

-- 014_session_kcal_override.sql
DO $migration_guard_13$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '014_session_kcal_override.sql'
  ) THEN
    EXECUTE $migration_statement_13_0$
-- 014_session_kcal_override.sql
-- #10 (DISPLAY-ONLY slice): a coach-entered manual per-session expenditure kcal
-- override for unusual activities.
--
-- HARD BOUNDARY — this is NOT plan-moving: plan generation sources session
-- expenditure from the client_snapshot intake (skinfold_data._intake.training_sessions,
-- read by plan.ts intakeTrainingSessions()), and NEVER from training_log. Adding a
-- column to training_log therefore CANNOT change any generated plan's calories. It
-- is read only by the coach/portal display + analytics surfaces.
--
-- MIGRATION NUMBER: 014. 009/010 = #29, 011 = #5, 012 = #07, 013 = #28 → 014 next free.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- Self-contained (depends only on the base training_log table from 001). Idempotent
-- (ADD COLUMN IF NOT EXISTS) — re-running is a no-op.

ALTER TABLE training_log ADD COLUMN IF NOT EXISTS kcal_override NUMERIC;
$migration_statement_13_0$;
    EXECUTE $migration_statement_13_1$
COMMENT ON COLUMN training_log.kcal_override IS
  'Coach-entered manual per-session expenditure (kcal). DISPLAY-ONLY — not read by plan generation.';
$migration_statement_13_1$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('014_session_kcal_override.sql', '4a69f0b35582b4ebd0f3bf7cc2124cd9ba5c9b3398fbf1e5d1934948693dc861', 'migration-runner');
  END IF;
END
$migration_guard_13$;

-- 015_partner_practice_profile.sql
DO $migration_guard_14$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '015_partner_practice_profile.sql'
  ) THEN
    EXECUTE $migration_statement_14_0$
-- 015_partner_practice_profile.sql
-- #29 completion: the practitioner "practice profile" — Roberto enters his
-- practice details ONCE (Albo, P.IVA, studio, insurer, fee, foro, terms…) and
-- every engagement letter auto-fills them via the {{merge tokens}} that replaced
-- the template's [PLACEHOLDER: …] markers.
--
-- ⚠️ FOR JAMES — apply in the Supabase SQL editor (or psql) BEFORE merging the PR.
-- Do NOT run via the dev db:migrate runner. The generation wiring is code-complete
-- but the live auto-fill only lights up once this table exists.
--
-- TABLE-vs-COLUMNS CHOICE: a SEPARATE table (one row per partner) rather than 19
-- new columns on `partner`. Reasons: (a) matches the app's table-per-concern
-- pattern (client_reminder_settings, notification_settings, signature_request…);
-- (b) keeps the hot `partner` row lean — these fields are rarely read/written and
-- only by the letter path; (c) clean, self-contained RLS; (d) trivially extensible.
--
-- SELF-CONTAINED: depends only on 001's `partner` table. The '015' number just
-- sorts it last; apply any time after 001. Fully idempotent (CREATE … IF NOT
-- EXISTS / DROP POLICY … IF EXISTS) — re-running is a no-op. All fields are
-- nullable free TEXT: an empty field renders as "[DA COMPLETARE: <label>]" in the
-- letter (never blank/broken), so an unfilled profile still shows what's missing.

-- ── partner_practice_profile (one row per partner) ───────────────────────────
CREATE TABLE IF NOT EXISTS partner_practice_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id) UNIQUE,

  -- Studio / registration
  professione        TEXT,   -- es. "Biologo Nutrizionista" / "Dietista"
  albo_ordine        TEXT,   -- Albo/Ordine di iscrizione (es. "ONB")
  albo_number        TEXT,   -- numero di iscrizione all'Albo
  partita_iva        TEXT,
  studio_address     TEXT,   -- indirizzo dello studio
  delivery_mode      TEXT,   -- "studio" / "da remoto" / "piattaforma/app"

  -- Prestazione
  plan_delivery_days TEXT,   -- giorni per la consegna del piano (§2 "entro N giorni")
  cadenza            TEXT,   -- cadenza dei controlli

  -- Compenso / fiscale
  fee_importo        TEXT,   -- importo del compenso (€)
  cassa_iva          TEXT,   -- cassa previdenziale / IVA
  fee_articolazione  TEXT,   -- articolazione del compenso
  payment_metodo     TEXT,   -- metodo di pagamento
  payment_termine    TEXT,   -- termine di pagamento

  -- Durata / recesso
  durata                    TEXT,  -- durata dell'incarico
  cancellation_notice_hours TEXT,  -- preavviso di disdetta in ore (§6 "N ore")
  penale                    TEXT,  -- penale per mancata disdetta

  -- Assicurazione
  numero_polizza     TEXT,   -- numero polizza RC professionale
  assicuratore       TEXT,   -- compagnia assicurativa

  -- Legale
  foro               TEXT,   -- foro competente

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_14_0$;
    EXECUTE $migration_statement_14_1$
CREATE INDEX IF NOT EXISTS idx_partner_practice_profile_partner
  ON partner_practice_profile(partner_id);
$migration_statement_14_1$;
    EXECUTE $migration_statement_14_2$
-- ── RLS: a partner reads/writes ONLY their own profile ───────────────────────
ALTER TABLE partner_practice_profile ENABLE ROW LEVEL SECURITY;
$migration_statement_14_2$;
    EXECUTE $migration_statement_14_3$
-- Mirrors partner_self / *_partner_access: the row's partner must resolve to the
-- caller's auth uid. FOR ALL also gates INSERT/UPDATE (WITH CHECK inherits USING).
DROP POLICY IF EXISTS partner_practice_profile_partner_access ON partner_practice_profile;
$migration_statement_14_3$;
    EXECUTE $migration_statement_14_4$
CREATE POLICY partner_practice_profile_partner_access ON partner_practice_profile
  FOR ALL
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
$migration_statement_14_4$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('015_partner_practice_profile.sql', '7e27957c3c06a3a0d1fd505fa9a04348bfd314084a58915980d76157e6535204', 'migration-runner');
  END IF;
END
$migration_guard_14$;

-- 016_invoice_number_per_partner.sql
DO $migration_guard_15$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '016_invoice_number_per_partner.sql'
  ) THEN
    EXECUTE $migration_statement_15_0$
-- 016_invoice_number_per_partner.sql
-- Tranche-2 (Fable sweep #1): fix the invoice-number multi-tenant collision.
--
-- Invoice numbers are computed PER-PARTNER (generateInvoiceNumber → RS-YYYY-0001,
-- scoped to partner_id), but 001 made invoice_number GLOBALLY unique
-- (idx_invoice_number ON invoice(invoice_number) WHERE deleted_at IS NULL). So a
-- SECOND partner's first invoice computes RS-2026-0001 — a number Roberto already
-- owns — and the INSERT hits the global unique index → 500. This swaps the global
-- index for a PER-PARTNER one so each partner has an independent RS-YYYY-NNNN run.
--
-- ⚠️ FOR JAMES — apply in the Supabase SQL editor (or psql) BEFORE merging the PR
-- (schema-before-code, same as 015). Do NOT run via the dev db:migrate runner.
--
-- DORMANT for a single coach (only fires with a 2nd partner / a test-coach account),
-- but the code fix (retry-on-conflict) now expects the per-partner constraint, so
-- apply this first. Fully idempotent (DROP … IF EXISTS / CREATE … IF NOT EXISTS).
-- SELF-CONTAINED: depends only on 001's invoice table.

-- Drop the GLOBAL unique index (invoice_number unique across ALL partners).
DROP INDEX IF EXISTS idx_invoice_number;
$migration_statement_15_0$;
    EXECUTE $migration_statement_15_1$
-- Per-partner unique: (partner_id, invoice_number), still excluding soft-deleted
-- rows. Two partners can now each hold RS-2026-0001; a partner still can't
-- duplicate its own number (the retry-on-conflict path relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_partner
  ON invoice(partner_id, invoice_number) WHERE deleted_at IS NULL;
$migration_statement_15_1$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('016_invoice_number_per_partner.sql', '21c287b422b6bef255de6985951dee61241e2546922207e958002b06fd53d693', 'migration-runner');
  END IF;
END
$migration_guard_15$;

-- 017_checkin_token_rpc.sql
DO $migration_guard_16$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '017_checkin_token_rpc.sql'
  ) THEN
    EXECUTE $migration_statement_16_0$
-- 017_checkin_token_rpc.sql
-- T1.1 (register G1+G6): the public check-in journey could never work — validateToken/
-- submitCheckin are publicProcedures whose anon Supabase client is blocked by the
-- partner-scoped RLS on check_in (runtime-proven 2026-07-19: valid pending token →
-- {valid:false}). The previous-weight context reads suffered the same block, silently
-- nulling the deviation math. Fix: a narrow SECURITY DEFINER surface, granted to anon,
-- that (a) validates a token and returns the server-side context the router needs, and
-- (b) consumes the token atomically with the full submission payload. Deviation/summary
-- stay computed in TypeScript (domain-logic freeze: no clinical logic moves into SQL).
-- No broad anon table policy is added.
-- Also G6: expiry on the token actually consumed (email promises 7 days; the old
-- expires_at lived on the unused check_in_token table).
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout.

ALTER TABLE check_in ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
$migration_statement_16_0$;
    EXECUTE $migration_statement_16_1$
UPDATE check_in SET token_expires_at = now() + interval '7 days'
WHERE status = 'pending' AND token_expires_at IS NULL;
$migration_statement_16_1$;
    EXECUTE $migration_statement_16_2$
-- ── validate: read-only; returns router context, never crosses the wire raw ──
-- (Called server-side by tRPC; the router decides what the browser sees.)
DROP FUNCTION IF EXISTS checkin_validate_token(UUID);
$migration_statement_16_2$;
    EXECUTE $migration_statement_16_3$
CREATE OR REPLACE FUNCTION checkin_validate_token(p_token UUID)
RETURNS TABLE (
  checkin_id UUID,
  client_id UUID,
  partner_id UUID,
  client_first_name TEXT,
  due_date DATE,
  prev_weight_kg NUMERIC,
  is_valid BOOLEAN,
  invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  prev NUMERIC;
BEGIN
  SELECT ci.id, ci.client_id AS cid, ci.partner_id AS pid, ci.status,
         ci.due_date AS ci_due, ci.token_expires_at,
         split_part(c.full_name, ' ', 1) AS first_name
    INTO r
    FROM check_in ci
    JOIN client c ON c.id = ci.client_id
   WHERE ci.token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DATE,
                        NULL::NUMERIC, FALSE, 'not_found'::TEXT;
    RETURN;
  END IF;

  IF r.status <> 'pending' THEN
    RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due,
                        NULL::NUMERIC, FALSE, 'already_completed'::TEXT;
    RETURN;
  END IF;

  IF r.token_expires_at IS NOT NULL AND r.token_expires_at < now() THEN
    RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due,
                        NULL::NUMERIC, FALSE, 'expired'::TEXT;
    RETURN;
  END IF;

  -- Previous weight for the TS deviation math: last completed check-in, else latest snapshot.
  SELECT ci2.weight_kg INTO prev
    FROM check_in ci2
   WHERE ci2.client_id = r.cid AND ci2.status = 'completed' AND ci2.weight_kg IS NOT NULL
   ORDER BY ci2.completed_at DESC NULLS LAST
   LIMIT 1;

  IF prev IS NULL THEN
    SELECT cs.weight_kg INTO prev
      FROM client_snapshot cs
     WHERE cs.client_id = r.cid AND cs.weight_kg IS NOT NULL
     ORDER BY cs.taken_at DESC
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due, prev, TRUE, NULL::TEXT;
END;
$$;
$migration_statement_16_3$;
    EXECUTE $migration_statement_16_4$
-- ── submit: atomic one-shot consumption; WHERE clause is the race guard ──────
DROP FUNCTION IF EXISTS checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT);
$migration_statement_16_4$;
    EXECUTE $migration_statement_16_5$
CREATE OR REPLACE FUNCTION checkin_submit_token(
  p_token UUID,
  p_weight_kg NUMERIC,
  p_energy INTEGER,
  p_sleep INTEGER,
  p_stress INTEGER,
  p_hunger INTEGER,
  p_digestive INTEGER,
  p_adherence_pct INTEGER,
  p_training_adherence INTEGER DEFAULT NULL,
  p_waist_cm NUMERIC DEFAULT NULL,
  p_hip_cm NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_photos TEXT[] DEFAULT NULL,
  p_weight_deviation_kg NUMERIC DEFAULT NULL,
  p_weight_flagged BOOLEAN DEFAULT FALSE,
  p_ai_summary TEXT DEFAULT NULL
)
RETURNS TABLE (checkin_id UUID, out_client_id UUID, out_partner_id UUID, consumed BOOLEAN, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated RECORD;
BEGIN
  UPDATE check_in ci
     SET status = 'completed',
         completed_at = now(),
         check_in_date = CURRENT_DATE,
         weight_kg = p_weight_kg,
         waist_cm = p_waist_cm,
         hip_cm = p_hip_cm,
         energy_level = p_energy,
         sleep_quality = p_sleep,
         stress_level = p_stress,
         hunger_level = p_hunger,
         digestive_health = p_digestive,
         adherence_pct = p_adherence_pct,
         training_adherence = p_training_adherence,
         notes = p_notes,
         photos = COALESCE(p_photos, ARRAY[]::TEXT[]),
         weight_deviation_kg = p_weight_deviation_kg,
         weight_flagged = COALESCE(p_weight_flagged, FALSE),
         ai_summary = p_ai_summary
   WHERE ci.token = p_token
     AND ci.status = 'pending'
     AND (ci.token_expires_at IS NULL OR ci.token_expires_at >= now())
  RETURNING ci.id, ci.client_id, ci.partner_id INTO updated;

  IF updated.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE,
      (CASE
         WHEN NOT EXISTS (SELECT 1 FROM check_in WHERE token = p_token) THEN 'not_found'
         WHEN EXISTS (SELECT 1 FROM check_in WHERE token = p_token AND status <> 'pending') THEN 'already_completed'
         ELSE 'expired'
       END)::TEXT;
  ELSE
    RETURN QUERY SELECT updated.id, updated.client_id, updated.partner_id, TRUE, NULL::TEXT;
  END IF;
END;
$$;
$migration_statement_16_5$;
    EXECUTE $migration_statement_16_6$
-- ── least-scope grants ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION checkin_validate_token(UUID) FROM PUBLIC;
$migration_statement_16_6$;
    EXECUTE $migration_statement_16_7$
REVOKE ALL ON FUNCTION checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT[], NUMERIC, BOOLEAN, TEXT) FROM PUBLIC;
$migration_statement_16_7$;
    EXECUTE $migration_statement_16_8$
GRANT EXECUTE ON FUNCTION checkin_validate_token(UUID) TO anon, authenticated;
$migration_statement_16_8$;
    EXECUTE $migration_statement_16_9$
GRANT EXECUTE ON FUNCTION checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT[], NUMERIC, BOOLEAN, TEXT) TO anon, authenticated;
$migration_statement_16_9$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('017_checkin_token_rpc.sql', 'd1922ed46e7db4fa2f0b790d425bd1cdcfd7e94e5648155b98c929de6a092525', 'migration-runner');
  END IF;
END
$migration_guard_16$;

-- 018_migration_ledger.sql
DO $migration_guard_17$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '018_migration_ledger.sql'
  ) THEN
    EXECUTE $migration_statement_17_0$
-- 018_migration_ledger.sql
-- Durable, idempotent record of repository migrations applied to this database.

CREATE TABLE IF NOT EXISTS schema_migrations_applied (
  filename TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);
$migration_statement_17_0$;
    EXECUTE $migration_statement_17_1$
ALTER TABLE schema_migrations_applied ENABLE ROW LEVEL SECURITY;
$migration_statement_17_1$;
    EXECUTE $migration_statement_17_2$
DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON schema_migrations_applied;
$migration_statement_17_2$;
    EXECUTE $migration_statement_17_3$
CREATE POLICY schema_migrations_applied_service_role_only
  ON schema_migrations_applied
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
$migration_statement_17_3$;
    EXECUTE $migration_statement_17_4$
INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
VALUES
  ('001_initial_schema.sql', NULL, 'backfill-2026-07-20'),
  ('002_client_media_storage.sql', NULL, 'backfill-2026-07-20'),
  ('003_client_media_client_write.sql', NULL, 'backfill-2026-07-20'),
  ('004_training_log_session_type_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('005_training_log_exercise_method_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('006_plan_versioning_and_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('007_placeholder_skipped.sql', NULL, 'backfill-2026-07-20'),
  ('008_plan_update_suggested_trigger.sql', NULL, 'backfill-2026-07-20'),
  ('009_legal_documents.sql', NULL, 'backfill-2026-07-20'),
  ('010_signature_requests.sql', NULL, 'backfill-2026-07-20'),
  ('011_snapshot_edit_audit.sql', NULL, 'backfill-2026-07-20'),
  ('012_reminder_settings.sql', NULL, 'backfill-2026-07-20'),
  ('013_urgent_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('014_session_kcal_override.sql', NULL, 'backfill-2026-07-20'),
  ('015_partner_practice_profile.sql', NULL, 'backfill-2026-07-20'),
  ('016_invoice_number_per_partner.sql', NULL, 'backfill-2026-07-20'),
  ('017_checkin_token_rpc.sql', NULL, 'backfill-2026-07-20')
ON CONFLICT (filename) DO NOTHING;
$migration_statement_17_4$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('018_migration_ledger.sql', '99cc8bfede7764cd264eb6f573ba5ee41083dda030938388f799b6154992021c', 'migration-runner');
  END IF;
END
$migration_guard_17$;

-- 019_delivery_outbox_and_active_invariant.sql
DO $migration_guard_18$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '019_delivery_outbox_and_active_invariant.sql'
  ) THEN
    EXECUTE $migration_statement_18_0$
-- 019_delivery_outbox_and_active_invariant.sql
-- T1.6a (register G8+G12): plan approval currently commits DB state, then fire-and-forgets
-- the Inngest event (swallowed on failure → client email permanently lost), and nothing
-- enforces one active plan per client (portal masks multiplicity with LIMIT 1).
-- Fix: a transactional approve — archive prior actives + activate + write a durable
-- outbox row — in ONE Postgres function, plus a partial unique index as the invariant.
-- G9's view signal (first_viewed_at) is added here; its consumers land in T1.6b.
-- Idempotent throughout.

-- ── durable delivery outbox ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
$migration_statement_18_0$;
    EXECUTE $migration_statement_18_1$
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON delivery_outbox(created_at) WHERE dispatched_at IS NULL;
$migration_statement_18_1$;
    EXECUTE $migration_statement_18_2$
ALTER TABLE delivery_outbox ENABLE ROW LEVEL SECURITY;
$migration_statement_18_2$;
    EXECUTE $migration_statement_18_3$
-- No policies on purpose: service-role only (bypasses RLS); anon/authenticated see nothing.

-- ── G9 view signal ───────────────────────────────────────────────────────────
ALTER TABLE plan ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;
$migration_statement_18_3$;
    EXECUTE $migration_statement_18_4$
-- ── one-active-plan invariant (G12) ─────────────────────────────────────────
-- Data fix first: keep only the NEWEST active per client, archive the rest.
UPDATE plan p
   SET status = 'archived'
 WHERE p.status = 'active'
   AND p.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM plan p2
      WHERE p2.client_id = p.client_id
        AND p2.status = 'active'
        AND p2.deleted_at IS NULL
        AND (p2.created_at > p.created_at OR (p2.created_at = p.created_at AND p2.id > p.id))
   );
$migration_statement_18_4$;
    EXECUTE $migration_statement_18_5$
CREATE UNIQUE INDEX IF NOT EXISTS uniq_plan_one_active_per_client
  ON plan(client_id) WHERE status = 'active' AND deleted_at IS NULL;
$migration_statement_18_5$;
    EXECUTE $migration_statement_18_6$
-- ── transactional approve ────────────────────────────────────────────────────
-- Runs as one transaction: archive prior actives → activate target → outbox row.
-- Ownership is asserted IN the function (partner_id param must match the row);
-- the router (protectedProcedure) supplies its own ctx.partnerId.
DROP FUNCTION IF EXISTS approve_plan_txn(UUID, UUID, JSONB);
$migration_statement_18_6$;
    EXECUTE $migration_statement_18_7$
CREATE OR REPLACE FUNCTION approve_plan_txn(
  p_plan_id UUID,
  p_partner_id UUID,
  p_event_payload JSONB,
  p_start_date DATE DEFAULT NULL
)
RETURNS TABLE (approved BOOLEAN, outbox_id UUID, prior_archived INTEGER, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target RECORD;
  archived_count INTEGER := 0;
  ob_id UUID;
BEGIN
  SELECT id, client_id, status INTO target
    FROM plan
   WHERE id = p_plan_id AND partner_id = p_partner_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 'not_found'::TEXT; RETURN;
  END IF;
  IF target.status = 'active' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 'already_active'::TEXT; RETURN;
  END IF;
  IF target.status NOT IN ('draft') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, ('bad_status:' || target.status)::TEXT; RETURN;
  END IF;

  UPDATE plan SET status = 'archived'
   WHERE client_id = target.client_id AND status = 'active' AND deleted_at IS NULL;
  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- start_date preserved if set; else the activation date (feedback cadence anchor).
  UPDATE plan SET status = 'active',
                  start_date = COALESCE(start_date, p_start_date, CURRENT_DATE)
   WHERE id = p_plan_id;

  INSERT INTO delivery_outbox (event_name, payload)
  VALUES ('plan/delivered', p_event_payload)
  RETURNING id INTO ob_id;

  RETURN QUERY SELECT TRUE, ob_id, archived_count, NULL::TEXT;
END;
$$;
$migration_statement_18_7$;
    EXECUTE $migration_statement_18_8$
REVOKE ALL ON FUNCTION approve_plan_txn(UUID, UUID, JSONB, DATE) FROM PUBLIC;
$migration_statement_18_8$;
    EXECUTE $migration_statement_18_9$
GRANT EXECUTE ON FUNCTION approve_plan_txn(UUID, UUID, JSONB, DATE) TO service_role;
$migration_statement_18_9$;
    EXECUTE $migration_statement_18_10$
-- ── outbox bookkeeping helpers (service-role only) ───────────────────────────
CREATE OR REPLACE FUNCTION outbox_mark_dispatched(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ UPDATE delivery_outbox SET dispatched_at = now(), attempts = attempts + 1 WHERE id = p_id; $$;
$migration_statement_18_10$;
    EXECUTE $migration_statement_18_11$
CREATE OR REPLACE FUNCTION outbox_mark_failed(p_id UUID, p_error TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ UPDATE delivery_outbox SET attempts = attempts + 1, last_error = left(p_error, 500) WHERE id = p_id; $$;
$migration_statement_18_11$;
    EXECUTE $migration_statement_18_12$
REVOKE ALL ON FUNCTION outbox_mark_dispatched(UUID) FROM PUBLIC;
$migration_statement_18_12$;
    EXECUTE $migration_statement_18_13$
REVOKE ALL ON FUNCTION outbox_mark_failed(UUID, TEXT) FROM PUBLIC;
$migration_statement_18_13$;
    EXECUTE $migration_statement_18_14$
GRANT EXECUTE ON FUNCTION outbox_mark_dispatched(UUID) TO service_role;
$migration_statement_18_14$;
    EXECUTE $migration_statement_18_15$
GRANT EXECUTE ON FUNCTION outbox_mark_failed(UUID, TEXT) TO service_role;
$migration_statement_18_15$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('019_delivery_outbox_and_active_invariant.sql', '28c2cb4e10bab1363a261d9eb9502b52b42c7bc4c18a252396c59128b3156a57', 'migration-runner');
  END IF;
END
$migration_guard_18$;

-- 020_intake_txn.sql
DO $migration_guard_19$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '020_intake_txn.sql'
  ) THEN
    EXECUTE $migration_statement_19_0$
-- 020_intake_txn.sql
-- T1.7 (register G10): client + initial snapshot are one atomic, idempotent write.

CREATE TABLE IF NOT EXISTS intake_idempotency (
  key TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partner(id),
  client_id UUID NOT NULL REFERENCES client(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
$migration_statement_19_0$;
    EXECUTE $migration_statement_19_1$
ALTER TABLE intake_idempotency ENABLE ROW LEVEL SECURITY;
$migration_statement_19_1$;
    EXECUTE $migration_statement_19_2$
REVOKE ALL ON TABLE intake_idempotency FROM PUBLIC, anon, authenticated;
$migration_statement_19_2$;
    EXECUTE $migration_statement_19_3$
DROP FUNCTION IF EXISTS intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB);
$migration_statement_19_3$;
    EXECUTE $migration_statement_19_4$
CREATE OR REPLACE FUNCTION intake_create_client_with_snapshot(
  p_partner_id UUID,
  p_idempotency_key TEXT,
  p_client JSONB,
  p_snapshot JSONB
)
RETURNS TABLE (client_id UUID, snapshot_id UUID, was_replay BOOLEAN, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_client_id UUID;
  reserved_partner_id UUID;
  new_client_id UUID := gen_random_uuid();
  new_snapshot_id UUID := gen_random_uuid();
  replay_snapshot_id UUID;
  failure_phase TEXT := 'idempotency';
BEGIN
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'invalid_idempotency_key'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO intake_idempotency (key, partner_id, client_id)
    VALUES (p_idempotency_key, p_partner_id, new_client_id)
    ON CONFLICT (key) DO NOTHING
    RETURNING intake_idempotency.client_id INTO reserved_client_id;

    IF reserved_client_id IS NULL THEN
      SELECT i.partner_id, i.client_id
        INTO reserved_partner_id, reserved_client_id
        FROM intake_idempotency i
       WHERE i.key = p_idempotency_key;

      IF reserved_partner_id IS DISTINCT FROM p_partner_id THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'idempotency_conflict'::TEXT;
        RETURN;
      END IF;

      SELECT cs.id INTO replay_snapshot_id
        FROM client_snapshot cs
       WHERE cs.client_id = reserved_client_id
       ORDER BY cs.taken_at ASC, cs.id ASC
       LIMIT 1;

      IF replay_snapshot_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'replay_incomplete'::TEXT;
      ELSE
        RETURN QUERY SELECT reserved_client_id, replay_snapshot_id, TRUE, NULL::TEXT;
      END IF;
      RETURN;
    END IF;

    failure_phase := 'client';
    INSERT INTO client (id, partner_id, full_name, email, phone, date_of_birth, sex, notes, tags)
    VALUES (
      new_client_id,
      p_partner_id,
      p_client->>'full_name',
      p_client->>'email',
      p_client->>'phone',
      (p_client->>'date_of_birth')::DATE,
      p_client->>'sex',
      p_client->>'notes',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_client->'tags', '[]'::JSONB)))
    );

    failure_phase := 'snapshot';
    INSERT INTO client_snapshot (
      id, client_id, weight_kg, height_cm, age_years, daily_steps,
      occupational_level, week_schedule, skinfold_data, body_fat_method,
      body_fat_pct, lean_mass_kg, fat_mass_kg, bmr_kcal, notes
    )
    VALUES (
      new_snapshot_id,
      new_client_id,
      (p_snapshot->>'weight_kg')::NUMERIC,
      (p_snapshot->>'height_cm')::NUMERIC,
      (p_snapshot->>'age_years')::INTEGER,
      (p_snapshot->>'daily_steps')::INTEGER,
      p_snapshot->>'occupational_level',
      ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'week_schedule')),
      p_snapshot->'skinfold_data',
      p_snapshot->>'body_fat_method',
      (p_snapshot->>'body_fat_pct')::NUMERIC,
      (p_snapshot->>'lean_mass_kg')::NUMERIC,
      (p_snapshot->>'fat_mass_kg')::NUMERIC,
      (p_snapshot->>'bmr_kcal')::INTEGER,
      p_snapshot->>'notes'
    );

    RETURN QUERY SELECT new_client_id, new_snapshot_id, FALSE, NULL::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, (failure_phase || '_failed')::TEXT;
  END;
END;
$$;
$migration_statement_19_4$;
    EXECUTE $migration_statement_19_5$
REVOKE ALL ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
$migration_statement_19_5$;
    EXECUTE $migration_statement_19_6$
GRANT EXECUTE ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  TO service_role;
$migration_statement_19_6$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('020_intake_txn.sql', '0ef84e5078470a7d65bc10bf78911feefae1ba30d0ba80ba1477744cea732766', 'migration-runner');
  END IF;
END
$migration_guard_19$;

-- 021_gdpr_mechanism.sql
DO $migration_guard_20$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '021_gdpr_mechanism.sql'
  ) THEN
    EXECUTE $migration_statement_20_0$
-- 021_gdpr_mechanism.sql
-- GDPR operational mechanism only. Legal wording and consent text remain counsel-owned.
-- Idempotent: table/index creation is conditional; policies and functions converge on re-run.

-- The requested anonymization field is part of the client identity surface.
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
$migration_statement_20_0$;
    EXECUTE $migration_statement_20_1$
CREATE TABLE IF NOT EXISTS public.consent_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.client(id),
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  signature_request_id UUID REFERENCES public.signature_request(id) ON DELETE SET NULL
);
$migration_statement_20_1$;
    EXECUTE $migration_statement_20_2$
CREATE INDEX IF NOT EXISTS idx_consent_record_client
  ON public.consent_record(client_id, accepted_at DESC);
$migration_statement_20_2$;
    EXECUTE $migration_statement_20_3$
CREATE INDEX IF NOT EXISTS idx_consent_record_signature_request
  ON public.consent_record(signature_request_id)
  WHERE signature_request_id IS NOT NULL;
$migration_statement_20_3$;
    EXECUTE $migration_statement_20_4$
ALTER TABLE public.consent_record ENABLE ROW LEVEL SECURITY;
$migration_statement_20_4$;
    EXECUTE $migration_statement_20_5$
DROP POLICY IF EXISTS consent_record_partner_read ON public.consent_record;
$migration_statement_20_5$;
    EXECUTE $migration_statement_20_6$
CREATE POLICY consent_record_partner_read ON public.consent_record
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT c.id
      FROM public.client c
      WHERE c.partner_id IN (
        SELECT p.id FROM public.partner p WHERE p.auth_user_id = auth.uid()
      )
    )
  );
$migration_statement_20_6$;
    EXECUTE $migration_statement_20_7$
DROP POLICY IF EXISTS consent_record_service_insert ON public.consent_record;
$migration_statement_20_7$;
    EXECUTE $migration_statement_20_8$
CREATE POLICY consent_record_service_insert ON public.consent_record
  FOR INSERT TO service_role WITH CHECK (true);
$migration_statement_20_8$;
    EXECUTE $migration_statement_20_9$
DROP POLICY IF EXISTS consent_record_service_update ON public.consent_record;
$migration_statement_20_9$;
    EXECUTE $migration_statement_20_10$
CREATE POLICY consent_record_service_update ON public.consent_record
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
$migration_statement_20_10$;
    EXECUTE $migration_statement_20_11$
DROP POLICY IF EXISTS consent_record_service_delete ON public.consent_record;
$migration_statement_20_11$;
    EXECUTE $migration_statement_20_12$
CREATE POLICY consent_record_service_delete ON public.consent_record
  FOR DELETE TO service_role USING (true);
$migration_statement_20_12$;
    EXECUTE $migration_statement_20_13$
REVOKE ALL ON TABLE public.consent_record FROM anon, authenticated;
$migration_statement_20_13$;
    EXECUTE $migration_statement_20_14$
GRANT SELECT ON TABLE public.consent_record TO authenticated;
$migration_statement_20_14$;
    EXECUTE $migration_statement_20_15$
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consent_record TO service_role;
$migration_statement_20_15$;
    EXECUTE $migration_statement_20_16$
CREATE OR REPLACE FUNCTION public.gdpr_export_client(
  p_partner_id UUID,
  p_client_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'client not found for partner';
  END IF;

  RETURN jsonb_build_object(
    'client', (
      SELECT to_jsonb(c)
      FROM public.client c
      WHERE c.id = p_client_id AND c.partner_id = p_partner_id
    ),
    'client_snapshot', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_snapshot WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'check_in', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.check_in
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'diary_entry', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.diary_entry WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'training_log', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.training_log
        WHERE client_id = p_client_id
          AND (partner_id = p_partner_id OR partner_id IS NULL)
      ) r
    ), '[]'::jsonb),
    'plan', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.plan
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'invoice', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.invoice
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'document', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.document
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'message', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.message WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'notification', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.notification
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'signature_request', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.signature_request
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'legal_document_version', COALESCE((
      SELECT jsonb_agg(to_jsonb(ldv))
      FROM public.legal_document_version ldv
      WHERE EXISTS (
        SELECT 1
        FROM public.signature_request sr
        WHERE sr.document_version_id = ldv.id
          AND sr.client_id = p_client_id
          AND sr.partner_id = p_partner_id
      )
    ), '[]'::jsonb),
    'legal_document', COALESCE((
      SELECT jsonb_agg(to_jsonb(ld))
      FROM public.legal_document ld
      WHERE ld.partner_id = p_partner_id
        AND EXISTS (
          SELECT 1
          FROM public.legal_document_version ldv
          JOIN public.signature_request sr ON sr.document_version_id = ldv.id
          WHERE ldv.legal_document_id = ld.id
            AND sr.client_id = p_client_id
            AND sr.partner_id = p_partner_id
        )
    ), '[]'::jsonb),
    'snapshot_edit_audit', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.snapshot_edit_audit WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'urgent_feedback', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.urgent_feedback
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'client_reminder_settings', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_reminder_settings WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'consent_record', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.consent_record WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'client_media', COALESCE((
      SELECT jsonb_agg(to_jsonb(o))
      FROM storage.objects o
      WHERE o.bucket_id = 'client-media'
        AND (
          o.name LIKE 'client-photos/' || p_partner_id::text || '/' || p_client_id::text || '/%'
          OR o.name LIKE 'training-screenshots/' || p_partner_id::text || '/' || p_client_id::text || '/%'
        )
    ), '[]'::jsonb)
  );
END;
$$;
$migration_statement_20_16$;
    EXECUTE $migration_statement_20_17$
CREATE OR REPLACE FUNCTION public.gdpr_erase_client(
  p_partner_id UUID,
  p_client_id UUID,
  p_confirm TEXT
) RETURNS TABLE (
  erased BOOLEAN,
  tables_touched INTEGER,
  invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  erased := false;
  tables_touched := 0;
  invalid_reason := NULL;

  IF p_confirm IS DISTINCT FROM 'ERASE' THEN
    invalid_reason := 'confirmation_mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    invalid_reason := 'client_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  DELETE FROM public.diary_entry WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.check_in
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.training_log
  WHERE client_id = p_client_id
    AND (partner_id = p_partner_id OR partner_id IS NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.snapshot_edit_audit WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Plans are retained, so their snapshot FK must be cleared before deleting snapshots.
  -- This is not identity severance: the retained plan still points to the anonymized client.
  UPDATE public.plan
  SET snapshot_id = NULL, updated_at = now()
  WHERE client_id = p_client_id
    AND partner_id = p_partner_id
    AND snapshot_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_snapshot WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.notification
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.message WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.urgent_feedback
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_reminder_settings WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.document
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.signature_request
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.consent_record WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Fiscal retention choice: plan and invoice rows remain linked to the client row.
  -- The client identity is anonymized in place so retained clinical/fiscal records keep
  -- referential integrity without retaining the listed direct identifiers.
  UPDATE public.client
  SET full_name = 'Cliente eliminato',
      email = NULL,
      phone = NULL,
      codice_fiscale = NULL,
      notes = NULL,
      status = 'archived',
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Auth users and Storage objects are external to this transaction. The protected
  -- server router performs those two steps and reports each result independently.
  erased := true;
  RETURN NEXT;
END;
$$;
$migration_statement_20_17$;
    EXECUTE $migration_statement_20_18$
REVOKE ALL ON FUNCTION public.gdpr_export_client(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
$migration_statement_20_18$;
    EXECUTE $migration_statement_20_19$
REVOKE ALL ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
$migration_statement_20_19$;
    EXECUTE $migration_statement_20_20$
GRANT EXECUTE ON FUNCTION public.gdpr_export_client(UUID, UUID) TO service_role;
$migration_statement_20_20$;
    EXECUTE $migration_statement_20_21$
GRANT EXECUTE ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT) TO service_role;
$migration_statement_20_21$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('021_gdpr_mechanism.sql', '1469caa574cd9d8257590f4343df916deae3d2b77a372cb2e899a71061d0110e', 'migration-runner');
  END IF;
END
$migration_guard_20$;
