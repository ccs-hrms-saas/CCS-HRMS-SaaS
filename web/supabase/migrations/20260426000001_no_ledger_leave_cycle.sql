-- ════════════════════════════════════════════════════════════════════════════
-- Migration: No-Ledger Leave Type + Custom Ledger Cycle
-- Phase C of Platform Expansion
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. leave_types: add no_ledger flag and ledger_cycle ──────────────────────

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS no_ledger    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ledger_cycle TEXT    DEFAULT 'yearly';

-- ledger_cycle values:
--   'yearly'    → balance resets Jan 1 (or Apr 1 for FY)
--   'monthly'   → balance resets 1st of each month
--   '3monthly'  → resets Q1/Q2/Q3/Q4 (quarterly)
--   '6monthly'  → resets H1 (Apr) / H2 (Oct)
--
-- If no_ledger = TRUE, ledger_cycle is ignored (no balance exists).

-- Ensure valid values only
ALTER TABLE leave_types
  ADD CONSTRAINT leave_types_ledger_cycle_check
    CHECK (ledger_cycle IN ('yearly', 'monthly', '3monthly', '6monthly'));

-- ── 2. leave_balances: add period_key for cycle-aware balance tracking ────────

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS period_key TEXT;

-- period_key format by cycle:
--   yearly    → '2026'
--   monthly   → '2026-04'
--   3monthly  → '2026-Q1' | '2026-Q2' | '2026-Q3' | '2026-Q4'
--   6monthly  → '2026-H1' | '2026-H2'
--
-- NULL = legacy row (pre-migration), treated as 'yearly'

-- Index for fast period lookup per company+employee
CREATE INDEX IF NOT EXISTS leave_balances_period_key_idx
  ON leave_balances (leave_type_id, period_key);

-- ── 3. Helper function: compute current period_key for a leave type ───────────

CREATE OR REPLACE FUNCTION get_period_key(
  p_cycle TEXT,
  p_date  DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  yr   INT  := EXTRACT(YEAR FROM p_date);
  mo   INT  := EXTRACT(MONTH FROM p_date);
  qtr  INT  := CEIL(mo::NUMERIC / 3);
  half INT  := CASE WHEN mo <= 6 THEN 1 ELSE 2 END;
BEGIN
  RETURN CASE p_cycle
    WHEN 'monthly'   THEN yr || '-' || LPAD(mo::TEXT, 2, '0')
    WHEN '3monthly'  THEN yr || '-Q' || qtr
    WHEN '6monthly'  THEN yr || '-H' || half
    ELSE                  yr::TEXT   -- 'yearly' and fallback
  END;
END;
$$;

-- ── 4. leave_balances: unique constraint per (user_id, leave_type_id, period_key)
--     so duplicate balances per period are rejected cleanly

-- Drop old unique constraint if it only covers (user_id, leave_type_id)
-- (may not exist, so ignore errors)
DO $$
BEGIN
  ALTER TABLE leave_balances
    DROP CONSTRAINT IF EXISTS leave_balances_user_id_leave_type_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add new composite unique constraint
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_user_type_period_key
    UNIQUE (user_id, leave_type_id, period_key);

-- ── 5. Backfill period_key = get_period_key('yearly') for existing rows ───────

UPDATE leave_balances
SET period_key = get_period_key(
  COALESCE(
    (SELECT lt.ledger_cycle FROM leave_types lt WHERE lt.id = leave_balances.leave_type_id),
    'yearly'
  )
)
WHERE period_key IS NULL;
