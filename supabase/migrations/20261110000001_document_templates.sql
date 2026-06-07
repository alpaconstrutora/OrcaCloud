-- Modelos de documento (.docx) para emissão de contratos de serviço
-- Upload de .docx com marcadores {001},{002}… mapeados para campos do sistema
-- Date: 2026-11-10

-- ─── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    file_path       TEXT NOT NULL,              -- caminho do .docx no bucket document-templates
    file_name       TEXT,                       -- nome original do arquivo
    detected_tokens TEXT[] NOT NULL DEFAULT '{}',-- marcadores achados no .docx: ['001','002',...]
    token_map       JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "001": { "source": "client", "field": "address", "label": "...", "fixed": null } }
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_org
    ON public.document_templates(organization_id) WHERE is_active;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_templates_select ON public.document_templates;
DROP POLICY IF EXISTS document_templates_insert ON public.document_templates;
DROP POLICY IF EXISTS document_templates_update ON public.document_templates;
DROP POLICY IF EXISTS document_templates_delete ON public.document_templates;

CREATE POLICY document_templates_select ON public.document_templates
    FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY document_templates_insert ON public.document_templates
    FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY document_templates_update ON public.document_templates
    FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY document_templates_delete ON public.document_templates
    FOR DELETE USING (public.is_org_member(organization_id));

-- ─── Bucket privado ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'document-templates',
    'document-templates',
    false,       -- privado: acesso via signed URL / download autenticado
    26214400,    -- 25 MB por arquivo
    ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Membros da org leem/baixam os modelos da própria org (primeira pasta = organization_id)
DROP POLICY IF EXISTS "Org members read document templates" ON storage.objects;
CREATE POLICY "Org members read document templates" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members upload document templates" ON storage.objects;
CREATE POLICY "Org members upload document templates" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members update document templates" ON storage.objects;
CREATE POLICY "Org members update document templates" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Org members delete document templates" ON storage.objects;
CREATE POLICY "Org members delete document templates" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );
