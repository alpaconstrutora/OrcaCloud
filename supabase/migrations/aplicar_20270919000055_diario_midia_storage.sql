-- ============================================================================
-- Diário de Obras — fotos, vídeos e documentos saem do JSONB e vão para Storage
-- Plano: docs/planos/2026-09-23-diario-fotos-storage.md
--
-- POR QUE ESTA MIGRATION EXISTE
-- Os registros do diário moram em `projects.settings.diaryEntries` (JSONB), e
-- até aqui cada foto era gravada ali dentro como data URL (base64). Uma foto de
-- celular tem 2–4 MB; um diário com um mês de obra levaria o `settings` do
-- projeto a dezenas de MB, e esse JSON é carregado inteiro em toda leitura do
-- projeto (lista de obras, portal do cliente, planejamento vinculado).
--
-- O QUE MUDA NO DADO
-- Nada de coluna nova. `images: string[]`, `videos: string[]` e
-- `documents[].url` continuam existindo — só passam a guardar o CAMINHO do
-- objeto neste bucket (`{org}/{projeto}/{uuid}.{ext}`) em vez do conteúdo. A
-- URL assinada é gerada na LEITURA e nunca persistida: URL assinada expira, e
-- URL pública persistida foi a armadilha que a privatização de storage (F0/F1)
-- teve de desfazer em quatro tabelas.
--
-- POR QUE O BUCKET É PRIVADO
-- Foto de canteiro mostra gente, placa de obra, endereço, às vezes documento.
-- Bucket público serve o objeto por URL eterna, sem checar RLS nem sessão. O
-- Portal do Cliente (link público, sem sessão) NÃO abre o bucket: passa pela
-- edge function `client-portal-diary-download`, que valida o token pela mesma
-- RPC do portal antes de assinar — molde de `client-portal-condominio-download`.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ (nunca `supabase db push`).
--
-- ⚠️ RENUMERADA antes de aplicar: nasceu `aplicar_20270919000030` e colidiu com
-- `20270919000030_cost_center_n_por_empreendimento.sql`; o `000040` seguinte já
-- era de `contratos_backfill_contract_id` — outras frentes que chegaram antes, e
-- quem chega depois é quem move. NUNCA rodou sob número nenhum antes deste.
-- ============================================================================

-- ═══ BLOCO 1 — o bucket ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'diario-midia',
    'diario-midia',
    false,       -- privado: só abre por URL assinada
    52428800,    -- 50 MiB, mesmo teto de opura-docs e condominio-documentos
    -- Allowlist sem `text/html`: mesmo em bucket privado, a URL assinada serve
    -- do domínio de storage da organização, e HTML ali é vetor de phishing com
    -- ar de legítimo (achado C3-07 da auditoria de 2026-09-01).
    -- HEIC/HEIF entram porque é o que a câmera do iPhone entrega quando o
    -- navegador não converte.
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
   SET public             = EXCLUDED.public,
       file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══ BLOCO 2 — RLS do bucket, escopada por organização ══════════════════════
-- `foldername(name)[1]` é o organization_id, e é `storage.objects.name` porque
-- a expressão está FORA de qualquer subquery (dentro dela, `name` casaria com a
-- coluna homônima da tabela do subquery — a armadilha que quebrou `receipts`
-- em silêncio na F1 da privatização).
-- Nenhuma policy para `anon`: quem entra sem sessão é o portal, e o portal
-- passa pela edge function com service_role, não por aqui.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "diario_midia_storage_read" ON storage.objects;
CREATE POLICY "diario_midia_storage_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'diario-midia'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "diario_midia_storage_insert" ON storage.objects;
CREATE POLICY "diario_midia_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'diario-midia'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "diario_midia_storage_update" ON storage.objects;
CREATE POLICY "diario_midia_storage_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'diario-midia'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'diario-midia'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "diario_midia_storage_delete" ON storage.objects;
CREATE POLICY "diario_midia_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'diario-midia'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

-- ═══ BLOCO 3 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: bucket_privado=1, policies_org=4, policies_anon=0
SELECT
  (SELECT count(*) FROM storage.buckets
    WHERE id = 'diario-midia' AND NOT public)                                   AS bucket_privado,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'diario_midia_storage_%')                             AS policies_org,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual LIKE '%diario-midia%' OR with_check LIKE '%diario-midia%')
      AND (roles::text LIKE '%anon%' OR roles::text = '{public}'))              AS policies_anon;
