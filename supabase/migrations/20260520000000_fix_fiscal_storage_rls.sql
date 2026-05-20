-- Fix: fiscal_docs_insert policy was using user_id = auth.uid()
-- but organization_members stores users by email (user_id is nullable).
-- All other RLS policies in this project use email = auth.jwt()->>'email'.

DROP POLICY IF EXISTS "fiscal_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "fiscal_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "fiscal_docs_delete" ON storage.objects;

CREATE POLICY "fiscal_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "fiscal_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE email = auth.jwt() ->> 'email'
  )
);

CREATE POLICY "fiscal_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fiscal-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text
    FROM public.organization_members
    WHERE email = auth.jwt() ->> 'email'
  )
);
