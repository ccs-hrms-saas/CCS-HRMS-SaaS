-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Group-Scoped Holidays (Phase E)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add scope column to company_holidays ───────────────────────────────────
-- scope = 'all'   → applies to every employee (existing behaviour)
-- scope = 'group' → applies only to members of specific groups
ALTER TABLE company_holidays
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE company_holidays
  ADD CONSTRAINT company_holidays_scope_check
    CHECK (scope IN ('all', 'group'));

-- ── 2. holiday_group_scopes — which groups get this holiday ───────────────────
CREATE TABLE IF NOT EXISTS holiday_group_scopes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_id  UUID NOT NULL REFERENCES company_holidays(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES employee_groups(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS holiday_group_scopes_unique_idx
  ON holiday_group_scopes (holiday_id, group_id);

CREATE INDEX IF NOT EXISTS holiday_group_scopes_holiday_idx
  ON holiday_group_scopes (holiday_id);

CREATE INDEX IF NOT EXISTS holiday_group_scopes_group_idx
  ON holiday_group_scopes (group_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE holiday_group_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holiday_group_scopes_company_isolation"
  ON holiday_group_scopes FOR ALL
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 4. Helper view: effective holidays per employee ───────────────────────────
-- Returns holiday dates that apply to a given employee:
--   a) All global holidays (scope = 'all')
--   b) Group holidays where the employee is a member of that group
CREATE OR REPLACE VIEW employee_effective_holidays AS
SELECT DISTINCT
  ch.id           AS holiday_id,
  ch.company_id,
  ch.date,
  ch.name,
  ch.scope,
  egm.user_id     AS employee_id  -- NULL for global holidays
FROM company_holidays ch
LEFT JOIN holiday_group_scopes hgs ON hgs.holiday_id = ch.id
LEFT JOIN employee_group_members egm ON egm.group_id  = hgs.group_id
WHERE ch.scope = 'all'
   OR (ch.scope = 'group' AND egm.user_id IS NOT NULL);

-- ── 5. Function: get holiday dates for a specific employee ────────────────────
CREATE OR REPLACE FUNCTION get_employee_holidays(
  p_company_id UUID,
  p_user_id    UUID
)
RETURNS SETOF DATE
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ch.date
  FROM company_holidays ch
  WHERE ch.company_id = p_company_id
    AND (
      ch.scope = 'all'
      OR (
        ch.scope = 'group'
        AND EXISTS (
          SELECT 1
          FROM holiday_group_scopes hgs
          JOIN employee_group_members egm
            ON egm.group_id = hgs.group_id AND egm.user_id = p_user_id
          WHERE hgs.holiday_id = ch.id
        )
      )
    );
$$;
