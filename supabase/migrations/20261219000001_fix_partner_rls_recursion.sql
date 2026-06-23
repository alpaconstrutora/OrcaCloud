-- ============================================================
-- Migration: 20261219000001_fix_partner_rls_recursion.sql
-- Correção de recursão infinita nas políticas RLS do Partner Workspace
-- ============================================================

-- ── 1. FUNÇÕES AUXILIARES COM SECURITY DEFINER ───────────────

-- Retorna os ids de workspaces vinculados ao e-mail de um parceiro externo
CREATE OR REPLACE FUNCTION public.get_user_partner_workspaces(user_email text)
RETURNS TABLE (partner_workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF user_email IS NULL OR user_email = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT pu.partner_workspace_id 
    FROM public.partner_users pu
    WHERE pu.email = user_email AND pu.is_active = TRUE;
END;
$$;

-- Retorna os ids de workspaces que o usuário (interno da construtora) tem acesso como membro
CREATE OR REPLACE FUNCTION public.get_workspaces_for_member(user_email text)
RETURNS TABLE (workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF user_email IS NULL OR user_email = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT pw.id FROM public.partner_workspaces pw
    WHERE pw.organization_id IN (
        SELECT om.organization_id FROM public.organization_members om
        WHERE om.email = user_email
    );
END;
$$;


-- ── 2. ATUALIZAR POLÍTICAS PARA partner_workspaces ───────────

DROP POLICY IF EXISTS "workspaces_select_internal" ON public.partner_workspaces;
DROP POLICY IF EXISTS "workspaces_manage_internal" ON public.partner_workspaces;
DROP POLICY IF EXISTS "workspaces_select_external" ON public.partner_workspaces;

CREATE POLICY "workspaces_select_internal" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "workspaces_manage_internal" ON public.partner_workspaces
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

CREATE POLICY "workspaces_select_external" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (id IN (
        SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
    ));


-- ── 3. ATUALIZAR POLÍTICAS PARA partner_users ────────────────

DROP POLICY IF EXISTS "partner_users_select" ON public.partner_users;
DROP POLICY IF EXISTS "partner_users_manage" ON public.partner_users;

CREATE POLICY "partner_users_select" ON public.partner_users
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR email = auth.jwt()->>'email'
    );

CREATE POLICY "partner_users_manage" ON public.partner_users
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
    );


-- ── 4. ATUALIZAR POLÍTICAS PARA partner_conversations ────────

DROP POLICY IF EXISTS "partner_conversations_select" ON public.partner_conversations;
DROP POLICY IF EXISTS "partner_conversations_manage" ON public.partner_conversations;

CREATE POLICY "partner_conversations_select" ON public.partner_conversations
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
        )
    );

CREATE POLICY "partner_conversations_manage" ON public.partner_conversations
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
        )
    );


-- ── 5. ATUALIZAR POLÍTICAS PARA partner_requests ─────────────

DROP POLICY IF EXISTS "partner_requests_select" ON public.partner_requests;
DROP POLICY IF EXISTS "partner_requests_manage" ON public.partner_requests;

CREATE POLICY "partner_requests_select" ON public.partner_requests
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
        )
    );

CREATE POLICY "partner_requests_manage" ON public.partner_requests
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
        )
    );


-- ── 6. ATUALIZAR POLÍTICAS PARA partner_shared_documents ─────

DROP POLICY IF EXISTS "shared_docs_select" ON public.partner_shared_documents;
DROP POLICY IF EXISTS "shared_docs_manage" ON public.partner_shared_documents;

CREATE POLICY "shared_docs_select" ON public.partner_shared_documents
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
        OR partner_workspace_id IN (
            SELECT public.get_user_partner_workspaces(auth.jwt()->>'email')
        )
    );

CREATE POLICY "shared_docs_manage" ON public.partner_shared_documents
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT public.get_workspaces_for_member(auth.jwt()->>'email')
        )
    );


-- ── 7. ATUALIZAR POLÍTICAS EXTENDIDAS DE DOCUMENTOS ──────────

DROP POLICY IF EXISTS "docs_select_partner" ON public.opura_documents;
CREATE POLICY "docs_select_partner" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT psd.document_id FROM public.partner_shared_documents psd
      WHERE psd.partner_workspace_id IN (
        SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email')
      )
    )
  );

DROP POLICY IF EXISTS "storage_docs_select_partner" ON storage.objects;
CREATE POLICY "storage_docs_select_partner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND EXISTS (
      SELECT 1 FROM public.partner_shared_documents psd
      WHERE psd.partner_workspace_id IN (
        SELECT public.get_user_partner_workspaces(auth.jwt() ->> 'email')
      )
    )
  );
