-- ══════════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Run this in Supabase SQL Editor to see the exact data
-- state causing payroll to show Present = 1 for some employees.
-- ══════════════════════════════════════════════════════════════════

-- 1. Count attendance records per employee, grouped by company_id state
SELECT 
  p.full_name,
  p.company_id AS profile_company_id,
  ar.company_id AS record_company_id,
  COUNT(*) AS record_count,
  MIN(ar.date) AS earliest_date,
  MAX(ar.date) AS latest_date
FROM public.attendance_records ar
JOIN public.profiles p ON p.id = ar.user_id
WHERE ar.date >= '2026-04-01'
  AND ar.date <= '2026-04-30'
GROUP BY p.full_name, p.company_id, ar.company_id
ORDER BY p.full_name, ar.company_id NULLS FIRST;

-- ══════════════════════════════════════════════════════════════════
-- IMMEDIATE FIX: Run this to stamp company_id on all NULL records.
-- This fixes the data NOW without needing redeployment.
-- ══════════════════════════════════════════════════════════════════

UPDATE public.attendance_records ar
SET    company_id = p.company_id
FROM   public.profiles p
WHERE  ar.user_id = p.id
  AND  ar.company_id IS NULL
  AND  p.company_id IS NOT NULL;

-- Verify fix
SELECT 
  COUNT(*) FILTER (WHERE company_id IS NULL) AS still_null,
  COUNT(*) FILTER (WHERE company_id IS NOT NULL) AS fixed,
  COUNT(*) AS total
FROM public.attendance_records
WHERE date >= '2026-04-01';
