-- ============================================================================
-- Migration: aplicar_20271118914000_storage_organization_assets_por_registro.sql
-- SEGURANÇA (F9) — bucket `organization-assets`: arquivos de RH e foto de ativo
-- por REGISTRO, bucket privado
--
-- PROBLEMA
-- O bucket é PÚBLICO e as 3 policies dele só conferem `bucket_id`
-- (20260325183000_employee_documents.sql):
--   "Permitir Leitura Pública"                     SELECT, papel {public}
--   "Permitir Upload para Usuários Autenticados"   INSERT, qualquer conta
--   "Permitir Exclusão para Usuários Autenticados" DELETE, qualquer conta
-- No bucket moram documentos do colaborador (atestado, ASO, RG…), anexos de
-- alteração salarial, atestados de ausência, certificados de treinamento e fotos
-- de colaborador e de ativo. Com a chave anon do bundle dava para LISTAR e baixar
-- tudo, de todas as empresas, e URL vazada nunca expirava; com um signUp, apagar
-- ou trocar arquivo de outra empresa.
--
-- O QUE MUDA
-- 1. As 3 policies saem. Entram 4 (SELECT/INSERT/UPDATE/DELETE, TO authenticated)
--    em que o objeto é liberado pelo REGISTRO cujo id está no CAMINHO, consultado
--    sob a RLS da tabela dele (a função é SECURITY INVOKER de propósito — é a RLS
--    de quem chama que decide; DEFINER pularia a RLS e teria de reescrevê-la):
--      labor-photos/<org>/<colaborador>/<arquivo>
--          ler:    quem ENXERGA o colaborador (RLS de employees: membro da org
--                  dele ou org com quem ele foi compartilhado — a foto aparece
--                  onde o colaborador aparece);
--          gravar: membro da org do colaborador (o mesmo que pode trocar
--                  `employees.avatar_url`).
--      labor-documents/<colaborador>/<arquivo>
--      labor-salary-history/<colaborador>/<arquivo>
--          ler e gravar: membro da org do colaborador. O compartilhamento
--          (`employee_org_shares`) existe para pagar a pessoa, não para ver
--          atestado e salário.
--      absences/<org>/<ausência>.<ext>       → quem enxerga a ausência (RLS de absences)
--      trainings/<org>/<registro>.<ext>      → quem enxerga o registro (RLS de employee_trainings)
--      asset-photos/<org>/<ativo>/<arquivo>  → quem enxerga o ativo (RLS de opura_assets)
--      qualquer outro layout                 → ninguém pela API (service_role segue)
--    A org do caminho é só organização da pasta: colaborador/ativo que muda de
--    org continua com o arquivo (é o id do registro que decide).
--    NUNCA pela referência gravada em coluna (`avatar_url`, `file_url`…): quem
--    chama controla essas colunas e poderia "apontar" para arquivo alheio — foi
--    o motivo de a 1ª tentativa do F9 ser recusada.
-- 2. O bucket vira PRIVADO (`public = false`): URL pública antiga dá 400. O app
--    lê por URL assinada (lib/storageAssinado.ts, hooks/useUrlAssinada.ts).
--
-- ORDEM (não inverter):
--   1. Merge do PR (front que lê por URL assinada e sobe foto na pasta do registro).
--   2. Script de dados: `node scripts/storage-rehomear-fotos.mjs --ensaio`, depois
--      sem `--ensaio` — move as fotos do layout antigo (`labor-photos/<org>/<arq>`,
--      `asset-photos/<org>/<arq>`) para a pasta do registro e atualiza a coluna.
--   3. ESTA migration.
--   4. aplicar_20271118914100_storage_documents_privado.sql (bucket `documents`).
-- Antes do passo 1, a foto e o documento de RH pararam de abrir (o front antigo
-- usa getPublicUrl). Antes do passo 2, a pré-condição abaixo ABORTA sem mudar
-- nada: foto referenciada no layout antigo ficaria inalcançável.
--
-- Números em 18/11/2026 (leitura): 10 objetos — 6 labor-documents, 3
-- labor-photos (2 referenciados + 1 órfão), 1 asset-photos (ativo que já mudou
-- de org). Nada no bucket é público por natureza (sem logo, papel timbrado ou
-- arquivo de portal) — por isso o bucket inteiro fica privado, sem separar.
--
-- REGRA #7
-- Pergunta 1: toda policy exige o bucket E o registro do caminho — nenhuma perna
-- libera sozinha.
-- Pergunta 2: a função é SECURITY INVOKER (RLS de quem chama vale dentro dela),
-- search_path fixo, REVOKE de PUBLIC/anon e GRANT só para authenticated.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
--
-- COMO CONFERIR (depois de aplicar)
--   SELECT public FROM storage.buckets WHERE id = 'organization-assets';   -- false
--   SELECT policyname, roles FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND (qual ILIKE '%organization-assets%' OR with_check ILIKE '%organization-assets%');
--     → só as 4 org_assets_*_registro, todas {authenticated}
--   De fora: curl -sI "<SUPABASE_URL>/storage/v1/object/public/organization-assets/<caminho>"  → 400
--   No app: RH › Documentos › baixar; Colaborador › foto 3x4; Ativos › coluna Imagem.
--
-- VOLTA (se precisar):
--   UPDATE storage.buckets SET public = true WHERE id = 'organization-assets';
--   DROP POLICY IF EXISTS "org_assets_select_registro" ON storage.objects;
--   DROP POLICY IF EXISTS "org_assets_insert_registro" ON storage.objects;
--   DROP POLICY IF EXISTS "org_assets_update_registro" ON storage.objects;
--   DROP POLICY IF EXISTS "org_assets_delete_registro" ON storage.objects;
--   DROP FUNCTION IF EXISTS public.org_assets_objeto_permitido(text, boolean);
--   e recriar as 3 de 20260325183000_employee_documents.sql.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

