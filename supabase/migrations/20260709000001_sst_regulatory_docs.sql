-- ============================================================
-- SST Docs Regulatórios — PCMSO, PGR, NR-18/PCMAT
-- OrçaCloud SaaS · Migration 20260709000001
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sst_regulatory_docs (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      uuid         REFERENCES projects(id) ON DELETE SET NULL,
    tipo            text         NOT NULL CHECK (tipo IN ('PCMSO','PGR','NR18_PCMAT','PPRA')),
    titulo          text         NOT NULL,
    responsavel     text,
    responsavel_doc text,        -- CRM (médico) / CREA/CAU (engenheiro) / CPF
    vigencia_inicio date,
    vigencia_fim    date,
    data_revisao    date,        -- próxima revisão obrigatória
    status          text         NOT NULL DEFAULT 'VIGENTE'
                                 CHECK (status IN ('VIGENTE','REVISAO','VENCIDO','CANCELADO')),
    observacoes     text,
    documento_url   text,
    created_at      timestamptz  DEFAULT now(),
    updated_at      timestamptz  DEFAULT now()
);

ALTER TABLE public.sst_regulatory_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sst_reg_docs_select" ON public.sst_regulatory_docs
    FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "sst_reg_docs_insert" ON public.sst_regulatory_docs
    FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "sst_reg_docs_update" ON public.sst_regulatory_docs
    FOR UPDATE USING (is_org_member(org_id));

CREATE POLICY "sst_reg_docs_delete" ON public.sst_regulatory_docs
    FOR DELETE USING (is_org_member(org_id));

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_sst_reg_docs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER sst_reg_docs_updated_at
    BEFORE UPDATE ON public.sst_regulatory_docs
    FOR EACH ROW EXECUTE FUNCTION public.set_sst_reg_docs_updated_at();

-- Índice de busca por org + tipo
CREATE INDEX IF NOT EXISTS idx_sst_reg_docs_org_tipo
    ON public.sst_regulatory_docs (org_id, tipo);

CREATE INDEX IF NOT EXISTS idx_sst_reg_docs_project
    ON public.sst_regulatory_docs (project_id)
    WHERE project_id IS NOT NULL;
