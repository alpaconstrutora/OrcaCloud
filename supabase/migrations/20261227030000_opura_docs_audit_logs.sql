CREATE TABLE IF NOT EXISTS public.opura_document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.opura_documents(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.opura_document_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Users can view audit logs of their organization" ON public.opura_document_audit_logs;
CREATE POLICY "Users can view audit logs of their organization"
    ON public.opura_document_audit_logs
    FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can insert audit logs of their organization" ON public.opura_document_audit_logs;
CREATE POLICY "Users can insert audit logs of their organization"
    ON public.opura_document_audit_logs
    FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

-- Índice para melhoria de performance na busca de logs por documento
CREATE INDEX IF NOT EXISTS idx_opura_doc_audit_logs_doc_id 
    ON public.opura_document_audit_logs(document_id);
