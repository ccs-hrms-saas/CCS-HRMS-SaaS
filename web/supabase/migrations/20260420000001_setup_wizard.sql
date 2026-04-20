-- ── Setup Wizard Support ──────────────────────────────────────────────────
-- Adds setup_completed flag to companies so the wizard only shows once.
-- Adds work schedule columns to app_settings.

-- 1. Companies — track onboarding status
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT FALSE;

-- Existing tenants (pre-wizard) are considered already set up
UPDATE companies SET setup_completed = TRUE WHERE created_at < NOW();

-- 2. App settings — work schedule fields
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS work_days      TEXT[]  DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  ADD COLUMN IF NOT EXISTS work_start     TEXT    DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end       TEXT    DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS grace_minutes  INTEGER DEFAULT 15;

-- 3. Departments table (may already exist in the legacy schema)
CREATE TABLE IF NOT EXISTS departments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  head_id     UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_view_departments" ON departments;
CREATE POLICY "company_members_view_departments" ON departments
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "superadmin_manage_departments" ON departments;
CREATE POLICY "superadmin_manage_departments" ON departments
  FOR ALL USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('superadmin','admin')
    )
  );
