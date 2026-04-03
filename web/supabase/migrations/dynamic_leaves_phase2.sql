-- 1. Create company_holidays table
CREATE TABLE IF NOT EXISTS company_holidays (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    date date NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read holidays" ON company_holidays FOR SELECT USING (true);
CREATE POLICY "Admins manage holidays" ON company_holidays FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
);

-- 2. Create leave_balances table (Ledger)
CREATE TABLE IF NOT EXISTS leave_balances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    leave_type_id uuid REFERENCES leave_types(id) ON DELETE CASCADE,
    financial_year int NOT NULL, -- e.g. 2026 for April 1, 2026 - March 31, 2027
    accrued numeric DEFAULT 0.0,
    used numeric DEFAULT 0.0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, leave_type_id, financial_year)
);
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees read own balances" ON leave_balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage balances" ON leave_balances FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
);

-- 3. Fix Kiosk Photo Storage Policy (Anonymous inserts explicitly allowed)
DROP POLICY IF EXISTS "Kiosk can upload attendance photos" ON storage.objects;
CREATE POLICY "Kiosk can upload attendance photos" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'attendance-photos');

-- 4. Initialize 2026 Balances (8 CL, 8 SL, 0 EL) for all active employees
DO $$
DECLARE
    u RECORD;
    lt_cl UUID;
    lt_sl UUID;
    lt_el UUID;
BEGIN
    SELECT id INTO lt_cl FROM leave_types WHERE name = 'Casual Leave (CL)' LIMIT 1;
    SELECT id INTO lt_sl FROM leave_types WHERE name = 'Sick Leave (SL)' LIMIT 1;
    SELECT id INTO lt_el FROM leave_types WHERE name = 'Earned Leave (EL)' LIMIT 1;

    FOR u IN SELECT id FROM profiles WHERE role = 'employee' AND is_active = true
    LOOP
        IF lt_cl IS NOT NULL THEN
            INSERT INTO leave_balances (user_id, leave_type_id, financial_year, accrued) VALUES (u.id, lt_cl, 2026, 8.0) ON CONFLICT DO NOTHING;
        END IF;
        IF lt_sl IS NOT NULL THEN
            INSERT INTO leave_balances (user_id, leave_type_id, financial_year, accrued) VALUES (u.id, lt_sl, 2026, 8.0) ON CONFLICT DO NOTHING;
        END IF;
        IF lt_el IS NOT NULL THEN
            INSERT INTO leave_balances (user_id, leave_type_id, financial_year, accrued) VALUES (u.id, lt_el, 2026, 0.0) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END $$;
