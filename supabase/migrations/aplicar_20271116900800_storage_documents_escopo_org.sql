-- ============================================================================
-- Migration: aplicar_20271116900800_storage_documents_escopo_org.sql
-- SEGURANÇA — bucket `documents`: listagem anônima e escrita por qualquer conta
--
-- PROBLEMA
-- As 4 policies do bucket (20260214000004_setup_storage.sql) só conferem
-- `bucket_id = 'documents'`:
--   "Public Access"        SELECT, papel {public} → anon LISTA o bucket inteiro
--                          (POST /storage/v1/object/list/documents) e cada
--                          arquivo listado baixa pela URL pública
--   "Authenticated Upload" INSERT → qualquer conta autenticada
--   "Authenticated Update" UPDATE → qualquer conta sobrescreve (upsert) arquivo
--                          de outra organização
--   "Authenticated Delete" DELETE → qualquer conta apaga arquivo de outra org
-- No bucket moram minutas e aditivos de contrato (o PDF que o Portal do Cliente
-- mostra), anexos e NF de medição, parecer jurídico, relatórios e galeria do
-- Portal do Investidor. Com a chave anon do bundle dava para listar e baixar
-- tudo; com um signUp, trocar ou apagar o arquivo de outra empresa.
--
-- O QUE MUDA
-- As 4 saem. Entram policies TO authenticated em que o objeto só é listado /
-- assinado, gravado, sobrescrito ou apagado por MEMBRO da organização dona do
-- caminho (`minhas_orgs_membro()`, a mesma regra da RLS de `contracts`). O dono
-- sai do PREFIXO que o código já grava — nenhum objeto é movido:
--   contract-minutas/<contrato>/…    (contractDocumentVersionService)
--   measurements/<contrato>/…        (ContractMeasurementModal)
--   invoices/<contrato>/…            (ContractMeasurementModal, partnerService)
--                                    → organização do contrato
--   contract-addendums/<aditivo>/…   → organização do contrato do aditivo
--   reports/<org>/…, gallery/<org>/… → a própria org (pdfReportService;
--                                      InvestorDashboard e OpportunityForm
--                                      passam a gravar assim no mesmo commit)
--   <org>/…                          → a própria org (ContractLaborQuestionnaireModal)
--   qualquer outro layout            → ninguém pela API (service_role segue)
--
-- Uma exceção, para o Portal do Parceiro no modo app não quebrar
-- (partnerService.uploadInvoice sobe a NF da medição direto no bucket):
-- INSERT em invoices/<contrato>/ também para quem ENXERGA o contrato pela RLS
-- de `contracts` — membro da org ou usuário ativo do parceiro fornecedor do
-- contrato (contracts_select_partner). Só INSERT: upload sem upsert não
-- sobrescreve, e o parceiro não apaga nem altera nada.
-- O link público do parceiro (partner-portal-upload) e as Edge Functions que
-- assinam minuta para portal usam service_role e não passam por aqui.
--
-- O QUE NÃO MUDA (de propósito)
-- O bucket CONTINUA public = true. Download pela URL pública
-- (/storage/v1/object/public/documents/…) não passa por RLS, então toda URL já
-- emitida segue abrindo: contract_document_versions.url, contracts.minuta_versions
-- (Portal do Cliente), contract_measurements.invoice_url, investor_reports.url,
-- investor_opportunities.gallery_urls, parecer jurídico do questionário.
-- Consequência que FICA: quem já tem uma URL baixa sem login. Fechar isso é
-- tornar o bucket privado e trocar todo leitor por URL assinada (inclusive os
-- portais anônimos) — o que quebra os links já emitidos. Decisão à parte
-- (PLANO_STORAGE_PRIVATIZACAO.md, Fase 2).
--
-- REGRA #7
-- Pergunta 1: nenhuma perna libera sozinha — toda policy exige o bucket E a
-- organização (ou, na exceção da NF, o contrato visível pela RLS).
-- Pergunta 2: a função é SECURITY INVOKER — roda com os privilégios de quem
-- chama, e a RLS de contracts/contract_addendums vale dentro dela. Mesmo assim
-- REVOKE de PUBLIC/anon e GRANT só para authenticated (as policies são TO
-- authenticated; anon nunca as avalia).
--
-- ORDEM: publicar o código ANTES desta migration. Entre a migration e o deploy,
-- upload de relatório/galeria pelo caminho antigo (sem org) seria recusado.
--
-- Pré-condição embutida: se o remoto tiver policy do bucket diferente do que as
-- migrations dizem, a transação aborta sem mudar nada — conferir à mão.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
--
-- VOLTA (se precisar):
--   DROP POLICY IF EXISTS "documents_select_org"         ON storage.objects;
--   DROP POLICY IF EXISTS "documents_insert_org"         ON storage.objects;
--   DROP POLICY IF EXISTS "documents_insert_nf_parceiro" ON storage.objects;
--   DROP POLICY IF EXISTS "documents_update_org"         ON storage.objects;
--   DROP POLICY IF EXISTS "documents_delete_org"         ON storage.objects;
--   DROP FUNCTION IF EXISTS public.documents_objeto_da_minha_org(text);
--   e recriar as 4 de 20260214000004_setup_storage.sql.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

