-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Capability Expansion Migration
-- Run in: Supabase Studio → mhmuztwhttjcrmixvstt → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend leave_types with payroll-wiring + policy columns ─────────────
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS eligible_for_deficit_adj   BOOLEAN NOT NULL DEFAULT false,
  -- "Employee can surrender this leave type to clear an hour deficit (Standard/Advanced leave tier)"
  ADD COLUMN IF NOT EXISTS counts_as_lwp_for_payroll  BOOLEAN NOT NULL DEFAULT false,
  -- "Taking this leave type results in a salary deduction — true only for LWP type"
  ADD COLUMN IF NOT EXISTS is_ml_type                 BOOLEAN NOT NULL DEFAULT false,
  -- "Menstruation Leave — enables unused-month lapse tracking. Advanced leave tier only."
  ADD COLUMN IF NOT EXISTS max_consecutive_days       INTEGER DEFAULT NULL,
  -- "Max days in one application. NULL = unlimited. Set 2 for Casual Leave."
  ADD COLUMN IF NOT EXISTS allow_half_day             BOOLEAN NOT NULL DEFAULT false,
  -- "Employees can apply for a half-day of this leave type"
  ADD COLUMN IF NOT EXISTS short_leave_hours          NUMERIC DEFAULT NULL;
  -- "Non-null = short leave. Value is max hours per short leave request. e.g. 2.0"

-- ── 2. Extend payroll_records with lock + override columns ─────────────────
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ DEFAULT NULL,
  -- "Stamped on/after pay_day of next month. After this the record is immutable."
  ADD COLUMN IF NOT EXISTS override_notes TEXT DEFAULT NULL,
  -- "Superadmin's reason when manually overriding computed LWP days."
  ADD COLUMN IF NOT EXISTS lwp_override   NUMERIC DEFAULT NULL;
  -- "When set, this replaces the auto-computed LWP days in payroll calculation."

-- ── 3. Extend profiles with ML eligibility + custom job role ───────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ml_eligible BOOLEAN NOT NULL DEFAULT false,
  -- "Set to true for female employees. Only ml_eligible employees are tracked
  --  in ml_lapse_records for the unused-ML reward system."
  ADD COLUMN IF NOT EXISTS job_role       TEXT DEFAULT NULL;
  -- "Custom job role label defined per company e.g. 'HR Executive', 'Department Head'.
  --  Used in Advanced profiles tier for fine-grained approval routing."

-- ── 4. ml_lapse_records — tracks unused ML months per employee ─────────────
CREATE TABLE IF NOT EXISTS public.ml_lapse_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  ml_taken      BOOLEAN NOT NULL DEFAULT false,
  -- false = ML was not used this month (lapse). true = ML was taken (no lapse).
  award_granted BOOLEAN NOT NULL DEFAULT false,
  -- true = this record was the Nth lapse that triggered a bonus leave credit
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, year, month)
);

ALTER TABLE public.ml_lapse_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for ml_lapse_records"
  ON public.ml_lapse_records
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

CREATE POLICY "Admins manage ml_lapse_records"
  ON public.ml_lapse_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = ml_lapse_records.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY "Employees read own ml_lapse_records"
  ON public.ml_lapse_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── 5. reimbursement_types — tenant-defined expense categories ─────────────
CREATE TABLE IF NOT EXISTS public.reimbursement_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  max_amount       NUMERIC DEFAULT NULL,
  -- NULL = no cap per individual claim
  requires_receipt BOOLEAN NOT NULL DEFAULT true,
  -- Can be set to false only when module property allow_optional_receipt = true (Advanced)
  approval_chain   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of approval stages:
  -- [
  --   { "stage": 1, "approver_type": "role",     "value": "admin",          "label": "HR Admin"       },
  --   { "stage": 2, "approver_type": "job_role",  "value": "Department Head","label": "Dept. Head"     },
  --   { "stage": 3, "approver_type": "person",    "value": "<profile_uuid>", "label": "MD Sharma"      }
  -- ]
  -- approver_type options: "role" | "job_role" | "department" | "person"
  -- Available types gated by module tier (role only in Basic, all in Advanced)
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.reimbursement_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for reimbursement_types"
  ON public.reimbursement_types
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

CREATE POLICY "Admins manage reimbursement_types"
  ON public.reimbursement_types
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = reimbursement_types.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY "Employees read active reimbursement_types"
  ON public.reimbursement_types
  FOR SELECT
  USING (
    is_active = true
    AND public.can_access_company(company_id)
  );