-- ── 0. Pré-condições ─────────────────────────────────────────────────────────
DO $pre$
DECLARE
    r record;
    v_n int;
    v_esperado CONSTANT text := '(bucket_id=''organization-assets''::text)';
BEGIN
    -- Toda policy que cobre o bucket tem de ser uma das 3 antigas (só o bucket)
    -- ou uma das 4 novas. Outra qualquer = drift: conferir à mão.
    FOR r IN
        SELECT policyname, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND (COALESCE(qual, '') ILIKE '%''organization-assets''%' OR COALESCE(with_check, '') ILIKE '%''organization-assets''%')
           AND policyname NOT IN ('org_assets_select_registro', 'org_assets_insert_registro',
                                  'org_assets_update_registro', 'org_assets_delete_registro')
    LOOP
        IF COALESCE(regexp_replace(r.qual,       '\s', '', 'g'), v_esperado) <> v_esperado
        OR COALESCE(regexp_replace(r.with_check, '\s', '', 'g'), v_esperado) <> v_esperado THEN
            RAISE EXCEPTION 'storage.objects: policy "%" cobre organization-assets com outra regra (qual=%, with_check=%) — conferir à mão',
                r.policyname, r.qual, r.with_check;
        END IF;
    END LOOP;

    -- Foto referenciada no layout ANTIGO (sem o registro no caminho) ficaria
    -- inalcançável: o script de dados tem de rodar antes.
    SELECT count(*) INTO v_n
      FROM public.employees
     WHERE avatar_url ~ '^labor-photos/'
       AND (array_length(string_to_array(avatar_url, '/'), 1) <> 4
            OR split_part(avatar_url, '/', 3) <> id::text);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'employees: % foto(s) fora de labor-photos/<org>/<colaborador>/ — rode antes: node scripts/storage-rehomear-fotos.mjs', v_n;
    END IF;

    SELECT count(*) INTO v_n
      FROM public.opura_assets
     WHERE image_url ~ '^asset-photos/'
       AND (array_length(string_to_array(image_url, '/'), 1) <> 4
            OR split_part(image_url, '/', 3) <> id::text);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'opura_assets: % foto(s) fora de asset-photos/<org>/<ativo>/ — rode antes: node scripts/storage-rehomear-fotos.mjs', v_n;
    END IF;

    -- URL inteira gravada em vez do caminho (não há hoje) também não seria lida.
    SELECT count(*) INTO v_n
      FROM public.employees
     WHERE avatar_url ILIKE '%/storage/v1/object/public/organization-assets/%';
    SELECT v_n + count(*) INTO v_n
      FROM public.opura_assets
     WHERE image_url ILIKE '%/storage/v1/object/public/organization-assets/%';
    IF v_n > 0 THEN
        RAISE EXCEPTION '% foto(s) gravada(s) como URL pública inteira — rode antes: node scripts/storage-rehomear-fotos.mjs', v_n;
    END IF;
