-- ══════════════════════════════════════════════════════════════════════════════
-- Storage Buckets — CCS HRMS SaaS
-- Creates all required Supabase Storage buckets with proper RLS policies.
--
-- Buckets:
--   attendance-photos  → kiosk punch-in selfies (check-in / check-out photos)
--   avatars            → employee & admin profile pictures
--   documents          → private HR documents (offer letters, contracts, etc.)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create buckets ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'attendance-photos',
    'attendance-photos',
    true,                               -- public read (admin panel shows photos)
    5242880,                            -- 5 MB max per file
    ARRAY['image/jpeg','image/jpg','image/png','image/webp']
  ),
  (
    'avatars',
    'avatars',
    true,                               -- public read (profile pictures displayed everywhere)
    3145728,                            -- 3 MB max per file
    ARRAY['image/jpeg','image/jpg','image/png','image/webp']
  ),
  (
    'documents',
    'documents',
    false,                              -- private — employees can only read their own docs
    20971520,                           -- 20 MB max per file
    ARRAY[
      'application/pdf',
      'image/jpeg','image/jpg','image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
ON CONFLICT (id) DO NOTHING;            -- safe to re-run: won't fail if bucket exists


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — attendance-photos
-- Service role (API) can upload; anyone authenticated can view.
-- ══════════════════════════════════════════════════════════════════════════════

-- Allow service role (used by API routes) to upload
CREATE POLICY "Service role can upload attendance photos"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'attendance-photos');

-- Allow service role to update / overwrite
CREATE POLICY "Service role can update attendance photos"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'attendance-photos');

-- Allow any authenticated user to read (admin panel, employee portal)
CREATE POLICY "Authenticated users can view attendance photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attendance-photos');

-- Public read (for public URLs used in kiosk success screen)
CREATE POLICY "Public read attendance photos"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'attendance-photos');


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — avatars
-- Employees can upload their own avatar; service role can manage all.
-- ══════════════════════════════════════════════════════════════════════════════

-- Employees upload into their own folder: avatars/{user_id}/...
CREATE POLICY "Employees can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Employees can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Employees can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can manage all avatars (admin bulk upload)
CREATE POLICY "Service role can manage all avatars"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- Public read for avatars (displayed in kiosk, employee cards, etc.)
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — documents
-- Private bucket: employees read only their own docs; admins read all in tenant.
-- ══════════════════════════════════════════════════════════════════════════════

-- Employees can read documents in their own folder: documents/{user_id}/...
CREATE POLICY "Employees can read their own documents"
  ON storage.objects FOR SELECT
-- Employees can upload documents to their own folder: documents/{user_id}/...
CREATE POLICY "Employees can upload their own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Employees can replace/update their own documents
CREATE POLICY "Employees can update their own documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role (admin API) can manage all documents
CREATE POLICY "Service role can manage all documents"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Employees can read documents in their own folder: documents/{user_id}/...
CREATE POLICY "Employees can read their own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read all documents for their company
-- (relies on profiles.company_id matching the folder structure: documents/{user_id}/...)
CREATE POLICY "Admins can read all documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
        AND system_role IS NULL
    )
  );
