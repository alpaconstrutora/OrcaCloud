-- Bucket público para fotos de oportunidades publicadas
-- Fotos com is_published=true ficam aqui: URL permanente, sem signed URL
-- Date: 2026-11-09

-- ─── Bucket público ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'opportunity-photos',
    'opportunity-photos',
    true,        -- público: URL permanente sem autenticação
    52428800,    -- 50 MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Admins da org fazem upload
DROP POLICY IF EXISTS "Admins can upload opportunity photos" ON storage.objects;
CREATE POLICY "Admins can upload opportunity photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'opportunity-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

-- Admins atualizam (upsert)
DROP POLICY IF EXISTS "Admins can update opportunity photos" ON storage.objects;
CREATE POLICY "Admins can update opportunity photos" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'opportunity-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

-- Admins deletam
DROP POLICY IF EXISTS "Admins can delete opportunity photos" ON storage.objects;
CREATE POLICY "Admins can delete opportunity photos" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'opportunity-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

-- Leitura pública (bucket public=true já permite, mas policy explícita garante)
DROP POLICY IF EXISTS "Public can read opportunity photos" ON storage.objects;
CREATE POLICY "Public can read opportunity photos" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'opportunity-photos');
