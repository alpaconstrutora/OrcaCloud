-- ============================================================
-- Migration: 20270208000001_opura_docs_drop_anon_policies.sql
-- SEGURANÇA (risco #1 da avaliação do ÒPURA Docs): remove as políticas
-- "Regra 8 / Dev" `TO anon USING (true) WITH CHECK (true)` das tabelas do
-- GED e do bucket de storage. Essas policies davam acesso TOTAL (SELECT/
-- INSERT/UPDATE/DELETE) ao papel `anon` — cuja chave é pública no bundle
-- do front — SEM filtro de organização, permitindo leitura/escrita
-- cross-tenant de todos os documentos por qualquer um com a anon key.
--
-- Por que é seguro remover (verificado):
--   • App real é autenticado (login Supabase) → tráfego usa role
--     `authenticated`, coberto pelas policies *_select_org / *_write_org.
--   • Validador público por QR (PublicPlantChecker) usa a RPC
--     fn_get_document_status_public, que é SECURITY DEFINER + GRANT a anon
--     → NÃO depende de policy anon nas tabelas.
--   • Portal do Parceiro usa Edge Functions com service_role → idem.
--   • Única perda: rodar o app em dev SEM login (decisão: não manter).
--
-- Escopo: apenas o módulo Docs. As demais policies anon do repo (projects,
-- contracts, empreendimentos, etc.) ficam para um rollout módulo a módulo.
--
-- Idempotente: DROP POLICY IF EXISTS. As tabelas mantêm RLS habilitado e
-- as policies `authenticated` org-scoped intactas.
-- ============================================================

-- ─── Tabelas do GED ──────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon all on opura_documents"            ON public.opura_documents;
DROP POLICY IF EXISTS "Allow anon all on opura_document_versions"    ON public.opura_document_versions;
DROP POLICY IF EXISTS "Allow anon all on opura_folders"              ON public.opura_folders;
DROP POLICY IF EXISTS "Allow anon all on opura_dms_disciplines"      ON public.opura_dms_disciplines;
DROP POLICY IF EXISTS "Allow anon all on opura_dms_naming_patterns"  ON public.opura_dms_naming_patterns;
DROP POLICY IF EXISTS "Allow anon all on opura_dms_document_types"   ON public.opura_dms_document_types;
DROP POLICY IF EXISTS "Allow anon all on opura_document_approvals"   ON public.opura_document_approvals;
DROP POLICY IF EXISTS "Allow anon all on opura_document_markups"     ON public.opura_document_markups;

-- ─── Storage: bucket opura-docs ──────────────────────────────
-- Mantém as policies de storage `authenticated` (storage_docs_select/insert/delete),
-- que filtram por (storage.foldername(name))[1] = organization_id do membro.
DROP POLICY IF EXISTS "Allow anon select on opura_docs_bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon insert on opura_docs_bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete on opura_docs_bucket" ON storage.objects;

-- Nota: opura_document_audit_logs nunca teve policy anon (só authenticated
-- org-scoped), portanto não há nada a remover lá.
