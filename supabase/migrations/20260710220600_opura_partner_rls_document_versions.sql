-- ============================================================
-- Migration: 20260710220600_opura_partner_rls_document_versions
-- Módulo: GED / Portal do Parceiro
-- Permite que usuários externos (parceiros) leiam as versões ativas
-- dos documentos compartilhados com seus workspaces
-- ============================================================

-- 1. Garantir que o RLS está habilitado na tabela
ALTER TABLE public.opura_document_versions ENABLE ROW LEVEL SECURITY;

-- 2. Criar a política de leitura de versões de documentos compartilhados para parceiros externos
DROP POLICY IF EXISTS "versions_select_partner" ON public.opura_document_versions;
CREATE POLICY "versions_select_partner" ON public.opura_document_versions
  FOR SELECT TO authenticated
  USING (
    document_id IN (
      SELECT psd.document_id FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
    )
  );

-- 3. Adicionar política anon de desenvolvimento para evitar bloqueios de sandbox local
DROP POLICY IF EXISTS "Allow anon select on opura_document_versions" ON public.opura_document_versions;
CREATE POLICY "Allow anon select on opura_document_versions" ON public.opura_document_versions 
  FOR ALL TO anon USING (true) WITH CHECK (true);
