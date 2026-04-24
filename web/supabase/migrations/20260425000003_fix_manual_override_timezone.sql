-- ══════════════════════════════════════════════════════════════════════════
-- FIX: Manual override attendance records have wrong timezone (UTC vs IST)
--
-- Root cause: The manual override API treated admin-entered IST times as UTC.
-- So "10:35 IST" was stored as "10:35 UTC" (= 16:05 IST). Wrong by +5h30m.
--
-- This script shifts ALL manual override records back by 5h30m so the stored
-- UTC value correctly represents the intended IST time.
--
-- Affects only records where photo_url starts with 'manual_override_by_'
-- (i.e. only admin-overridden records, not real kiosk/app attendance).
-- ══════════════════════════════════════════════════════════════════════════

-- Preview first (run this SELECT to verify before applying UPDATE):
SELECT
  id,
  user_id,
  date,
  check_in                                              AS check_in_wrong_utc,
  check_in  - INTERVAL '5 hours 30 minutes'            AS check_in_corrected_utc,
  check_out                                             AS check_out_wrong_utc,
  check_out - INTERVAL '5 hours 30 minutes'            AS check_out_corrected_utc,
  photo_url
FROM public.attendance_records
WHERE photo_url LIKE 'manual_override_by_%'
ORDER BY date;

-- ── Apply the correction ──────────────────────────────────────────────────
-- Uncomment and run AFTER verifying the SELECT output above looks correct:

/*
UPDATE public.attendance_records
SET
  check_in  = check_in  - INTERVAL '5 hours 30 minutes',
  check_out = CASE
    WHEN check_out IS NOT NULL
    THEN check_out - INTERVAL '5 hours 30 minutes'
    ELSE NULL
  END
WHERE photo_url LIKE 'manual_override_by_%';

-- Confirm the update
SELECT id, date, check_in, check_out
FROM public.attendance_records
WHERE photo_url LIKE 'manual_override_by_%'
ORDER BY date;
*/