END
$pre$;

-- ── 1. O registro do caminho é visível (ou gerenciável) por quem chama? ───────
-- plpgsql de propósito: cada cast para uuid só roda no ramo que já conferiu o
-- formato (num CASE/AND de SQL a ordem de avaliação não é garantida).
CREATE OR REPLACE FUNCTION public.org_assets_objeto_permitido(p_name text, p_escrita boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    c_uuid   CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_pastas text[] := storage.foldername(p_name);
    v_raiz   text   := v_pastas[1];
    v_n      int    := COALESCE(array_length(v_pastas, 1), 0);
    v_id     text;
BEGIN
    IF v_raiz IS NULL THEN
        RETURN false;                                   -- arquivo solto na raiz
    END IF;

    -- labor-photos/<org>/<colaborador>/<arquivo>
    IF v_raiz = 'labor-photos' THEN
        v_id := v_pastas[3];
        IF v_n <> 3 OR v_id IS NULL OR v_id !~ c_uuid THEN RETURN false; END IF;
        IF p_escrita THEN
            RETURN EXISTS (SELECT 1 FROM public.employees e
                            WHERE e.id = v_id::uuid
                              AND e.org_id IN (SELECT public.minhas_orgs_membro()));
        END IF;
        -- Leitura: a RLS de employees decide (membro OU compartilhado).
        RETURN EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_id::uuid);
    END IF;

    -- labor-documents/<colaborador>/<arquivo>, labor-salary-history/<colaborador>/<arquivo>
    IF v_raiz IN ('labor-documents', 'labor-salary-history') THEN
        v_id := v_pastas[2];
        IF v_n <> 2 OR v_id IS NULL OR v_id !~ c_uuid THEN RETURN false; END IF;
        RETURN EXISTS (SELECT 1 FROM public.employees e
                        WHERE e.id = v_id::uuid
                          AND e.org_id IN (SELECT public.minhas_orgs_membro()));
    END IF;

    -- absences/<org>/<ausência>.<ext>
    IF v_raiz = 'absences' THEN
        v_id := split_part(storage.filename(p_name), '.', 1);
        IF v_n <> 2 OR v_id !~ c_uuid THEN RETURN false; END IF;
        RETURN EXISTS (SELECT 1 FROM public.absences a WHERE a.id = v_id::uuid);
    END IF;

    -- trainings/<org>/<registro>.<ext>
    IF v_raiz = 'trainings' THEN
        v_id := split_part(storage.filename(p_name), '.', 1);
        IF v_n <> 2 OR v_id !~ c_uuid THEN RETURN false; END IF;
        RETURN EXISTS (SELECT 1 FROM public.employee_trainings t WHERE t.id = v_id::uuid);
    END IF;

    -- asset-photos/<org>/<ativo>/<arquivo>
    IF v_raiz = 'asset-photos' THEN
        v_id := v_pastas[3];
        IF v_n <> 3 OR v_id IS NULL OR v_id !~ c_uuid THEN RETURN false; END IF;
        RETURN EXISTS (SELECT 1 FROM public.opura_assets a WHERE a.id = v_id::uuid);
    END IF;

    RETURN false;                                       -- layout desconhecido/antigo
