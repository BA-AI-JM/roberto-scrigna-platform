-- Seed data for local development
-- Auth user must be created via API after db reset (see scripts/seed-auth.sh)
-- This file only seeds application tables.

-- ── Partner record (Roberto) — will be linked after auth user creation ───────
-- auth_user_id will be updated by the seed script after creating the auth user

-- ── Sample clients (no auth required) ────────────────────────────────────────

-- These will be inserted after the partner record is created via the auth callback
-- For now, keep seed.sql minimal to avoid auth schema conflicts