-- ── 0. Pré-condição: o remoto é o que as migrations dizem ────────────────────
DO $pre$
DECLARE
    r record;
    v_esperado CONSTANT text := '(bucket_id=''documents''::text)';
BEGIN
    -- As 4 antigas, se ainda existirem, só podem conferir este bucket: o nome é
    -- genérico, e DROP de uma policy homônima de OUTRO bucket seria um estrago.
    FOR r IN
        SELECT policyname, qual, with_check
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname IN ('Public Access', 'Authenticated Upload',
                              'Authenticated Update', 'Authenticated Delete')
    LOOP
        IF COALESCE(regexp_replace(r.qual,       '\s', '', 'g'), v_esperado) <> v_esperado
        OR COALESCE(regexp_replace(r.with_check, '\s', '', 'g'), v_esperado) <> v_esperado THEN
            RAISE EXCEPTION 'storage.objects: policy "%" não é só do bucket documents (qual=%, with_check=%) — conferir à mão',
                r.policyname, r.qual, r.with_check;
        END IF;
    END LOOP;

    -- Nenhuma OUTRA policy pode cobrir o bucket — senão trocar as 4 não fecha nada.
    FOR r IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND (COALESCE(qual, '') ILIKE '%''documents''%' OR COALESCE(with_check, '') ILIKE '%''documents''%')
           AND policyname NOT IN ('Public Access', 'Authenticated Upload',
                                  'Authenticated Update', 'Authenticated Delete',
                                  'documents_select_org', 'documents_insert_org',
                                  'documents_insert_nf_parceiro',
                                  'documents_update_org', 'documents_delete_org')
    LOOP
        RAISE EXCEPTION 'storage.objects: policy "%" também cobre o bucket documents — conferir à mão', r.policyname;
    END LOOP;
END
$pre$;

-- ── 1. A organização dona do caminho é uma das minhas? ───────────────────────
-- plpgsql de propósito: cada cast para uuid só roda no ramo que já conferiu o
-- formato (num CASE/AND de SQL a ordem de avaliação não é garantida).
CREATE OR REPLACE FUNCTION public.documents_objeto_da_minha_org(p_name text)
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
    v_id     text   := v_pastas[2];
BEGIN
    IF v_raiz IS NULL THEN
        RETURN false;                                   -- arquivo solto na raiz
    END IF;

    IF v_raiz ~ c_uuid THEN                             -- <org>/…
        RETURN v_raiz::uuid IN (SELECT public.minhas_orgs_membro());
    END IF;

    IF v_raiz NOT IN ('contract-minutas', 'measurements', 'invoices',
                      'contract-addendums', 'reports', 'gallery')
       OR v_id IS NULL OR v_id !~ c_uuid THEN
        RETURN false;                                   -- layout desconhecido/antigo
    END IF;

    IF v_raiz IN ('reports', 'gallery') THEN            -- reports/<org>/…, gallery/<org>/…
        RETURN v_id::uuid IN (SELECT public.minhas_orgs_membro());
    END IF;

    IF v_raiz = 'contract-addendums' THEN               -- contract-addendums/<aditivo>/…
        RETURN EXISTS (
            SELECT 1
              FROM public.contract_addendums a
              JOIN public.contracts c ON c.id = a.contract_id
             WHERE a.id = v_id::uuid
               AND c.organization_id IN (SELECT public.minhas_orgs_membro())
        );
    END IF;

    -- contract-minutas/<contrato>/…, measurements/<contrato>/…, invoices/<contrato>/…
    RETURN EXISTS (
        SELECT 1
          FROM public.contracts c
         WHERE c.id = v_id::uuid
           AND c.organization_id IN (SELECT public.minhas_orgs_membro())
    );
