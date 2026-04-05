-- Admin Permissions Table
-- Run this in Supabase SQL Editor → New Query

CREATE TABLE IF NOT EXISTS admin_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  granted_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, permission)
);

ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
CREATE POLICY "superadmin_full" ON admin_permissions
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Each admin can read their own permissions
CREATE POLICY "self_read" ON admin_permissions
  FOR SELECT USING (user_id = auth.uid());
