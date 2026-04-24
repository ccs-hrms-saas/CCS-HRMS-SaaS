-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Work Schedule Hours Capability
-- Adds hours_per_day to app_settings (org-wide, wizard-locked for Tier 1)
-- Adds hours_per_day to profiles (per-employee override, Tier 3 only)
-- Safe to re-run (ADD COLUMN IF NOT EXISTS throughout)
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. app_settings ───────────────────────────────────────────────────────────
-- hours_per_day       : The org-wide daily working hours target.
--                       Set during the onboarding wizard and saved here.
--                       Tier 1 tenants: locked for 90 days after hours_per_day_set_at.
--                       Tier 2+ tenants: freely editable any time via Leave Settings.
-- hours_per_day_set_at: Timestamp of the last change. Used to enforce the 90-day lock
--                       for Tier 1 tenants. Initialized to NOW() on first wizard completion.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hours_per_day        NUMERIC(4,2) NOT NULL DEFAULT 8.5
    CHECK (hours_per_day > 0 AND hours_per_day <= 24),
  ADD COLUMN IF NOT EXISTS hours_per_day_set_at TIMESTAMPTZ  DEFAULT NOW();

-- ── 2. profiles ───────────────────────────────────────────────────────────────
-- hours_per_day : Per-employee override (Tier 3 / Advanced only).
--                 NULL = use the company default from app_settings.hours_per_day.
--                 Used by shift-based organisations where different employees
--                 work different daily hours.
-- Resolution order: profiles.hours_per_day ?? app_settings.hours_per_day ?? 8.5

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(4,2) DEFAULT NULL
  CHECK (hours_per_day IS NULL OR (hours_per_day > 0 AND hours_per_day <= 24));

-- ── 3. Backfill existing app_settings rows ────────────────────────────────────
-- For tenants that already completed the wizard, derive hours_per_day from
-- the stored work_start / work_end times if available, else default to 8.5.
-- work_start and work_end are stored as 'HH:MM' text strings.

UPDATE public.app_settings
SET
  hours_per_day = CASE
    WHEN work_start IS NOT NULL AND work_end IS NOT NULL
    THEN ROUND(
      (
        (EXTRACT(HOUR FROM work_end::TIME) * 60 + EXTRACT(MINUTE FROM work_end::TIME))
        -
        (EXTRACT(HOUR FROM work_start::TIME) * 60 + EXTRACT(MINUTE FROM work_start::TIME))
      ) / 60.0,
      2
    )
    ELSE 8.5
  END,
  hours_per_day_set_at = NOW()
WHERE hours_per_day = 8.5; -- only touch rows still at the default

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
SELECT
  column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('app_settings', 'profiles')
  AND column_name IN ('hours_per_day', 'hours_per_day_set_at')
ORDER BY table_name, column_name;
