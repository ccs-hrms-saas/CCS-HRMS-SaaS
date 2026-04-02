-- 1. Add advanced rules to leave_types
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS accrual_rate numeric DEFAULT NULL;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS count_holidays boolean DEFAULT false;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS max_carry_forward int DEFAULT 0;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS carry_forward_percent int DEFAULT 0;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS frequency text DEFAULT 'yearly';
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS deduction_hours numeric DEFAULT 8.5;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS requires_attachment boolean DEFAULT false;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS requires_attachment_after_days int DEFAULT 0;
ALTER TABLE leave_types Add COLUMN IF NOT EXISTS expires_in_days int DEFAULT NULL;

-- 2. Add medical certificate URL and violation flags to leave_requests
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT NULL;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_violation boolean DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS violation_reason text DEFAULT NULL;

-- 3. Create comp_off_grants table (Admin grants Comp-Offs which expire)
CREATE TABLE IF NOT EXISTS comp_off_grants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  granted_on date NOT NULL DEFAULT now()::date,
  expires_on date NOT NULL,
  days_granted numeric NOT NULL DEFAULT 1.0,
  days_used numeric NOT NULL DEFAULT 0.0,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comp_off_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can see own comp off grants" ON comp_off_grants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage comp offs" ON comp_off_grants FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- 4. Set up storage for medical certificates
INSERT INTO storage.buckets (id, name, public) VALUES ('medical-certificates', 'medical-certificates', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Employees can upload own medical certs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'medical-certificates' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Admins can view medical certs" ON storage.objects FOR SELECT USING (bucket_id = 'medical-certificates');
CREATE POLICY "Employees can view own medical certs" ON storage.objects FOR SELECT USING (bucket_id = 'medical-certificates' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
