-- Fase 4: Data Room de Oportunidades
-- Bucket privado + tabela de documentos com RLS por org
-- Date: 2026-11-07

-- ─── Bucket privado ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'opportunity-dataroom',
    'opportunity-dataroom',
    false,       -- privado: acesso apenas via signed URL
    52428800,    -- 50 MB por arquivo
    NULL         -- aceita todos os tipos
)
ON CONFLICT (id) DO NOTHING;

-- Admins da org fazem upload
CREATE POLICY "Admins can upload dataroom files" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'opportunity-dataroom'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

-- Membros da org lêem (necessário para gerar signed URL via API)
CREATE POLICY "Members can read dataroom files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'opportunity-dataroom'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email'
        )
    );

-- Admins deletam
CREATE POLICY "Admins can delete dataroom files" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'opportunity-dataroom'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

-- ─── Tabela opportunity_documents ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_documents (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id  uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,
    file_path       text NOT NULL,
    file_size       bigint,
    mime_type       text,
    category        text NOT NULL DEFAULT 'outro'
                    CHECK (category IN ('evte','sondagem','planta','matricula','financeiro','licenca','memorial','outro')),
    uploaded_by     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read documents" ON public.opportunity_documents
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    );

CREATE POLICY "Admins can manage documents" ON public.opportunity_documents
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE email = auth.jwt()->>'email' AND role IN ('owner', 'admin')
        )
    );

CREATE INDEX IF NOT EXISTS idx_opp_docs_org  ON public.opportunity_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_docs_opp  ON public.opportunity_documents(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_docs_cat  ON public.opportunity_documents(category);
