-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: White-labelling columns + demo_mode_enabled on companies table
-- Date: 2026-04-23
-- ──────────────────────────────────────────────────────────────────────────────

-- White-label tier:
--   1 = No white-labelling (default, shows CCS-HRMS branding)
--   2 = Display name only (tenant can change name, not logo)
--   3 = Display name + logo (full white-label)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS white_label_tier      INTEGER     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS white_label_name      TEXT,
  ADD COLUMN IF NOT EXISTS white_label_logo_url  TEXT,
  ADD COLUMN IF NOT EXISTS demo_mode_enabled     BOOLEAN     DEFAULT true;

-- Back-fill sensible defaults for all existing companies
UPDATE companies SET
  white_label_tier  = COALESCE(white_label_tier,  1),
  demo_mode_enabled = COALESCE(demo_mode_enabled, true)
WHERE white_label_tier IS NULL OR demo_mode_enabled IS NULL;

-- Add a comment for clarity
COMMENT ON COLUMN companies.white_label_tier     IS '1 = none, 2 = name only, 3 = name + logo';
COMMENT ON COLUMN companies.white_label_name     IS 'Display name shown in sidebar and welcome banner (tier 2+)';
COMMENT ON COLUMN companies.white_label_logo_url IS 'Logo URL shown in sidebar (tier 3 only)';
COMMENT ON COLUMN companies.demo_mode_enabled    IS 'Developer toggle: show/hide the Demo employee-view button';
