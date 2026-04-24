-- ══════════════════════════════════════════════════════════════════════════
-- CCS-HRMS SaaS — Admin Read Policies
-- Allows admins/superadmins to read attendance, leave requests, and leave
-- balances for all employees in their own company.
-- Uses Postgres permissive policy OR logic: a row is visible if ANY
-- SELECT policy passes — so this ADDS admin access without removing
-- employee self-read access.
-- ══════════════════════════════════════════════════════════════════════════

-- ── attendance_records ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins can view company attendance" ON public.attendance_records;
CREATE POLICY "admins can view company attendance"
ON public.attendance_records
FOR SELECT
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.profiles AS caller
    JOIN public.profiles AS target ON target.id = attendance_records.user_id
    WHERE caller.id = auth.uid()
      AND caller.role IN ('admin', 'superadmin')
      AND caller.company_id = target.company_id
  )
);

-- ── leave_requests ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins can view company leave requests" ON public.leave_requests;
CREATE POLICY "admins can view company leave requests"
ON public.leave_requests
FOR SELECT
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.profiles AS caller
    JOIN public.profiles AS target ON target.id = leave_requests.user_id
    WHERE caller.id = auth.uid()
      AND caller.role IN ('admin', 'superadmin')
      AND caller.company_id = target.company_id
  )
);

-- ── leave_balances ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins can view company leave balances" ON public.leave_balances;
CREATE POLICY "admins can view company leave balances"
ON public.leave_balances
FOR SELECT
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.profiles AS caller
    JOIN public.profiles AS target ON target.id = leave_balances.user_id
    WHERE caller.id = auth.uid()
      AND caller.role IN ('admin', 'superadmin')
      AND caller.company_id = target.company_id
  )
);

-- Verify (run after applying to confirm policies exist)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('attendance_records', 'leave_requests', 'leave_balances')
  AND policyname LIKE 'admins can%'
ORDER BY tablename, policyname;
