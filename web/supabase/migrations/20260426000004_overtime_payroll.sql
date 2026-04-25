-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Overtime → Payroll Pipeline (Phase F)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. app_settings: overtime payout config ───────────────────────────────────
-- These columns store the SuperAdmin-configured overtime payout rules
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS overtime_rate_type       TEXT    DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS overtime_rate_value      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_monthly_cap_hrs NUMERIC DEFAULT 0;

-- overtime_rate_type values:
--   'flat'       → fixed rupees per overtime hour (e.g. ₹50/h)
--   'multiplier' → multiplier of the employee's daily rate
--                  e.g. 1.5 = time-and-a-half
-- overtime_rate_value = the flat amount OR the multiplier
-- overtime_monthly_cap_hrs = max hours that attract payout per month (0 = no cap)

ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_ot_rate_type_check
    CHECK (overtime_rate_type IN ('flat', 'multiplier'));

-- ── 2. attendance_records: store overtime hours per punch ────────────────────
-- Calculated at check-out time: max(0, worked_hours - hours_per_day)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC DEFAULT 0;

-- ── 3. payroll_records: overtime payout line item ─────────────────────────────
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS total_overtime_hours  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate_type    TEXT    DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS overtime_rate_value   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_payout       NUMERIC DEFAULT 0;

-- NOTE: final_payout in payroll_records already represents the full pay.
-- We add overtime_payout separately so the payslip can show it as a
-- distinct line: "Base Pay: ₹X | Overtime Allowance: ₹Y | Total: ₹Z"

-- ── 4. Index: fast overtime lookup per month ──────────────────────────────────
CREATE INDEX IF NOT EXISTS attendance_records_overtime_idx
  ON attendance_records (user_id, date)
  WHERE overtime_hours > 0;