END;
$fn$;

REVOKE ALL     ON FUNCTION public.org_assets_objeto_permitido(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_assets_objeto_permitido(text, boolean) TO authenticated;

-- ── 2. Saem as policies só-por-bucket ────────────────────────────────────────
-- Pelo CONTEÚDO, não pelo nome: os nomes antigos têm acento, e um DROP pelo nome
-- digitado que não casasse seria um IF EXISTS calado deixando tudo aberto.
DO $drop$
DECLARE
    r record;
    v_esperado CONSTANT text := '(bucket_id=''organization-assets''::text)';
BEGIN
    FOR r IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND COALESCE(regexp_replace(qual,       '\s', '', 'g'), v_esperado) = v_esperado
           AND COALESCE(regexp_replace(with_check, '\s', '', 'g'), v_esperado) = v_esperado
           AND (qual IS NOT NULL OR with_check IS NOT NULL)
    LOOP
        EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
        RAISE NOTICE 'organization-assets: removida a policy só-por-bucket "%"', r.policyname;
    END LOOP;
END
$drop$;

-- ── 3. Entram as policies por registro ───────────────────────────────────────
-- SELECT: listar, createSignedUrl(s), download e a metade de leitura de upsert,
-- copy e remove.
DROP POLICY IF EXISTS "org_assets_select_registro" ON storage.objects;
CREATE POLICY "org_assets_select_registro" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'organization-assets' AND public.org_assets_objeto_permitido(name, false));

DROP POLICY IF EXISTS "org_assets_insert_registro" ON storage.objects;
CREATE POLICY "org_assets_insert_registro" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'organization-assets' AND public.org_assets_objeto_permitido(name, true));

-- UPDATE: o upload de atestado e de certificado é upsert (mesmo caminho por registro).
DROP POLICY IF EXISTS "org_assets_update_registro" ON storage.objects;
CREATE POLICY "org_assets_update_registro" ON storage.objects
    FOR UPDATE TO authenticated
    USING      (bucket_id = 'organization-assets' AND public.org_assets_objeto_permitido(name, true))
    WITH CHECK (bucket_id = 'organization-assets' AND public.org_assets_objeto_permitido(name, true));

DROP POLICY IF EXISTS "org_assets_delete_registro" ON storage.objects;
CREATE POLICY "org_assets_delete_registro" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'organization-assets' AND public.org_assets_objeto_permitido(name, true));

-- ── 4. Bucket privado ────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'organization-assets';

-- ── 5. Verificação embutida ──────────────────────────────────────────────────
DO $pos$
DECLARE
    v_n int;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'organization-assets' AND public = false) THEN
        RAISE EXCEPTION 'organization-assets: o bucket não ficou privado';
    END IF;

    -- Só as 4 novas cobrem o bucket, e todas só para authenticated.
    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (COALESCE(qual, '') ILIKE '%''organization-assets''%' OR COALESCE(with_check, '') ILIKE '%''organization-assets''%')
       AND (policyname NOT IN ('org_assets_select_registro', 'org_assets_insert_registro',
                               'org_assets_update_registro', 'org_assets_delete_registro')
            OR roles <> '{authenticated}'::name[]);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'organization-assets: % policy(ies) fora do conjunto esperado ou com papel diferente de authenticated', v_n;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('org_assets_select_registro', 'org_assets_insert_registro',
                          'org_assets_update_registro', 'org_assets_delete_registro');
    IF v_n <> 4 THEN
        RAISE EXCEPTION 'organization-assets: esperadas 4 policies novas, há %', v_n;
    END IF;

    IF has_function_privilege('anon', 'public.org_assets_objeto_permitido(text, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'org_assets_objeto_permitido executável por anon';
    END IF;

    RAISE NOTICE 'organization-assets OK: privado; leitura e escrita pelo registro do caminho, sob a RLS da tabela dele.';
END
$pos$;

COMMIT;
