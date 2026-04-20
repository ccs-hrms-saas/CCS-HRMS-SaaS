-- ── platform_config: Global key-value config managed by developer  ──────────
CREATE TABLE IF NOT EXISTS platform_config (
  key        TEXT PRIMARY KEY,
  value      TEXT DEFAULT '',
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default download config
INSERT INTO platform_config (key, value, label) VALUES
  ('kiosk_apk_url',        '', 'Kiosk App APK Download URL'),
  ('kiosk_apk_version',    '1.0.0', 'Kiosk App Version'),
  ('employee_apk_url',     '', 'Employee Mobile App APK URL'),
  ('employee_apk_version', '1.0.0', 'Employee App Version')
ON CONFLICT (key) DO NOTHING;

-- RLS: anyone authenticated can read, no one can write (writes go via service role API)
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read platform_config"
  ON platform_config FOR SELECT USING (true);

-- ── Supabase Storage bucket for APK files ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'platform-apks',
  'platform-apks',
  true,         -- public bucket so download URLs work without auth
  104857600,    -- 100 MB limit per file
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public download (SELECT) from this bucket
CREATE POLICY "Public read platform-apks"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-apks');

-- Only service role can upload (INSERT/UPDATE/DELETE) — handled via API
