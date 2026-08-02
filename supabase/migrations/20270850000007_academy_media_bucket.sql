-- ============================================================
-- Academia ÒPURA — Etapa 1, passo 8
-- Bucket privado de mídia das aulas, materiais e certificados.
--
-- public = false desde o nascimento: bucket público ignora RLS na leitura
-- (PLANO_STORAGE_PRIVATIZACAO.md, regra de ouro). O banco guarda o PATH;
-- a URL assinada é gerada na leitura, com TTL de 15 min, e nunca persistida.
--
-- Layout de path:
--   {org_id}/{course_id}/{version_id}/{lesson_id}.{ext}   aulas
--   {org_id}/materiais/{version_id}/{material_id}.{ext}   materiais
--   {org_id}/certificados/{certificate_id}.pdf            certificados
--   {org_id}/capas/{course_id}.{ext}                      capa do catálogo
-- O primeiro segmento é SEMPRE o org_id — é o que a policy usa.
-- ============================================================

SET lock_timeout = '3s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'academy-media', 'academy-media', FALSE,
    2147483648,  -- 2 GB: vídeo de treinamento longo cabe
    ARRAY[
        'video/mp4','video/webm','video/quicktime','video/x-msvideo',
        'audio/mpeg','audio/mp4','audio/ogg','audio/wav',
        'application/pdf',
        'image/png','image/jpeg','image/webp','image/gif',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public             = FALSE,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ⚠️ storage.objects.name SEMPRE qualificado. Sem o prefixo, o planner
-- confunde com outras colunas "name" em escopo e dá 42702 (ambiguous).

DROP POLICY IF EXISTS "academy_media_select" ON storage.objects;
CREATE POLICY "academy_media_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'academy-media'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT om.organization_id::text
              FROM public.organization_members om
             WHERE om.user_id = auth.uid()
                OR om.email = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS "academy_media_insert" ON storage.objects;
CREATE POLICY "academy_media_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'academy-media'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT om.organization_id::text
              FROM public.organization_members om
             WHERE om.user_id = auth.uid()
                OR om.email = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS "academy_media_update" ON storage.objects;
CREATE POLICY "academy_media_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'academy-media'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT om.organization_id::text
              FROM public.organization_members om
             WHERE om.user_id = auth.uid()
                OR om.email = auth.jwt() ->> 'email'
        )
    );

DROP POLICY IF EXISTS "academy_media_delete" ON storage.objects;
CREATE POLICY "academy_media_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'academy-media'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT om.organization_id::text
              FROM public.organization_members om
             WHERE om.user_id = auth.uid()
                OR om.email = auth.jwt() ->> 'email'
        )
    );

-- Nenhuma policy para anon: o portal por token NUNCA fala com o Storage
-- direto. Ele passa pela Edge Function academy-portal-media, que valida o
-- token + a matrícula e assina com service role.
