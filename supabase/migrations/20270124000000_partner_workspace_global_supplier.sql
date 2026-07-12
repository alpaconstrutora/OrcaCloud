-- ==========================================================================
-- Migration: permite Portal do Parceiro para fornecedor global
-- ("Todas as Organizações"), sem exigir organização específica.
--
-- Espelha o mesmo conceito já existente em suppliers.organization_id
-- (NULL = fornecedor visível/compartilhado por todas as organizações).
-- Toca em cascata: partner_workspaces, partner_users (organization_id
-- é desnormalizado a partir do workspace via trigger), e as policies de
-- RLS de partner_conversations/partner_requests/partner_shared_documents
-- que filtram por is_org_member(partner_workspaces.organization_id).
-- Também corrige storage_docs_select_partner, que comparava
-- pw.organization_id com o primeiro segmento do path no storage --
-- documentos em si nunca são globais (sempre pertencem a UMA org), então
-- essa comparação sempre falharia para um workspace global. Trocado por
-- checagem direta contra o storage_path das versões do documento
-- compartilhado (mais preciso que o prefixo de pasta, e correto nos dois
-- casos: workspace com ou sem organização).
-- ==========================================================================

-- ── 1. Tornar organization_id opcional em partner_workspaces e partner_users ──

ALTER TABLE public.partner_workspaces ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.partner_users ALTER COLUMN organization_id DROP NOT NULL;

-- Evita dois workspaces globais para o mesmo fornecedor (a UNIQUE(organization_id, supplier_id)
-- existente não pega esse caso: Postgres trata cada NULL como distinto por padrão).
CREATE UNIQUE INDEX IF NOT EXISTS partner_workspaces_global_supplier_uidx
  ON public.partner_workspaces (supplier_id) WHERE organization_id IS NULL;

-- ── 2. Trigger de partner_users: não força mais organization_id não-nulo ──
-- (o corpo já tolera NULL vindo do workspace; só a coluna estava bloqueando)

-- ── 3. Policies: liberar também organization_id IS NULL ──────────────────

DROP POLICY IF EXISTS "workspaces_select_internal" ON public.partner_workspaces;
CREATE POLICY "workspaces_select_internal" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (organization_id IS NULL OR public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "workspaces_manage_internal" ON public.partner_workspaces;
CREATE POLICY "workspaces_manage_internal" ON public.partner_workspaces
    FOR ALL TO authenticated
    USING (organization_id IS NULL OR public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "partner_users_select" ON public.partner_users;
CREATE POLICY "partner_users_select" ON public.partner_users
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL
        OR public.is_org_member(organization_id)
        OR email = auth.jwt()->>'email'
    );

DROP POLICY IF EXISTS "partner_users_manage" ON public.partner_users;
CREATE POLICY "partner_users_manage" ON public.partner_users
    FOR ALL TO authenticated
    USING (
        organization_id IS NULL
        OR public.is_org_member(organization_id)
    );

DROP POLICY IF EXISTS "partner_conversations_select" ON public.partner_conversations;
CREATE POLICY "partner_conversations_select" ON public.partner_conversations
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "partner_conversations_manage" ON public.partner_conversations;
CREATE POLICY "partner_conversations_manage" ON public.partner_conversations
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "partner_requests_select" ON public.partner_requests;
CREATE POLICY "partner_requests_select" ON public.partner_requests
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "partner_requests_manage" ON public.partner_requests;
CREATE POLICY "partner_requests_manage" ON public.partner_requests
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "shared_docs_select" ON public.partner_shared_documents;
CREATE POLICY "shared_docs_select" ON public.partner_shared_documents
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "shared_docs_manage" ON public.partner_shared_documents;
CREATE POLICY "shared_docs_manage" ON public.partner_shared_documents
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE organization_id IS NULL OR public.is_org_member(organization_id)
        )
    );

-- ── 4. storage_docs_select_partner: trocar comparação de org por comparação
-- direta de storage_path das versões do documento compartilhado ──────────

DROP POLICY IF EXISTS "storage_docs_select_partner" ON storage.objects;
CREATE POLICY "storage_docs_select_partner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND EXISTS (
      SELECT 1 FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      JOIN public.opura_document_versions v ON v.document_id = psd.document_id
      WHERE pu.email = auth.jwt() ->> 'email'
        AND pu.is_active = TRUE
        AND pw.is_active = TRUE
        AND v.storage_path = name
    )
  );

-- ── 5. partner_portal_generate_token: aceitar workspace global ───────────
-- (o token em si continua com org_id NOT NULL -- é sobre quem administra o
-- link, não sobre o escopo de dados do workspace)

CREATE OR REPLACE FUNCTION public.partner_portal_generate_token(
    p_workspace_id UUID,
    p_org_id       UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $X$
DECLARE
    v_token TEXT := gen_random_uuid()::text;
BEGIN
    IF NOT public.partner_portal_can_manage_tokens(p_org_id) THEN
        RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.partner_workspaces pw
        WHERE pw.id = p_workspace_id AND (pw.organization_id = p_org_id OR pw.organization_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'workspace_not_found_for_org' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.partner_portal_tokens (org_id, workspace_id, token)
    VALUES (p_org_id, p_workspace_id, v_token)
    ON CONFLICT (workspace_id) DO UPDATE
        SET org_id       = p_org_id,
            token        = v_token,
            expires_at   = NOW() + INTERVAL '90 days',
            is_active    = TRUE,
            last_used_at = NULL,
            created_at   = NOW();

    RETURN v_token;
END;
$X$;

REVOKE EXECUTE ON FUNCTION public.partner_portal_generate_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_portal_generate_token(UUID, UUID) TO authenticated;
