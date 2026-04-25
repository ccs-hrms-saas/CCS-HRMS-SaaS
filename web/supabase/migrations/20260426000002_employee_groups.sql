-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Employee Groups (Phase D)
-- Supports: multi-group membership, creator tracking, SA/Admin permissions
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. employee_groups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT DEFAULT '#6366f1',   -- hex color for badge
  icon         TEXT DEFAULT '👥',        -- emoji or icon name
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role TEXT DEFAULT 'superadmin', -- 'superadmin' | 'admin'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Unique group names per company
CREATE UNIQUE INDEX IF NOT EXISTS employee_groups_company_name_idx
  ON employee_groups (company_id, name);

-- ── 2. employee_group_members ─────────────────────────────────────────────────
-- Many-to-many: one employee can be in multiple groups
CREATE TABLE IF NOT EXISTS employee_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES employee_groups(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL,   -- denormalized for fast RLS scoping
  added_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_group_members_unique_idx
  ON employee_group_members (group_id, user_id);

CREATE INDEX IF NOT EXISTS employee_group_members_user_idx
  ON employee_group_members (user_id);

CREATE INDEX IF NOT EXISTS employee_group_members_company_idx
  ON employee_group_members (company_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE employee_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_group_members ENABLE ROW LEVEL SECURITY;

-- Groups: visible to superadmin + admin of same company
CREATE POLICY "employee_groups_company_isolation"
  ON employee_groups FOR ALL
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Members: same company isolation
CREATE POLICY "employee_group_members_company_isolation"
  ON employee_group_members FOR ALL
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 4. Updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS employee_groups_updated_at ON employee_groups;
CREATE TRIGGER employee_groups_updated_at
  BEFORE UPDATE ON employee_groups
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
