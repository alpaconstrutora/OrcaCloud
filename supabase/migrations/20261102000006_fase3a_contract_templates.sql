-- =============================================================================
-- Fase 3a — Templates de Contrato com variáveis {{}}
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS contract_template_seq START 1;

CREATE TABLE IF NOT EXISTS public.contract_templates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    description      TEXT,
    contract_type    TEXT,
    body_html        TEXT NOT NULL DEFAULT '',   -- conteúdo com {{VARIAVEL}} substituível
    variables        JSONB DEFAULT '[]'::jsonb,  -- lista de chaves reconhecidas
    version          INTEGER NOT NULL DEFAULT 1,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_template_clauses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  UUID NOT NULL REFERENCES public.contract_templates(id) ON DELETE CASCADE,
    org_id       UUID NOT NULL,
    title        TEXT NOT NULL,
    body_html    TEXT NOT NULL DEFAULT '',
    order_index  INTEGER NOT NULL DEFAULT 0,
    is_optional  BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_org    ON public.contract_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_contract_clauses_template ON public.contract_template_clauses(template_id);

CREATE OR REPLACE FUNCTION public.tg_contract_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_contract_templates_updated_at ON public.contract_templates;
CREATE TRIGGER trg_contract_templates_updated_at
    BEFORE UPDATE ON public.contract_templates
    FOR EACH ROW EXECUTE FUNCTION public.tg_contract_templates_updated_at();

ALTER TABLE public.contract_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_template_clauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_templates_org ON public.contract_templates
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY contract_template_clauses_org ON public.contract_template_clauses
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- Coluna de rastreio: qual template gerou este contrato
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL;
