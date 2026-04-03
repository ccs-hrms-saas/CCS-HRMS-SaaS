-- 1. Expand profiles table for deep HR records
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS designation text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS joining_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS joining_letter_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remuneration numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS father_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mother_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aadhar_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aadhar_front_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aadhar_back_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pan_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_ifsc text;

-- 2. Create Storage Buckets for Employee Docs & Pictures
-- Note: 'employee-documents' remains private by default in Supabase (unless marked public).
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-pictures', 'profile-pictures', true) ON CONFLICT DO NOTHING;

-- 3. Storage Policies: Profile Pictures (Public Read, Employee Upload)
CREATE POLICY "Public read for profile pictures" ON storage.objects FOR SELECT USING (bucket_id = 'profile-pictures');
CREATE POLICY "Users can upload their own picture" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-pictures' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

-- 4. Storage Policies: Employee Documents (Strictly Admin & Owner Access)
-- Admins can read all docs
CREATE POLICY "Admins can view employee docs" ON storage.objects FOR SELECT USING (bucket_id = 'employee-documents' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
-- Employees can read own docs
CREATE POLICY "Employees can view own docs" ON storage.objects FOR SELECT USING (bucket_id = 'employee-documents' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
-- Admins can insert docs directly (e.g. Joining Letter)
CREATE POLICY "Admins can upload employee docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'employee-documents' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
-- Employees can upload own docs (e.g. Aadhar, PAN)
CREATE POLICY "Employees can upload own docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'employee-documents' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

-- 5. Give 12 Menstrual Leaves exactly to current Female employees
DO $$
DECLARE
    u RECORD;
    lt_ml UUID;
BEGIN
    SELECT id INTO lt_ml FROM leave_types WHERE name = 'Menstruation Leave' LIMIT 1;
    
    IF lt_ml IS NOT NULL THEN
       FOR u IN SELECT id FROM profiles WHERE role = 'employee' AND is_active = true AND gender = 'Female'
       LOOP
           INSERT INTO leave_balances (user_id, leave_type_id, financial_year, accrued) VALUES (u.id, lt_ml, 2026, 12.0) ON CONFLICT (user_id, leave_type_id, financial_year) DO UPDATE SET accrued = 12.0;
       END LOOP;
    END IF;
END $$;
