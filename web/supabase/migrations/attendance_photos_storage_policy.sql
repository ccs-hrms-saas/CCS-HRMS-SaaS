-- Fix attendance-photos storage bucket policies
-- The mobile kiosk app uses anon key (no auth session), so anon must be allowed to upload

-- Ensure bucket exists and is public (Supabase dashboard must do this, but the policies cover RLS)
-- Run this if bucket doesn't exist yet:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('attendance-photos', 'attendance-photos', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anon to upload photos (INSERT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'anon_upload_attendance_photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "anon_upload_attendance_photos"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'attendance-photos')
    $policy$;
  END IF;
END $$;

-- Allow anon to read/view photos (SELECT) — needed for thumbnail display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'anon_read_attendance_photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "anon_read_attendance_photos"
      ON storage.objects FOR SELECT
      TO anon
      USING (bucket_id = 'attendance-photos')
    $policy$;
  END IF;
END $$;

-- Allow authenticated users (admins/employees) to also read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'auth_read_attendance_photos'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "auth_read_attendance_photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'attendance-photos')
    $policy$;
  END IF;
END $$;
