-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: EL accrual engine + year type configuration
-- Adds columns for EL permanent-only, credit mode, half-year splits,
-- accrual days, and org-level year type (FY / Calendar / Diwali)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. leave_types: EL-specific columns ────────────────────────────────────
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS permanent_only     BOOLEAN NOT NULL DEFAULT false,
  -- true = only credited to confirmed/permanent employees
  ADD COLUMN IF NOT EXISTS credit_mode        TEXT NOT NULL DEFAULT 'upfront'
    CHECK (credit_mode IN ('upfront', 'half_yearly', 'accrual')),
  -- 'upfront'     = all EL days credited at start of year
  -- 'half_yearly'  = split into 2 halves (first_half_credit + second_half_credit)
  -- 'accrual'      = earn 1 EL per X working days after confirmation
  ADD COLUMN IF NOT EXISTS first_half_credit  INTEGER DEFAULT NULL,
  -- EL days credited in first half of the year (only if credit_mode = 'half_yearly')
  ADD COLUMN IF NOT EXISTS second_half_credit INTEGER DEFAULT NULL;
  -- EL days credited in second half of the year (only if credit_mode = 'half_yearly')
  -- NOTE: accrual_rate column already exists and stores "worked days to earn 1 EL"

-- ── 2. app_settings: organisation year type ────────────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS year_type TEXT NOT NULL DEFAULT 'financial'
    CHECK (year_type IN ('financial', 'calendar', 'diwali'));
-- 'financial' = April–March (default Indian FY)
-- 'calendar'  = January–December
-- 'diwali'    = Diwali to Diwali (varies each year, stored as custom start date)

COMMENT ON COLUMN public.leave_types.permanent_only IS
  'When true, this leave type is only available to confirmed/permanent employees.';
COMMENT ON COLUMN public.leave_types.credit_mode IS
  'How EL is credited: upfront (all at once), half_yearly (2 splits), or accrual (earn per X days).';
COMMENT ON COLUMN public.app_settings.year_type IS
  'Org year cycle: financial (Apr-Mar), calendar (Jan-Dec), or diwali (custom).';
