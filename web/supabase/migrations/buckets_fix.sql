-- 1. Create ALL required buckets explicitly and ensure they are PUBLIC so getPublicUrl works
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', true) ON CONFLICT (id) DO UPDATE SET public = true;
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-pictures', 'profile-pictures', true) ON CONFLICT (id) DO UPDATE SET public = true;
INSERT INTO storage.buckets (id, name, public) VALUES ('medical-certificates', 'medical-certificates', true) ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop any flawed/restrictive old policies to ensure a clean slate
DROP POLICY IF EXISTS "Admins can view employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Employees can view own docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload employee docs" ON storage.objects;
DROP POLICY IF EXISTS "Employees can upload own docs" ON storage.objects;
DROP POLICY IF EXISTS "Public read for profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own picture" ON storage.objects;

-- 3. Universal Read Access (since they are public buckets, we allow select globally so URLs function)
CREATE POLICY "Global Read Access for Documents" ON storage.objects FOR SELECT USING (bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates'));

-- 4. Authorized Insert/Update Policies (Allow logged in users to upload and overwrite files)
CREATE POLICY "Authenticated Insert Access" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') 
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated Update Access" ON storage.objects FOR UPDATE USING (
    bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') 
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated Delete Access" ON storage.objects FOR DELETE USING (
    bucket_id IN ('employee-documents', 'profile-pictures', 'medical-certificates') 
    AND auth.role() = 'authenticated'
);
