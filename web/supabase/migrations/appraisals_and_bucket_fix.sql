-- ═══════════════════════════════════════════════════════════
-- STEP 1: Create Appraisals Table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_appraisals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appraisal_date  DATE NOT NULL,
  letter_url      TEXT NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_appraisals ENABLE ROW LEVEL SECURITY;

-- Admin can view all
CREATE POLICY "Admins view all appraisals"
  ON employee_appraisals FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- Employee can view only their own
CREATE POLICY "Employee views own appraisals"
  ON employee_appraisals FOR SELECT
  USING (user_id = auth.uid());

-- Only admin can insert/update/delete
CREATE POLICY "Admins manage appraisals"
  ON employee_appraisals FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));

-- ═══════════════════════════════════════════════════════════
-- STEP 2: Fix/Ensure all required storage buckets exist
-- This is the ONE-STOP bucket setup. Run this if uploads fail.
-- ═══════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('employee-documents', 'employee-documents', true),
  ('profile-pictures',   'profile-pictures',   true),
  ('medical-certificates','medical-certificates', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop all old conflicting policies
DROP POLICY IF EXISTS "Admins can view employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Employees can view own docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Employees can upload own docs" ON storage.objects;
DROP POLICY IF EXISTS "Public read for profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own picture" ON storage.objects;
DROP POLICY IF EXISTS "Global Read Access for Documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Access" ON storage.objects;

-- Clean universal policies
CREATE POLICY "Public bucket reads"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates'));

CREATE POLICY "Authenticated uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated updates"
  ON storage.objects FOR UPDATE
  USING (bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated deletes"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') AND auth.role() = 'authenticated');
