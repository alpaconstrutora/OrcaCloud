-- ============================================================================
-- Condomínios › Documentos — upload de arquivo (convenção, regulamento, ata)
-- Plano: docs/planos/2026-09-04-condominio-ficha-largura-e-aba-documentos.md
--
-- POR QUE ESTA MIGRATION EXISTE
-- `condominio_documentos` (criada na aplicar_20270905000023) só sabe guardar
-- LINK: `url TEXT NOT NULL`. Não havia upload em lugar nenhum do módulo, e o
-- formulário avisava por escrito que "arquivo em bucket privado não vai abrir",
-- porque o Portal do Condômino entra por token, sem sessão.
--
-- POR QUE O BUCKET É PRIVADO (e não o `documents`, que é public=true)
-- Bucket público serve o objeto por URL eterna, sem checar RLS nem sessão —
-- quem recebeu o link uma vez fica com ele para sempre. Convenção registrada,
-- ata de assembleia e laudo trazem nome, CPF e endereço de condômino. O que
-- destrava o portal não é abrir o bucket: é a edge function
-- `condomino-portal-download`, que valida o token e o vínculo antes de assinar
-- — mesmo molde de `portal-ged-download` e das outras quatro já em produção.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ (nunca `supabase db push`).
--
-- ⚠️ RENUMERADA, E **JÁ APLICADA** SOB O NÚMERO ANTIGO.
-- Nasceu como `aplicar_20270918000027` e colidiu com
-- `aplicar_20270918000027_portal_cliente_dados_da_unidade.sql`, de outra frente
-- que chegou antes — quem chega depois é quem move. Prefixo repetido tira a
-- única coisa que o prefixo faz: dizer a ordem.
--
-- **NÃO REAPLIQUE ESPERANDO QUE SEJA A PRIMEIRA VEZ.** Os blocos 1 a 4 rodaram
-- no banco remoto em 04/09/2026, sob o nome antigo, e o bloco 5 devolveu
-- `bucket_privado=1, colunas=4, url_nullable=1, tem_check=1, policies_org=4,
-- policies_anon=0`. Reexecutar é seguro (tudo é `IF NOT EXISTS` / `ON CONFLICT`
-- / `DROP POLICY IF EXISTS`), mas rodar "para aplicar" daria a impressão falsa
-- de que o banco só agora ficou correto.
-- ============================================================================

-- ═══ BLOCO 1 — o bucket ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'condominio-documentos',
    'condominio-documentos',
    false,       -- privado: só abre por URL assinada
    52428800,    -- 50 MiB, mesmo teto de opura-docs e documents
    -- Allowlist sem `text/html`: mesmo em bucket privado, a URL assinada serve
    -- do domínio de storage da organização, e HTML ali é vetor de phishing com
    -- ar de legítimo (é o achado C3-07 da auditoria de 2026-09-01).
    ARRAY[
        'application/pdf',
        'image/png', 'image/jpeg', 'image/webp',
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

-- ═══ BLOCO 2 — as colunas do arquivo ════════════════════════════════════════
-- `storage_path` guarda o CAMINHO, nunca a URL montada: URL assinada expira, e
-- URL pública persistida no banco foi a armadilha que a privatização de storage
-- (F0/F1) teve de desfazer em quatro tabelas. Assina-se na LEITURA.
SET lock_timeout = '5s';

ALTER TABLE public.condominio_documentos
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS file_name    TEXT,
    ADD COLUMN IF NOT EXISTS mime_type    TEXT,
    ADD COLUMN IF NOT EXISTS file_size    BIGINT;

COMMENT ON COLUMN public.condominio_documentos.storage_path IS
    'Caminho no bucket condominio-documentos ({org}/{empreendimento}/{uuid}.{ext}). NULL quando o documento é link externo.';
COMMENT ON COLUMN public.condominio_documentos.url IS
    'Endereço externo do documento. NULL quando o arquivo foi enviado (aí vale storage_path).';

-- ═══ BLOCO 3 — `url` deixa de ser obrigatória ═══════════════════════════════
-- Mas o documento continua tendo de apontar para ALGUM lugar: linha com os dois
-- nulos é registro que não abre em lugar nenhum, e nada na UI o denunciaria.
SET lock_timeout = '5s';

ALTER TABLE public.condominio_documentos
    ALTER COLUMN url DROP NOT NULL;

ALTER TABLE public.condominio_documentos
    DROP CONSTRAINT IF EXISTS condominio_docs_tem_destino;
ALTER TABLE public.condominio_documentos
    ADD CONSTRAINT condominio_docs_tem_destino
    CHECK (url IS NOT NULL OR storage_path IS NOT NULL);

-- ═══ BLOCO 4 — RLS do bucket, escopada por organização ══════════════════════
-- `foldername(name)[1]` é o organization_id, e é `storage.objects.name` porque
-- a expressão está FORA de qualquer subquery (dentro dela, `name` casaria com a
-- coluna homônima da tabela do subquery — a armadilha que quebrou `receipts`
-- em silêncio na F1 da privatização).
-- Nenhuma policy para `anon`: quem entra sem sessão é o portal, e o portal
-- passa pela edge function com service_role, não por aqui.
SET lock_timeout = '5s';

DROP POLICY IF EXISTS "condominio_docs_storage_read"   ON storage.objects;
CREATE POLICY "condominio_docs_storage_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'condominio-documentos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "condominio_docs_storage_insert" ON storage.objects;
CREATE POLICY "condominio_docs_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'condominio-documentos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "condominio_docs_storage_update" ON storage.objects;
CREATE POLICY "condominio_docs_storage_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'condominio-documentos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'condominio-documentos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "condominio_docs_storage_delete" ON storage.objects;
CREATE POLICY "condominio_docs_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'condominio-documentos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

-- ═══ BLOCO 5 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: bucket_privado=1, colunas=4, url_nullable=1, tem_check=1,
--           policies_org=4, policies_anon=0
SELECT
  (SELECT count(*) FROM storage.buckets
    WHERE id = 'condominio-documentos' AND NOT public)                          AS bucket_privado,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='condominio_documentos'
      AND column_name IN ('storage_path','file_name','mime_type','file_size'))  AS colunas,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='condominio_documentos'
      AND column_name='url' AND is_nullable='YES')                              AS url_nullable,
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'condominio_docs_tem_destino')                              AS tem_check,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'condominio_docs_storage_%')                          AS policies_org,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND qual LIKE '%condominio-documentos%'
      AND (roles::text LIKE '%anon%' OR roles::text = '{public}'))              AS policies_anon;