-- ── 6. reimbursement_requests — employee expense claims ────────────────────
CREATE TABLE IF NOT EXISTS public.reimbursement_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type_id            UUID NOT NULL REFERENCES public.reimbursement_types(id),
  amount             NUMERIC NOT NULL,
  approved_amount    NUMERIC DEFAULT NULL,
  -- Non-null when partial approval is used (Advanced tier only).
  -- If null after final approval, the full `amount` is considered approved.
  description        TEXT,
  receipt_url        TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  -- Lifecycle: pending → approved | rejected
  -- Intermediate stage labels are derived from current_stage + approval_chain
  current_stage      INTEGER NOT NULL DEFAULT 0,
  -- 0 = awaiting stage-1 approval (index into approval_chain array)
  approvals          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Audit trail of completed approvals:
  -- [{ "stage": 1, "approved_by": "<uuid>", "approver_name": "...", "at": "<iso>",
  --    "note": "...", "partial_amount": null }]
  rejection_reason   TEXT,
  rejected_at_stage  INTEGER,
  -- Which stage index the rejection happened at (for audit)
  receipt_expires_at DATE DEFAULT NULL,
  -- Set on INSERT based on module property receipt_retention_days.
  -- null = keep forever (Advanced). A cron job can clean up expired receipts.
  paid_on            DATE DEFAULT NULL,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reimbursement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for reimbursement_requests"
  ON public.reimbursement_requests
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

CREATE POLICY "Employees manage own reimbursement_requests"
  ON public.reimbursement_requests
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all reimbursement_requests"
  ON public.reimbursement_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = reimbursement_requests.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

-- ── 7. Extend company_modules: update payroll + leave_settings defaults ─────
--    (For the default company that already exists)
UPDATE public.company_modules
SET properties = properties || '{
  "tier": "basic",
  "lwp_auto_compute": false,
  "payroll_lock_enabled": false,
  "deficit_tracking": false,
  "deficit_half_day_hours": 4.25,
  "early_warning_days": 8,
  "mandatory_adjust_days": 4,
  "max_overtime_per_day": 1.0,
  "payroll_preview_from_day": 20,
  "shift_based_calc": false,
  "shift_patterns": [],
  "differential_rules_enabled": false,
  "ml_lapse_tracking": false,
  "ml_lapse_award_threshold": 4,
  "ml_lapse_award_type": "Comp-Off",
  "overtime_weekly_cap": null,
  "_custom": {}
}'::jsonb
WHERE module_key = 'payroll';

UPDATE public.company_modules
SET properties = properties || '{
  "tier": "basic",
  "max_leave_types": 2,
  "who_can_configure": "superadmin_only",
  "approval_chain_depth": 1,
  "allow_carryforward": false,
  "partial_day_support": false,
  "cl_consecutive_limit_enabled": false,
  "cl_default_max_consecutive_days": 2,
  "ml_leave_enabled": false,
  "ml_lapse_award_type": "Comp-Off",
  "ml_lapse_award_threshold": 4,
  "short_leave_enabled": false,
  "short_leave_default_hours": 2,
  "compoff_enabled": false,
  "week_off_customization": false,
  "lwp_payroll_link": false,
  "deficit_adjustment_enabled": false,
  "custom_leave_labels": [],
  "_custom": {}
}'::jsonb
WHERE module_key = 'leave_settings';

-- ── 8. Add reimbursements + profiles modules to default company ───────────
INSERT INTO public.company_modules (company_id, module_key, is_enabled, properties)
VALUES
(
  '00000000-0000-0000-0000-000000000000',
  'reimbursements',
  false,
  '{
    "tier": "basic",
    "max_categories": 3,
    "max_claims_per_month": 1,
    "receipt_retention_days": 90,
    "admin_can_approve": false,
    "max_approval_chain_depth": 1,
    "partial_approval_enabled": false,
    "bulk_submission_enabled": false,
    "show_in_payslip": false,
    "job_role_approver_enabled": false,
    "department_approver_enabled": false,
    "person_approver_enabled": false,
    "allow_optional_receipt": false,
    "custom_category_presets": [],
    "_custom": {}
  }'::jsonb
),
(
  '00000000-0000-0000-0000-000000000000',
  'profiles',
  true,
  '{
    "tier": "basic",
    "who_can_create_profiles": "superadmin",
    "who_can_edit_profiles": "superadmin",
    "manager_can_view_team": true,
    "manager_can_edit_team": false,
    "admin_can_create": false,
    "admin_can_edit": false,
    "salary_change_requires_approval": false,
    "custom_job_roles_enabled": false,
    "job_roles_list": [],
    "designation_change_approval": false,
    "granular_field_permissions": false,
    "team_scoped_manager_edit": false,
    "_custom": {}
  }'::jsonb
)
ON CONFLICT (company_id, module_key) DO NOTHING;

-- ── 9. Add reimbursements + profiles to subscription_plans.default_modules ─
--    Starter: reimbursements off, profiles basic
--    Professional: reimbursements basic, profiles standard
--    Enterprise: reimbursements standard, profiles advanced
-- (Update default_modules JSON for each plan)
UPDATE public.subscription_plans
SET default_modules = default_modules || '{"reimbursements": false, "profiles": true}'::jsonb
WHERE name = 'Starter';

UPDATE public.subscription_plans
SET default_modules = default_modules || '{"reimbursements": true, "profiles": true}'::jsonb
WHERE name = 'Professional';

UPDATE public.subscription_plans
SET default_modules = default_modules || '{"reimbursements": true, "profiles": true}'::jsonb
WHERE name = 'Enterprise';
