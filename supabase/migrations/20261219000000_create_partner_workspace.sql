-- ============================================================
-- Migration: 20261219000000_create_partner_workspace.sql
-- MVP Partner Workspace: Hub de relacionamento com prestadores
-- ============================================================

-- ─── 1. TABELAS FÍSICAS DO PARCEIRO ──────────────────────────

-- Workspaces ativos para fornecedores
CREATE TABLE IF NOT EXISTS public.partner_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, supplier_id)
);

-- Triggers para updated_at em workspaces
CREATE OR REPLACE FUNCTION set_partner_workspaces_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS partner_workspaces_updated_at ON public.partner_workspaces;
CREATE TRIGGER partner_workspaces_updated_at
  BEFORE UPDATE ON public.partner_workspaces
  FOR EACH ROW EXECUTE FUNCTION set_partner_workspaces_updated_at();

-- Usuários externos vinculados ao workspace do parceiro
CREATE TABLE IF NOT EXISTS public.partner_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRADOR', 'GESTOR', 'FINANCEIRO', 'OPERACIONAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (partner_workspace_id, email)
);

DROP TRIGGER IF EXISTS partner_users_updated_at ON public.partner_users;
CREATE TRIGGER partner_users_updated_at
  BEFORE UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION set_partner_workspaces_updated_at();

-- Canais de conversas (chats)
CREATE TABLE IF NOT EXISTS public.partner_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mensagens do chat
CREATE TABLE IF NOT EXISTS public.partner_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.partner_conversations(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('INTERNAL', 'EXTERNAL')),
    message TEXT NOT NULL,
    attachments TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solicitações de prestadores
CREATE TABLE IF NOT EXISTS public.partner_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CONTRATO', 'TECNICA', 'FINANCEIRA', 'DOCUMENTACAO', 'ALTERACAO')),
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_ANALISE', 'RESPONDIDO', 'CONCLUIDO', 'ARQUIVADO')),
    priority TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('BAIXA', 'MEDIA', 'ALTA')),
    due_date TIMESTAMPTZ,
    assigned_to_email TEXT,
    created_by_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS partner_requests_updated_at ON public.partner_requests;
CREATE TRIGGER partner_requests_updated_at
  BEFORE UPDATE ON public.partner_requests
  FOR EACH ROW EXECUTE FUNCTION set_partner_workspaces_updated_at();

-- Tabela de compartilhamento de documentos originais
CREATE TABLE IF NOT EXISTS public.partner_shared_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_workspace_id UUID NOT NULL REFERENCES public.partner_workspaces(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.opura_documents(id) ON DELETE CASCADE,
    shared_by TEXT NOT NULL,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (partner_workspace_id, document_id)
);


-- ─── 2. HABILITAR ROW LEVEL SECURITY (RLS) ───────────────────

ALTER TABLE public.partner_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_shared_documents ENABLE ROW LEVEL SECURITY;


-- ─── 3. POLÍTICAS DE RLS PARA USUÁRIOS AUTENTICADOS ─────────

-- --- partner_workspaces ---
DROP POLICY IF EXISTS "workspaces_select_internal" ON public.partner_workspaces;
CREATE POLICY "workspaces_select_internal" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "workspaces_manage_internal" ON public.partner_workspaces;
CREATE POLICY "workspaces_manage_internal" ON public.partner_workspaces
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com')
    WITH CHECK (public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com');

DROP POLICY IF EXISTS "workspaces_select_external" ON public.partner_workspaces;
CREATE POLICY "workspaces_select_external" ON public.partner_workspaces
    FOR SELECT TO authenticated
    USING (id IN (
        SELECT partner_workspace_id FROM public.partner_users
        WHERE email = auth.jwt()->>'email' AND is_active = TRUE
    ));

-- --- partner_users ---
DROP POLICY IF EXISTS "partner_users_select" ON public.partner_users;
CREATE POLICY "partner_users_select" ON public.partner_users
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
        )
        OR email = auth.jwt()->>'email'
    );

DROP POLICY IF EXISTS "partner_users_manage" ON public.partner_users;
CREATE POLICY "partner_users_manage" ON public.partner_users
    FOR ALL TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
        )
    );

-- --- partner_conversations ---
DROP POLICY IF EXISTS "partner_conversations_select" ON public.partner_conversations;
CREATE POLICY "partner_conversations_select" ON public.partner_conversations
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
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
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

-- --- partner_messages ---
DROP POLICY IF EXISTS "partner_messages_select" ON public.partner_messages;
CREATE POLICY "partner_messages_select" ON public.partner_messages
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM public.partner_conversations
        )
    );

DROP POLICY IF EXISTS "partner_messages_insert" ON public.partner_messages;
CREATE POLICY "partner_messages_insert" ON public.partner_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.partner_conversations
        )
    );

-- --- partner_requests ---
DROP POLICY IF EXISTS "partner_requests_select" ON public.partner_requests;
CREATE POLICY "partner_requests_select" ON public.partner_requests
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
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
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
        )
        OR partner_workspace_id IN (
            SELECT partner_workspace_id FROM public.partner_users
            WHERE email = auth.jwt()->>'email' AND is_active = TRUE
        )
    );

-- --- partner_shared_documents ---
DROP POLICY IF EXISTS "shared_docs_select" ON public.partner_shared_documents;
CREATE POLICY "shared_docs_select" ON public.partner_shared_documents
    FOR SELECT TO authenticated
    USING (
        partner_workspace_id IN (
            SELECT id FROM public.partner_workspaces
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
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
            WHERE public.is_org_member(organization_id) OR auth.jwt()->>'email' = 'admin@admin.com'
        )
    );


-- ─── 4. EXTENSÕES DE RLS DE TABELAS CORE DO SISTEMA ──────────

-- Permitir que parceiros leiam documentos compartilhados em public.opura_documents
DROP POLICY IF EXISTS "docs_select_partner" ON public.opura_documents;
CREATE POLICY "docs_select_partner" ON public.opura_documents
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT document_id FROM public.partner_shared_documents psd
      JOIN public.partner_workspaces pw ON pw.id = psd.partner_workspace_id
      JOIN public.partner_users pu ON pu.partner_workspace_id = pw.id
      WHERE pu.email = auth.jwt() ->> 'email' AND pu.is_active = TRUE AND pw.is_active = TRUE
    )
  );

-- Permitir que parceiros baixem arquivos no storage.objects sob o bucket 'opura-docs'
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


-- ─── 5. REGRA 8: POLÍTICAS DE DEV (ANON) ─────────────────────

DROP POLICY IF EXISTS "Allow anon all on partner_workspaces" ON public.partner_workspaces;
CREATE POLICY "Allow anon all on partner_workspaces" ON public.partner_workspaces FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on partner_users" ON public.partner_users;
CREATE POLICY "Allow anon all on partner_users" ON public.partner_users FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on partner_conversations" ON public.partner_conversations;
CREATE POLICY "Allow anon all on partner_conversations" ON public.partner_conversations FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on partner_messages" ON public.partner_messages;
CREATE POLICY "Allow anon all on partner_messages" ON public.partner_messages FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on partner_requests" ON public.partner_requests;
CREATE POLICY "Allow anon all on partner_requests" ON public.partner_requests FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on partner_shared_documents" ON public.partner_shared_documents;
CREATE POLICY "Allow anon all on partner_shared_documents" ON public.partner_shared_documents FOR ALL TO anon USING (true) WITH CHECK (true);


-- ─── 6. REALTIME REGISTRATION ────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'partner_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_messages;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'partner_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_requests;
    END IF;
END $$;

