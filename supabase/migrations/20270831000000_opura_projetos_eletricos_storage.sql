-- Migration: opura_projetos_eletricos_storage
-- Description: Criação do bucket de storage para plantas elétricas.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'electrical_plans',
  'electrical_plans',
  false, 
  52428800, -- 50MB
  ARRAY['image/png', 'image/jpeg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Authenticated users can upload electrical plans" ON storage.objects;
    CREATE POLICY "Authenticated users can upload electrical plans"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'electrical_plans');

    DROP POLICY IF EXISTS "Authenticated users can update electrical plans" ON storage.objects;
    CREATE POLICY "Authenticated users can update electrical plans"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'electrical_plans');

    DROP POLICY IF EXISTS "Authenticated users can read electrical plans" ON storage.objects;
    CREATE POLICY "Authenticated users can read electrical plans"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'electrical_plans');

    DROP POLICY IF EXISTS "Authenticated users can delete electrical plans" ON storage.objects;
    CREATE POLICY "Authenticated users can delete electrical plans"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'electrical_plans');
    
    DROP POLICY IF EXISTS "Anon can do all on electrical plans" ON storage.objects;
    CREATE POLICY "Anon can do all on electrical plans"
    ON storage.objects FOR ALL TO anon
    USING (bucket_id = 'electrical_plans')
    WITH CHECK (bucket_id = 'electrical_plans');
END $$;
