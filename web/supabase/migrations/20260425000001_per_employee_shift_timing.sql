-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Per-Employee Shift Timing
-- Feature: per_employee_shift (Tier 3 / Advanced only)
-- Each employee can have their own prescribed check-in (shift_start_time)
-- and check-out deadline (shift_end_time), from which hours_per_day is
-- auto-computed. Used for late detection, early-out warnings, and reports.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  -- Prescribed check-in time for this employee, e.g. "10:00"
  ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT NULL
    CHECK (shift_start_time IS NULL OR shift_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Prescribed check-out deadline for this employee, e.g. "20:00"
  ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT NULL
    CHECK (shift_end_time IS NULL OR shift_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Verify
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('shift_start_time', 'shift_end_time', 'hours_per_day')
ORDER BY column_name;
