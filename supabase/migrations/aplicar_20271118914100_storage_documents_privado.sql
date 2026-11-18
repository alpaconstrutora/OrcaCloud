-- ============================================================================
-- Migration: aplicar_20271118914100_storage_documents_privado.sql
-- SEGURANÇA (F8, parte 2) — bucket `documents` PRIVADO
--
-- PROBLEMA
-- A aplicar_20271116900800 (F8, no ar) trocou as policies do bucket por policies
-- por organização do caminho (`documents_objeto_da_minha_org`), mas o bucket
-- continuou `public = true`: download por /storage/v1/object/public/documents/…
-- não passa por RLS. Quem tinha o caminho — URL gravada em coluna, vazada em
-- print, e-mail, histórico do navegador — baixava minuta de contrato (nome,
-- CPF/CNPJ, valores), aditivo, NF de medição e relatório de investidor sem
-- login. Conferido em 18/11: HEAD na URL pública de uma minuta → 200.
--
-- O QUE MUDA
-- `UPDATE storage.buckets SET public = false WHERE id = 'documents'`. Mais nada:
-- as policies do F8 já estão no ar e são elas que passam a valer para TODO
-- acesso (URL assinada pela sessão do membro). Portais assinam pela Edge
-- Function `portal-documentos-download` (service_role, depois de conferir o
-- registro na mesma RPC do portal).
--
-- ORDEM — esta migration é a ÚLTIMA (não inverter):
--   1. Merge do PR (todo leitor do app passa a assinar na hora; escritores gravam
--      o caminho em vez da URL pública).
--   2. Deploy das Edge Functions `portal-documentos-download` (nova) e
--      `partner-portal-upload` (devolve o caminho):
--        npx supabase functions deploy portal-documentos-download partner-portal-upload --project-ref oxedkknreghxrgenyjiu
--   3. (organization-assets) script de dados + aplicar_20271118914000.
--   4. ESTA migration.
-- Aplicada antes do passo 1: todo link de contrato, minuta, NF, relatório e
-- galeria do investidor dá 400 no app e nos portais (o front antigo usa a URL
-- pública gravada). Antes do passo 2: o app interno funciona, mas os portais
-- (Cliente, Parceiro, Investidor) não abrem mais nenhum documento do bucket.
--
-- O que deixa de abrir de propósito (18/11/2026, leitura): objetos de layout que
-- a policy do F8 não reconhece — ficam só para a service_role:
--   client-docs/<cliente>/…   5 (legado; referenciados em clients.client_documents,
--                                 que nenhuma tela abre como link)
--   reports/<arquivo> na raiz 3 (testes de fev/2026, sem referência no banco)
--   measurements/… (8) e invoices/… (1) de um id que não é contrato: 9 (órfãos de fev/2026)
--   → 17 de 39 objetos; os 22 restantes têm dono pelo caminho (18 de contrato, 4 de org)
-- URLs públicas gravadas no banco (o leitor extrai o caminho e assina):
--   contract_document_versions.url 12 · contracts.minuta_versions 2 ·
--   contracts.signed_contract_url 2 · investor_reports.url 2 · clients.client_documents 1
--
-- REGRA #7: sem policy nem função nova.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
--
-- COMO CONFERIR (depois de aplicar)
--   SELECT public FROM storage.buckets WHERE id = 'documents';   -- false
--   De fora, a mesma URL pública que dava 200:
--     curl -sI "<SUPABASE_URL>/storage/v1/object/public/documents/<caminho>"   → 400
--   No app: Contrato › Emissão › abrir versão; Medição › Ver NF; Investidor ›
--   Relatórios › Baixar. Nos portais: Cliente › contrato › versão da minuta;
--   Parceiro › Contratos › Ver PDF e Financeiro › Ver nota; Investidor › Documentos.
--
-- VOLTA (se precisar): UPDATE storage.buckets SET public = true WHERE id = 'documents';
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

-- ── 0. Pré-condição: as policies do F8 estão no ar ───────────────────────────
-- Sem elas, privatizar deixaria o membro sem conseguir assinar nada.
DO $pre$
DECLARE
    v_n int;
BEGIN
    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('documents_select_org', 'documents_insert_org',
                          'documents_insert_nf_parceiro',
                          'documents_update_org', 'documents_delete_org')
       AND roles = '{authenticated}'::name[];
    IF v_n <> 5 THEN
        RAISE EXCEPTION 'documents: esperadas as 5 policies do F8 (aplicar_20271116900800), há % — aplicar aquela antes', v_n;
    END IF;

    -- Nenhuma policy de leitura para anon/public no bucket.
    SELECT count(*) INTO v_n
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (COALESCE(qual, '') ILIKE '%''documents''%' OR COALESCE(with_check, '') ILIKE '%''documents''%')
       AND roles <> '{authenticated}'::name[];
    IF v_n > 0 THEN
        RAISE EXCEPTION 'documents: % policy(ies) para papel diferente de authenticated — conferir à mão', v_n;
    END IF;
END
$pre$;

-- ── 1. Bucket privado ────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ── 2. Verificação embutida ──────────────────────────────────────────────────
DO $pos$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents' AND public = false) THEN
        RAISE EXCEPTION 'documents: o bucket não ficou privado';
    END IF;
    RAISE NOTICE 'documents OK: privado — URL pública antiga dá 400; leitura só por URL assinada.';
END
$pos$;

COMMIT;
