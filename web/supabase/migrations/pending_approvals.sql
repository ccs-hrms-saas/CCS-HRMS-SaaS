-- Admin Action Approval Queue
-- Holds sensitive admin actions that require Super Admin review before execution

CREATE TABLE IF NOT EXISTS pending_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type      text NOT NULL,          -- 'role_change' | 'organogram_change'
  requested_by     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id   uuid REFERENCES profiles(id) ON DELETE CASCADE, -- for role_change
  payload          jsonb NOT NULL,         -- { old_role, new_role } | { changes: [...] }
  status           text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by      uuid REFERENCES profiles(id),
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz
);

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

-- Admins can insert and read their own requests
CREATE POLICY "admin_insert" ON pending_approvals FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "admin_read_own" ON pending_approvals FOR SELECT
  USING (
    auth.uid() = requested_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Only superadmins can update (approve/reject)
CREATE POLICY "superadmin_update" ON pending_approvals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- Index for quick pending lookup
CREATE INDEX IF NOT EXISTS pending_approvals_status_idx ON pending_approvals(status);
CREATE INDEX IF NOT EXISTS pending_approvals_requested_by_idx ON pending_approvals(requested_by);
