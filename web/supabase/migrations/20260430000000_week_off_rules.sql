-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add week_off_rules JSONB column to app_settings
-- This enables ordinal-based off-day patterns like "1st & 3rd Saturday off"
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add the column — JSONB array of { day, mode, weeks? } objects
ALTER TABLE "public"."app_settings"
  ADD COLUMN IF NOT EXISTS week_off_rules JSONB DEFAULT '[]'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN "public"."app_settings"."week_off_rules" IS
  'Array of WeekOffRule objects: [{day: 0, mode: "all"}, {day: 6, mode: "specific", weeks: [1,3]}]. '
  'When present and non-empty, these OVERRIDE the flat week_off_days array for fixed mode. '
  'This allows complex patterns like "1st & 3rd Saturday off" or "alternate Friday off".';
