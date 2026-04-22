-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Work Schedule & Leave Policy Schema Upgrade
-- Safe to re-run (IF NOT EXISTS / ALTER COLUMN IF NOT EXISTS throughout)
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. leave_types — half day, short leave, per-leave equivalents ──────────
-- half_days_per_leave  : integer ratio — how many half days = 1 full leave day
--                        e.g. 2 means "2 half day applications consume 1 CL"
-- short_leaves_per_leave: integer ratio — how many short leaves = 1 full leave day
--                        e.g. 4 means "4 short leave applications consume 1 CL"
-- These are tenant-configured during setup and editable from Leave Settings.

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS half_day_allowed        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_leave_allowed     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS half_days_per_leave     SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS short_leaves_per_leave  SMALLINT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS co_employee_can_split   BOOLEAN NOT NULL DEFAULT false,
  -- For Comp Off: whether employee can choose half-day or must take full day
  ADD COLUMN IF NOT EXISTS co_expiry_days          INTEGER DEFAULT NULL;
  -- For Comp Off: NULL = never expires, otherwise expires after N days

-- ── 2. profiles — per-employee weekly off day ──────────────────────────────
-- 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
-- NULL = use company's fixed schedule (default)
-- Only meaningful when company's app_settings.week_off_type = 'rotating'

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_off_day SMALLINT DEFAULT NULL
  CHECK (weekly_off_day IS NULL OR (weekly_off_day >= 0 AND weekly_off_day <= 6));

-- ── 3. app_settings — work schedule extensions ────────────────────────────
-- week_off_type:
--   'fixed'    = all employees share the same off day(s), defined by week_off_days
--   'rotating' = each employee has their own off day assigned in profiles.weekly_off_day
--
-- week_off_days: array of day-of-week integers (0=Sun..6=Sat)
--   Used only when week_off_type = 'fixed'
--   Default: [0] (Sunday)
--
-- overtime_tracking:
--   false = overtime hours are not computed or stored (most basic tenants)
--   true  = overtime_minutes computed at checkout vs work_end, stored in attendance_records
--           NEVER displayed to employees — superadmin/admin view only

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS week_off_type     TEXT NOT NULL DEFAULT 'fixed'
    CHECK (week_off_type IN ('fixed', 'rotating')),
  ADD COLUMN IF NOT EXISTS week_off_days     INTEGER[] NOT NULL DEFAULT '{0}',
  ADD COLUMN IF NOT EXISTS overtime_tracking BOOLEAN NOT NULL DEFAULT false;

-- ── 4. attendance_records — overtime tracking ─────────────────────────────
-- Computed at check-out as: max(0, checkout_epoch - work_end_epoch) in minutes.
-- Only populated when app_settings.overtime_tracking = true.
-- Never surfaced to employees.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER NOT NULL DEFAULT 0;

-- ── 5. Verify ─────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('leave_types', 'profiles', 'app_settings', 'attendance_records')
  AND column_name IN (
    'half_day_allowed', 'short_leave_allowed', 'half_days_per_leave',
    'short_leaves_per_leave', 'co_employee_can_split', 'co_expiry_days',
    'weekly_off_day', 'week_off_type', 'week_off_days',
    'overtime_tracking', 'overtime_minutes'
  )
ORDER BY table_name, column_name;
