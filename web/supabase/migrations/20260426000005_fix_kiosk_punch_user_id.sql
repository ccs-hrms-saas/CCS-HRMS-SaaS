-- ══════════════════════════════════════════════════════════════════════════════
-- Fix: Kiosk punch was inserting `employee_id` field instead of `user_id`
--
-- Root cause: /api/kiosk/punch/route.ts used the wrong column name.
-- The `attendance_records` table has `user_id`, not `employee_id`.
-- Supabase silently ignores unknown columns, so `user_id` stayed NULL
-- and `check_in` was stored — creating orphaned rows that are invisible
-- to every employee query and the payroll engine.
--
-- Fix A (this migration):
--   1. Delete orphaned records with NULL user_id (they are unrecoverable
--      since the employee reference is lost)
--   2. Add a unique constraint on (company_id, user_id, date) to prevent
--      duplicate check-in rows and surface errors early
--
-- Fix B (in route.ts): Use `user_id` instead of `employee_id` in all inserts
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Remove orphaned attendance rows (user_id IS NULL — no employee reference)
DELETE FROM public.attendance_records
WHERE user_id IS NULL;

-- 2. Add a unique constraint to prevent duplicate rows per employee per day.
--    This ensures only one check-in/check-out row exists per employee per day,
--    regardless of which source (kiosk, web, manual override) created it.
--    Using CREATE UNIQUE INDEX to allow IF NOT EXISTS guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'attendance_records'
      AND indexname = 'attendance_records_company_user_date_unique'
  ) THEN
    CREATE UNIQUE INDEX attendance_records_company_user_date_unique
      ON public.attendance_records (company_id, user_id, date);
  END IF;
END $$;

-- Verify: count remaining records grouped by whether they have a valid user_id
SELECT
  CASE WHEN user_id IS NULL THEN 'NULL user_id (orphaned)' ELSE 'Valid user_id' END AS status,
  COUNT(*) AS record_count
FROM public.attendance_records
GROUP BY 1;
