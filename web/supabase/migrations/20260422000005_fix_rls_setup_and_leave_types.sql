-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 005: Fix RLS gaps for setup completion and leave type management
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Fix 1: Allow tenant superadmins to update their own company row ───────────
-- Needed so the setup wizard can set setup_completed = true and the dashboard
-- can reach the correct page without restarting the wizard on every refresh.
DROP POLICY IF EXISTS "Superadmins update own company" ON public.companies;

CREATE POLICY "Superadmins update own company"
  ON public.companies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = companies.id
        AND p.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = companies.id
        AND p.role = 'superadmin'
    )
  );

-- ── Fix 2: Allow superadmins and admins to manage leave types ─────────────────
-- Phase 1 migration dropped the old "Admins can manage leave types" permissive
-- policy and only added a RESTRICTIVE tenant isolation policy.
-- Without a PERMISSIVE write policy, INSERT / UPDATE / DELETE are silently denied.
DROP POLICY IF EXISTS "Admins manage tenant leave types" ON public.leave_types;

CREATE POLICY "Admins manage tenant leave types"
  ON public.leave_types
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = leave_types.company_id
        AND p.role IN ('superadmin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = leave_types.company_id
        AND p.role IN ('superadmin', 'admin')
    )
  );

-- ── Fix 3: Allow all authenticated users to read leave types for their company ─
-- The old "Anyone can read leave types" was also dropped in Phase 1.
-- Employees need to read leave types to submit leave requests.
DROP POLICY IF EXISTS "Employees read own company leave types" ON public.leave_types;

CREATE POLICY "Employees read own company leave types"
  ON public.leave_types
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = leave_types.company_id
    )
  );
