-- deficit_waivers table (already run by user, kept here for record)
-- Super Admin can waive deficit hours for any employee

CREATE TABLE IF NOT EXISTS deficit_waivers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id),
  waived_by    UUID NOT NULL REFERENCES profiles(id),
  month        TEXT NOT NULL,           -- "YYYY-MM" e.g. "2026-04"
  hours_waived DECIMAL(5,2) NOT NULL,   -- partial amounts allowed
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deficit_waivers ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "sa_all_deficit_waivers" ON deficit_waivers
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Employee: read own waivers only
CREATE POLICY "emp_read_own_waivers" ON deficit_waivers
  FOR SELECT USING (user_id = auth.uid());

-- Admins: read all (for their team view)
CREATE POLICY "admin_read_deficit_waivers" ON deficit_waivers
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
