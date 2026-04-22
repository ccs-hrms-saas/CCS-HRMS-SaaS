-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Incentive Structure Module Migration
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING throughout)
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. incentive_plans ─────────────────────────────────────────────────────
-- A "plan" is the top-level incentive scheme created by a tenant admin.
-- e.g. "Q1 Sales Incentive", "Monthly Delivery Bonus"
CREATE TABLE IF NOT EXISTS public.incentive_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  description   TEXT,

  -- Tenure type
  tenure        TEXT NOT NULL DEFAULT 'monthly'
                CHECK (tenure IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),

  -- Only populated when tenure = 'custom'
  tenure_start  DATE DEFAULT NULL,
  tenure_end    DATE DEFAULT NULL,

  -- Soft-delete / activation
  is_active     BOOLEAN NOT NULL DEFAULT true,

  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE (company_id, name)
);

ALTER TABLE public.incentive_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for incentive_plans" ON public.incentive_plans;
CREATE POLICY "Tenant isolation for incentive_plans"
  ON public.incentive_plans
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

DROP POLICY IF EXISTS "Admins manage incentive_plans" ON public.incentive_plans;
CREATE POLICY "Admins manage incentive_plans"
  ON public.incentive_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = incentive_plans.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Employees read active incentive_plans" ON public.incentive_plans;
CREATE POLICY "Employees read active incentive_plans"
  ON public.incentive_plans
  FOR SELECT
  USING (
    is_active = true
    AND public.can_access_company(company_id)
  );

