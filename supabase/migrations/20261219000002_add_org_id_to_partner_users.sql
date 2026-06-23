-- ============================================================
-- Migration: 20261219000002_add_org_id_to_partner_users.sql
-- Desnormalização de organization_id em partner_users para eliminar recursão de RLS
-- ============================================================

-- ── 1. ADICIONAR COLUNA organization_id EM partner_users ─────

ALTER TABLE public.partner_users ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Alimentar a coluna organization_id com base nos workspaces existentes
UPDATE public.partner_users pu
SET organization_id = pw.organization_id
FROM public.partner_workspaces pw
WHERE pu.partner_workspace_id = pw.id
  AND pu.organization_id IS NULL;

-- Para novos registros, preencher se o backend não passar
CREATE OR REPLACE FUNCTION public.set_partner_user_organization_id()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id
        FROM public.partner_workspaces
        WHERE id = NEW.partner_workspace_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_user_organization_id_trigger ON public.partner_users;
CREATE TRIGGER partner_user_organization_id_trigger
  BEFORE INSERT ON public.partner_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_partner_user_organization_id();

-- Garantir FK e NOT NULL após alimentar dados
ALTER TABLE public.partner_users 
  ALTER COLUMN organization_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS partner_users_organization_id_fkey,
  ADD CONSTRAINT partner_users_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ── 2. CRIAR POLÍTICAS DE DEV (ANON) PARA A NOVA COLUNA ──────

DROP POLICY IF EXISTS "Allow anon all on partner_users" ON public.partner_users;
CREATE POLICY "Allow anon all on partner_users" ON public.partner_users FOR ALL TO anon USING (true) WITH CHECK (true);


-- ── 3. ATUALIZAR POLÍTICAS DE RLS PARA EVITAR RECURSÃO ────────

-- --- partner_users ---
DROP POLICY IF EXISTS "partner_users_select" ON public.partner_users;
DROP POLICY IF EXISTS "partner_users_manage" ON public.partner_users;

CREATE POLICY "partner_users_select" ON public.partner_users
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR email = auth.jwt()->>'email'
    );

CREATE POLICY "partner_users_manage" ON public.partner_users
    FOR ALL TO authenticated
    USING (
        public.is_org_member(organization_id)
    );

-- --- partner_workspaces ---
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
        SELECT partner_workspace_id FROM public.partner_users
        WHERE email = auth.jwt()->>'email' AND is_active = TRUE
    ));

-- --- partner_conversations ---
DROP POLICY IF EXISTS "partner_conversations_select" ON public.partner_conversations;
DROP POLICY IF EXISTS "partner_conversations_manage" ON public.partner_conversations;

CREATE POLICY "partner_conversations_select" ON public.partner_conversations
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

CREATE POLICY "partner_conversations_manage" ON public.partner_conversations
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

-- --- partner_requests ---
DROP POLICY IF EXISTS "partner_requests_select" ON public.partner_requests;
DROP POLICY IF EXISTS "partner_requests_manage" ON public.partner_requests;

CREATE POLICY "partner_requests_select" ON public.partner_requests
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

CREATE POLICY "partner_requests_manage" ON public.partner_requests
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

-- --- partner_shared_documents ---
DROP POLICY IF EXISTS "shared_docs_select" ON public.partner_shared_documents;
DROP POLICY IF EXISTS "shared_docs_manage" ON public.partner_shared_documents;

CREATE POLICY "shared_docs_select" ON public.partner_shared_documents
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

CREATE POLICY "shared_docs_manage" ON public.partner_shared_documents
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id)
        )
    );

-- --- opura_documents (Extensões) ---
DROP POLICY IF EXISTS "docs_select_partner" ON public.opura_documents;
CREATE POLICY "docs_select_partner" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT psd.document_id FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
    )
  );

-- --- storage.objects (Extensões) ---
DROP POLICY IF EXISTS "storage_docs_select_partner" ON storage.objects;
CREATE POLICY "storage_docs_select_partner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'opura-docs'
    AND EXISTS (
      SELECT 1 FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email'
        AND pu.is_active = TRUE
        AND pw.is_active = TRUE
        AND pw.organization_id::text = (storage.foldername(name))[1]
    )
  );