END;
$fn$;

REVOKE ALL     ON FUNCTION public.documents_objeto_da_minha_org(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.documents_objeto_da_minha_org(text) TO authenticated;

-- ── 2. Sai o acesso só-por-bucket ────────────────────────────────────────────
DROP POLICY IF EXISTS "Public Access"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;

-- ── 3. Entra o acesso por organização ────────────────────────────────────────
-- SELECT: listar, createSignedUrl (aba Despesas do condomínio / relatório de
-- rateio assinam a minuta) e a metade de leitura de upsert e remove.
DROP POLICY IF EXISTS "documents_select_org" ON storage.objects;
CREATE POLICY "documents_select_org" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'documents' AND public.documents_objeto_da_minha_org(name));

DROP POLICY IF EXISTS "documents_insert_org" ON storage.objects;
CREATE POLICY "documents_insert_org" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'documents' AND public.documents_objeto_da_minha_org(name));

-- NF da medição pelo Portal do Parceiro (modo app). A subquery em `contracts`
-- roda sob a RLS de quem chama: só passa contrato que ele já enxerga.
DROP POLICY IF EXISTS "documents_insert_nf_parceiro" ON storage.objects;
CREATE POLICY "documents_insert_nf_parceiro" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(objects.name))[1] = 'invoices'
        AND CASE WHEN (storage.foldername(objects.name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                 THEN EXISTS (
                     SELECT 1 FROM public.contracts c
                      WHERE c.id = ((storage.foldername(objects.name))[2])::uuid
                 )
                 ELSE false END
    );

DROP POLICY IF EXISTS "documents_update_org" ON storage.objects;
CREATE POLICY "documents_update_org" ON storage.objects
    FOR UPDATE TO authenticated
    USING      (bucket_id = 'documents' AND public.documents_objeto_da_minha_org(name))
    WITH CHECK (bucket_id = 'documents' AND public.documents_objeto_da_minha_org(name));

DROP POLICY IF EXISTS "documents_delete_org" ON storage.objects;
CREATE POLICY "documents_delete_org" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'documents' AND public.documents_objeto_da_minha_org(name));

-- ── 4. Verificação embutida ──────────────────────────────────────────────────
DO $pos$
DECLARE
    v_n int;
BEGIN
    -- Só as 5 novas cobrem o bucket, e todas só para authenticated.
    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (COALESCE(qual, '') ILIKE '%''documents''%' OR COALESCE(with_check, '') ILIKE '%''documents''%')
       AND (policyname NOT IN ('documents_select_org', 'documents_insert_org',
                               'documents_insert_nf_parceiro',
                               'documents_update_org', 'documents_delete_org')
            OR roles <> '{authenticated}'::name[]);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'documents: % policy(ies) fora do conjunto esperado ou com papel diferente de authenticated', v_n;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('documents_select_org', 'documents_insert_org',
                          'documents_insert_nf_parceiro',
                          'documents_update_org', 'documents_delete_org');
    IF v_n <> 5 THEN
        RAISE EXCEPTION 'documents: esperadas 5 policies novas, há %', v_n;
    END IF;

    IF has_function_privilege('anon', 'public.documents_objeto_da_minha_org(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'documents_objeto_da_minha_org executável por anon';
    END IF;

    RAISE NOTICE 'documents OK: listagem anônima fechada; escrita, sobrescrita e exclusão só pela organização dona do caminho.';
    RAISE NOTICE 'ATENÇÃO: o bucket segue PÚBLICO — URL já emitida continua baixando sem login (privatizar é decisão à parte).';
END
$pos$;

COMMIT;
