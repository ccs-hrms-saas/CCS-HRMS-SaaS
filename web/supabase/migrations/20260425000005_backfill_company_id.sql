-- ══════════════════════════════════════════════════════════════════════════════
-- Fix: Backfill company_id on attendance_records where it is NULL
--
-- Root cause: /api/mark-attendance uses the service role key (supabaseAdmin).
-- This bypasses RLS, so auth.uid() returns NULL in the auto-company trigger.
-- Result: every record inserted via that API has company_id = NULL.
--
-- Effect on employees:
--   • The RESTRICTIVE RLS policy: can_access_company(NULL) → false
--   • Employees using the authenticated Supabase client see 0 rows
--   • Admins are unaffected (admin report API also uses service role → no RLS)
--
-- Fix A (this migration): backfill existing records
-- Fix B (in route.ts):    explicitly pass company_id on every future insert
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Backfill attendance_records.company_id from profiles ──────────────────
UPDATE public.attendance_records ar
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  ar.user_id = p.id
  AND  (ar.company_id IS NULL OR ar.company_id = '00000000-0000-0000-0000-000000000000');

-- ── 2. Same fix for deficit_adjustments ──────────────────────────────────────
UPDATE public.deficit_adjustments da
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  da.user_id = p.id
  AND  (da.company_id IS NULL OR da.company_id = '00000000-0000-0000-0000-000000000000');

-- ── 3. Same fix for deficit_waivers ─────────────────────────────────────────
UPDATE public.deficit_waivers dw
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  dw.user_id = p.id
  AND  (dw.company_id IS NULL OR dw.company_id = '00000000-0000-0000-0000-000000000000');

-- ── 4. Same fix for leave_requests ──────────────────────────────────────────
UPDATE public.leave_requests lr
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  lr.user_id = p.id
  AND  (lr.company_id IS NULL OR lr.company_id = '00000000-0000-0000-0000-000000000000');

-- ── 5. Same fix for leave_balances ──────────────────────────────────────────
UPDATE public.leave_balances lb
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  lb.user_id = p.id
  AND  (lb.company_id IS NULL OR lb.company_id = '00000000-0000-0000-0000-000000000000');

-- ── 6. Same fix for payroll_records ─────────────────────────────────────────
UPDATE public.payroll_records pr
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  pr.user_id = p.id
  AND  (pr.company_id IS NULL OR pr.company_id = '00000000-0000-0000-0000-000000000000');

-- ── Verification query (run to confirm fix) ──────────────────────────────────
SELECT
  'attendance_records' AS tbl,
  COUNT(*) FILTER (WHERE company_id IS NULL)                                         AS still_null,
  COUNT(*) FILTER (WHERE company_id = '00000000-0000-0000-0000-000000000000')        AS still_placeholder,
  COUNT(*) FILTER (WHERE company_id IS NOT NULL
                     AND company_id <> '00000000-0000-0000-0000-000000000000')       AS correctly_set
FROM public.attendance_records;
