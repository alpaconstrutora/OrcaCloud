-- Bucket público para foto de capa das unidades comerciais (Tabela de Preços
-- de Venda de Ativos / Locações — components/PriceTableManager.tsx).
-- Foto precisa ser lida sem sessão porque também aparece no Portal do
-- Corretor (link público). Path: {organization_id}/{property_id}/{uuid}-{nome}.ext
-- Date: 2026-08-30

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'commercial-property-photos',
    'commercial-property-photos',
    true,        -- público: URL permanente, sem autenticação (Portal do Corretor)
    10485760,    -- 10 MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer membro da organização (não só owner/admin) faz upload — a Tabela de
-- Preços é mantida pela equipe comercial, não só por admins.
DROP POLICY IF EXISTS "Org members can upload commercial property photos" ON storage.objects;
CREATE POLICY "Org members can upload commercial property photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'commercial-property-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members can update commercial property photos" ON storage.objects;
CREATE POLICY "Org members can update commercial property photos" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'commercial-property-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members can delete commercial property photos" ON storage.objects;
CREATE POLICY "Org members can delete commercial property photos" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'commercial-property-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

-- Leitura pública (bucket public=true já permite, mas policy explícita garante
-- e documenta a intenção — mesmo padrão de opportunity-photos).
DROP POLICY IF EXISTS "Public can read commercial property photos" ON storage.objects;
CREATE POLICY "Public can read commercial property photos" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'commercial-property-photos');