-- ── 2. incentive_goals ─────────────────────────────────────────────────────
-- Individual goal/task/assignment within a plan.
-- e.g. "Sell at MRP", "Close a Service Contract", "Hit ₹50k Revenue"
CREATE TABLE IF NOT EXISTS public.incentive_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES public.incentive_plans(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  description     TEXT,

  -- Value type
  -- 'fixed'      = pre-decided monetary value per unit (e.g. selling at MRP = ₹200/unit)
  -- 'open_ended' = value is entered at the time of recording (e.g. service without rate card)
  value_type      TEXT NOT NULL DEFAULT 'fixed'
                  CHECK (value_type IN ('fixed', 'open_ended')),
  fixed_value     NUMERIC DEFAULT NULL,
  -- NULL when value_type = 'open_ended'. Required when value_type = 'fixed'.

  -- Optional minimum cap / target
  -- If has_target = true, payout is only triggered when achieved_value >= target_amount
  has_target      BOOLEAN NOT NULL DEFAULT false,
  target_amount   NUMERIC DEFAULT NULL,
  -- e.g. 50000.00 → must achieve ₹50k before any payout kicks in

  -- Payout structure
  -- 'flat'       = fixed amount per goal achievement (e.g. ₹500 per contract closed)
  -- 'percentage' = % of the achieved/recorded value
  payout_type     TEXT NOT NULL DEFAULT 'flat'
                  CHECK (payout_type IN ('flat', 'percentage')),
  payout_value    NUMERIC NOT NULL DEFAULT 0,
  -- flat mode: absolute INR amount. percentage mode: % value (e.g. 5.00 = 5%)

  payout_cap      NUMERIC DEFAULT NULL,
  -- NULL = no upper cap. Set a value to impose an upper ceiling on payout.
  -- Applies to both flat (cap on total) and percentage modes.

  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.incentive_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for incentive_goals" ON public.incentive_goals;
CREATE POLICY "Tenant isolation for incentive_goals"
  ON public.incentive_goals
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

DROP POLICY IF EXISTS "Admins manage incentive_goals" ON public.incentive_goals;
CREATE POLICY "Admins manage incentive_goals"
  ON public.incentive_goals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = incentive_goals.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Employees read active incentive_goals" ON public.incentive_goals;
CREATE POLICY "Employees read active incentive_goals"
  ON public.incentive_goals
  FOR SELECT
  USING (
    is_active = true
    AND public.can_access_company(company_id)
  );

-- ── 3. incentive_records ───────────────────────────────────────────────────
-- A single earned/claimed incentive event for one employee against one goal.
-- Created by admin (or employee if self-reporting is enabled in a future tier).
CREATE TABLE IF NOT EXISTS public.incentive_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  goal_id         UUID NOT NULL REFERENCES public.incentive_goals(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Human-readable period label: "April 2026", "Q1 2026", "Week 16", etc.
  period_label    TEXT NOT NULL,

  -- The raw value achieved (units sold, revenue generated, contracts closed…)
  achieved_value  NUMERIC NOT NULL DEFAULT 0,

  -- Computed payout amount (calculated at submission / approval time)
  payout_amount   NUMERIC DEFAULT NULL,
  -- NULL = not yet calculated / still pending

  -- Status lifecycle
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),

  approved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,

  -- Integration: when paid via payroll, reference is stamped here
  payroll_month   INTEGER DEFAULT NULL,  -- e.g. 4 for April
  payroll_year    INTEGER DEFAULT NULL,  -- e.g. 2026
  paid_on         DATE DEFAULT NULL,

  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.incentive_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for incentive_records" ON public.incentive_records;
CREATE POLICY "Tenant isolation for incentive_records"
  ON public.incentive_records
  AS RESTRICTIVE FOR ALL
  USING (public.can_access_company(company_id));

DROP POLICY IF EXISTS "Admins manage all incentive_records" ON public.incentive_records;
CREATE POLICY "Admins manage all incentive_records"
  ON public.incentive_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = incentive_records.company_id
        AND role IN ('superadmin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Employees read own incentive_records" ON public.incentive_records;
CREATE POLICY "Employees read own incentive_records"
  ON public.incentive_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── 4. Useful indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incentive_plans_company    ON public.incentive_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_incentive_goals_plan       ON public.incentive_goals(plan_id);
CREATE INDEX IF NOT EXISTS idx_incentive_goals_company    ON public.incentive_goals(company_id);
CREATE INDEX IF NOT EXISTS idx_incentive_records_user     ON public.incentive_records(user_id);
CREATE INDEX IF NOT EXISTS idx_incentive_records_goal     ON public.incentive_records(goal_id);
CREATE INDEX IF NOT EXISTS idx_incentive_records_company  ON public.incentive_records(company_id);
CREATE INDEX IF NOT EXISTS idx_incentive_records_status   ON public.incentive_records(status);

-- ── 5. Backfill company_modules for ALL existing tenants ───────────────────
-- Uses a SECURITY DEFINER function so the INSERT bypasses RLS and reaches
-- every company in the database — not just those visible to the current session.
-- This is the correct pattern for SaaS-wide module provisioning backfills.
CREATE OR REPLACE FUNCTION public._backfill_incentives_module()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_modules (company_id, module_key, is_enabled, properties)
  SELECT
    c.id,
    'incentives',
    false,
    '{
      "tier": "basic",
      "max_active_plans": 1,
      "multi_goal_enabled": false,
      "open_ended_value_enabled": false,
      "target_cap_enabled": false,
      "percentage_payout_enabled": false,
      "payout_upper_cap_enabled": false,
      "custom_tenure_enabled": false,
      "role_scoping_enabled": false,
      "department_scoping_enabled": false,
      "show_in_payslip": false,
      "self_reporting_enabled": false,
      "_custom": {}
    }'::jsonb
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_modules cm
    WHERE cm.company_id = c.id
      AND cm.module_key = 'incentives'
  );
END;
$$;

-- Execute the backfill then immediately drop the function (self-cleaning migration)
SELECT public._backfill_incentives_module();
DROP FUNCTION public._backfill_incentives_module();


-- ── 6. Update subscription_plans default_modules ───────────────────────────
-- Starter:      incentives OFF
-- Professional: incentives ON (Standard tier — configured by developer)
-- Enterprise:   incentives ON (Advanced tier — configured by developer)
UPDATE public.subscription_plans
SET default_modules = default_modules || '{"incentives": false}'::jsonb
WHERE name = 'Starter';

UPDATE public.subscription_plans
SET default_modules = default_modules || '{"incentives": true}'::jsonb
WHERE name IN ('Professional', 'Enterprise');

-- ── 7. Verify ─────────────────────────────────────────────────────────────
SELECT
  c.name                        AS company,
  cm.module_key,
  cm.is_enabled,
  cm.properties->>'tier'        AS tier
FROM public.company_modules cm
JOIN public.companies c ON c.id = cm.company_id
WHERE cm.module_key = 'incentives'
ORDER BY c.name;
