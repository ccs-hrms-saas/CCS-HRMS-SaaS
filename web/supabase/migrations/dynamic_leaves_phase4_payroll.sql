-- 1. Deficit Adjustments Tracker
CREATE TABLE IF NOT EXISTS deficit_adjustments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    adjustment_date date NOT NULL DEFAULT now()::date,
    hours_cleared numeric NOT NULL DEFAULT 8.5,
    adjusted_against text NOT NULL, -- 'EL', 'CL', 'Comp-Off', 'LWP'
    created_at timestamptz DEFAULT now()
);
ALTER TABLE deficit_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees see own adjustments" ON deficit_adjustments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Employees can insert adjustments" ON deficit_adjustments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all adjustments" ON deficit_adjustments FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- 2. Payroll Records Ledger
CREATE TABLE IF NOT EXISTS payroll_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    year integer NOT NULL,
    month integer NOT NULL, -- 1 to 12
    base_remuneration numeric NOT NULL,
    daily_rate numeric NOT NULL,
    total_lwp_days numeric DEFAULT 0.0,
    deductions_amount numeric DEFAULT 0.0,
    final_payout numeric NOT NULL,
    status text DEFAULT 'Processed', -- 'Processed', 'Paid'
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, year, month)
);
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees see own payroll" ON payroll_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage payroll" ON payroll_records FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
