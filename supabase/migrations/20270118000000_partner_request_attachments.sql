-- ============================================================
-- Migration: 20270118000000_partner_request_attachments.sql
-- Onda 5 do Portal do Parceiro: permitir que o parceiro anexe
-- arquivos às suas solicitações (fluxo reverso de documentos).
-- ============================================================

-- ─── 1. COLUNA DE ANEXOS EM partner_requests ─────────────────

ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS attachment_paths TEXT[] NOT NULL DEFAULT '{}'::text[];

-- ─── 2. RLS DE STORAGE PARA UPLOADS DO PARCEIRO ──────────────
-- Prefixo isolado da árvore normal de documentos (org-uuid/...):
-- "partner-uploads/{workspace-uuid}/{arquivo}". Mantém o parceiro
-- restrito a essa área e não concede acesso à árvore de documentos
-- oficiais (essa continua exclusiva de partner_shared_documents).

DROP POLICY IF EXISTS "storage_docs_insert_partner" ON storage.objects;
CREATE POLICY "storage_docs_insert_partner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'opura-docs'
    AND (storage.foldername(name))[1] = 'partner-uploads'
    AND (storage.foldername(name))[2] IN (
      SELECT partner_workspace_id::text FROM public.partner_users
      WHERE email = auth.jwt() ->> 'email' AND is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "storage_docs_select_partner_uploads" ON storage.objects;
CREATE POLICY "storage_docs_select_partner_uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND (storage.foldername(name))[1] = 'partner-uploads'
    AND (
      (storage.foldername(name))[2] IN (
        SELECT partner_workspace_id::text FROM public.partner_users
        WHERE email = auth.jwt() ->> 'email' AND is_active = TRUE
      )
      OR (storage.foldername(name))[2] IN (
        SELECT pw.id::text FROM public.partner_workspaces pw
        WHERE public.is_org_member(pw.organization_id) OR auth.jwt() ->> 'email' = 'admin@admin.com'
      )
    )
  );
