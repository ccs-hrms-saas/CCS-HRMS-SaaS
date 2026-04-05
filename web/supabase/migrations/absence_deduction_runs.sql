-- Tracks which months have already had absence deductions processed
-- Prevents double-deduction if admin opens the page multiple times

CREATE TABLE IF NOT EXISTS absence_deduction_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year    text NOT NULL UNIQUE,  -- e.g. '2026-04'
  ran_at        timestamptz DEFAULT now(),
  employees_processed int DEFAULT 0,
  total_days_deducted numeric DEFAULT 0
);

ALTER TABLE absence_deduction_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full" ON absence_deduction_runs
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
