-- ══════════════════════════════════════════════════════════════════════════
-- Backfill: Add reimbursements + profiles modules to ALL existing companies
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run (ON CONFLICT DO NOTHING = idempotent)
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Insert "reimbursements" for every company that doesn't have it yet ──
INSERT INTO public.company_modules (company_id, module_key, is_enabled, properties)
SELECT
  c.id,
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
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_modules cm
  WHERE cm.company_id = c.id
    AND cm.module_key = 'reimbursements'
)
ON CONFLICT (company_id, module_key) DO NOTHING;

-- ── 2. Insert "profiles" for every company that doesn't have it yet ────────
INSERT INTO public.company_modules (company_id, module_key, is_enabled, properties)
SELECT
  c.id,
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
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_modules cm
  WHERE cm.company_id = c.id
    AND cm.module_key = 'profiles'
)
ON CONFLICT (company_id, module_key) DO NOTHING;

-- ── 3. Also backfill payroll + leave_settings with new tier properties ─────
--    Updates any company that has payroll/leave_settings but is missing
--    the new tier-aware fields. Uses || (merge) so existing properties survive.

UPDATE public.company_modules
SET properties = '{
  "tier": "basic",
  "currency": "INR",
  "salary_denominator": 30,
  "daily_working_hours": 8.5,
  "pay_day": 1,
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
}'::jsonb || properties
WHERE module_key = 'payroll'
  AND NOT (properties ? 'tier');   -- Only update if tier key is missing

UPDATE public.company_modules
SET properties = '{
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
}'::jsonb || properties
WHERE module_key = 'leave_settings'
  AND NOT (properties ? 'tier');   -- Only update if tier key is missing

-- ── 4. Verify ─────────────────────────────────────────────────────────────
SELECT
  c.name                AS company,
  cm.module_key,
  cm.is_enabled,
  cm.properties->>'tier' AS tier
FROM public.company_modules cm
JOIN public.companies c ON c.id = cm.company_id
WHERE cm.module_key IN ('reimbursements', 'profiles', 'payroll', 'leave_settings')
ORDER BY c.name, cm.module_key;
