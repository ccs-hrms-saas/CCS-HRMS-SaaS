-- ============================================================
-- Fix: attendance-photos bucket must be PUBLIC so getPublicUrl works
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create bucket as public (ON CONFLICT updates existing bucket to public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-photos',
  'attendance-photos',
  true,           -- PUBLIC = getPublicUrl works without signed URLs
  5242880,        -- 5 MB limit per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop any old conflicting policies
DROP POLICY IF EXISTS "anon_upload_attendance_photos"   ON storage.objects;
DROP POLICY IF EXISTS "anon_read_attendance_photos"     ON storage.objects;
DROP POLICY IF EXISTS "auth_read_attendance_photos"     ON storage.objects;
DROP POLICY IF EXISTS "Kiosk can upload attendance photos" ON storage.objects;

-- 3. Allow ANON (kiosk tablet - no auth session) to INSERT photos
CREATE POLICY "attendance_photos_anon_insert"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'attendance-photos');

-- 4. Allow AUTHENTICATED users to INSERT photos (fallback)
CREATE POLICY "attendance_photos_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attendance-photos');

-- 5. Allow ANON to read/SELECT photos (public thumbnails in kiosk result screen)
CREATE POLICY "attendance_photos_anon_select"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'attendance-photos');

-- 6. Allow AUTHENTICATED (admin/manager) to read photos
CREATE POLICY "attendance_photos_auth_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attendance-photos');

-- 7. Allow upsert (UPDATE) - needed because kiosk uses upsert:true
CREATE POLICY "attendance_photos_anon_update"
ON storage.objects FOR UPDATE
TO anon
USING (bucket_id = 'attendance-photos')
WITH CHECK (bucket_id = 'attendance-photos');
