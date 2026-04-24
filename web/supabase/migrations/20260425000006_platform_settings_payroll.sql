-- ══════════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Platform Default Settings + Attendance-Based Payroll
--
-- 1. platform_default_settings — developer-controlled global defaults
--    Developer can toggle each setting ON/OFF globally, mark it as
--    overridable_by_tenant or locked, and push it to all tenants at once.
--
-- 2. app_settings additions — per-tenant payroll & attendance config
--    These are seeded from platform_default_settings on tenant creation.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. platform_default_settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_default_settings (
  key                   TEXT PRIMARY KEY,
  value                 JSONB NOT NULL,            -- the actual setting value
  label                 TEXT NOT NULL,             -- human-readable name
  description           TEXT,                      -- tooltip/help text
  category              TEXT DEFAULT 'general',   -- 'payroll' | 'kiosk' | 'leave' | 'attendance' | 'general'
  input_type            TEXT DEFAULT 'toggle',    -- 'toggle' | 'number' | 'select'
  options               JSONB,                     -- for 'select': [{value, label}]
  overridable_by_tenant BOOLEAN DEFAULT true,      -- false = tenant cannot change it
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.platform_default_settings ENABLE ROW LEVEL SECURITY;

-- Only platform_owner / platform_admin can read/write these
DROP POLICY IF EXISTS "Platform staff manage default settings" ON public.platform_default_settings;
CREATE POLICY "Platform staff manage default settings"
  ON public.platform_default_settings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND system_role IN ('platform_owner', 'platform_admin')
    )
  );

-- ── 2. Seed platform defaults ─────────────────────────────────────────────────
INSERT INTO public.platform_default_settings
  (key, value, label, description, category, input_type, options, overridable_by_tenant)
VALUES
  -- ── Payroll ──────────────────────────────────────────────────────────────
  ('lwp_deduction_mode',
   '"attendance_based"',
   'LWP Deduction Mode',
   'How absent days are converted to salary deductions. "attendance_based" auto-calculates from actual punch records + approved leaves. "formal_lwp_only" only counts formally filed LWP leave requests.',
   'payroll', 'select',
   '[{"value":"attendance_based","label":"Attendance-Based (Recommended)"},{"value":"formal_lwp_only","label":"Formal LWP Leave Only"}]',
   true),

  ('payroll_prorate_mid_joiners',
   'true',
   'Pro-rate Mid-Month Joiners',
   'When ON, employees who join after the 1st are paid only for working days from their joining date. When OFF, they always get the full monthly salary.',
   'payroll', 'toggle', null, true),

  ('payroll_visible_after_day',
   '20',
   'Employee Payslip Visible After Day',
   'Employees can view their current-month payslip only after this calendar day. Admin always has full access. Set to 1 to give immediate access.',
   'payroll', 'number', null, true),

  ('attendance_grace_days',
   '0',
   'Attendance Grace Days',
   'Number of absent days per month to forgive before LWP deduction starts. Set to 0 for strict mode.',
   'payroll', 'number', null, true),

  -- ── Kiosk ────────────────────────────────────────────────────────────────
  ('kiosk_require_pin',
   'true',
   'Kiosk: Require PIN',
   'When ON, employees must enter their 4-digit rotating PIN to punch attendance. Disable at your own risk — ghost punches become possible.',
   'kiosk', 'toggle', null, false),

  ('kiosk_require_photo',
   'true',
   'Kiosk: Require Photo Capture',
   'When ON, the kiosk camera opens automatically on each punch for a selfie. Disabling removes the photo evidence layer.',
   'kiosk', 'toggle', null, false),

  -- ── Leave ─────────────────────────────────────────────────────────────────
  ('leave_auto_lapse_on_month_end',
   'true',
   'Auto-Lapse Unused Leaves at Month End',
   'When ON, ML and other lapse-eligible leave balances are zeroed at the end of each month per their policy rules.',
   'leave', 'toggle', null, true),

  -- ── Attendance ────────────────────────────────────────────────────────────
  ('attendance_overtime_tracking',
   'false',
   'Overtime Tracking',
   'When ON, hours worked beyond the daily shift target are tracked and stored as overtime hours.',
   'attendance', 'toggle', null, true)

ON CONFLICT (key) DO NOTHING;

-- ── 3. Add payroll settings columns to app_settings ───────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS lwp_deduction_mode          TEXT    DEFAULT 'attendance_based',
  ADD COLUMN IF NOT EXISTS payroll_prorate_mid_joiners  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS payroll_visible_after_day    INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS attendance_grace_days        INTEGER DEFAULT 0;

-- ── 4. Backfill existing tenant app_settings from platform defaults ───────────
UPDATE public.app_settings
SET
  lwp_deduction_mode           = COALESCE(lwp_deduction_mode,          'attendance_based'),
  payroll_prorate_mid_joiners  = COALESCE(payroll_prorate_mid_joiners,  true),
  payroll_visible_after_day    = COALESCE(payroll_visible_after_day,    20),
  attendance_grace_days        = COALESCE(attendance_grace_days,        0);

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT key, value, label, category, overridable_by_tenant
FROM public.platform_default_settings
ORDER BY category, key;
