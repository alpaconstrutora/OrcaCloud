-- =============================================================================
-- Comercial de Serviços — Sub-status no card + configuração de pipeline por org
-- =============================================================================
-- Inspirado em CRMs de funil (sub-estágio visível no card + engrenagem por coluna).
--
-- Decisões:
--   * Os 6 estágios canônicos (lead/visit/budget/proposal/won/lost) permanecem
--     como MOTOR — deles dependem o gating das sub-telas, NEXT_STAGES e o trigger
--     de conversão em 'won'/'lost'. Não os tornamos dinâmicos.
--   * A "engrenagem" personaliza APENAS apresentação por organização: rótulo, cor
--     e a lista de sub-status (presets) de cada estágio canônico.
--   * sub_status é texto livre na oportunidade; os presets só alimentam o seletor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sub-status na oportunidade (etapa dentro do estágio, ex: "1º contato")
-- ---------------------------------------------------------------------------
ALTER TABLE public.services_opportunities
    ADD COLUMN IF NOT EXISTS sub_status TEXT;

-- ---------------------------------------------------------------------------
-- 2. Configuração de pipeline por organização (1 linha por estágio canônico)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Estágio canônico que esta config personaliza
    stage TEXT NOT NULL
        CHECK (stage IN ('lead', 'visit', 'budget', 'proposal', 'won', 'lost')),

    label TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6b7280',      -- hex
    position INTEGER NOT NULL DEFAULT 0,         -- ordem de exibição
    sub_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["1º contato","Em análise",...]

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (organization_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_services_pipeline_stages_org
    ON public.services_pipeline_stages (organization_id, position);

-- updated_at automático (reusa a função do módulo services_*)
DROP TRIGGER IF EXISTS trg_services_pipeline_stages_updated_at ON public.services_pipeline_stages;
CREATE TRIGGER trg_services_pipeline_stages_updated_at
    BEFORE UPDATE ON public.services_pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION public.tg_services_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — mesma política de org dos demais services_* (helper is_org_member)
-- ---------------------------------------------------------------------------
ALTER TABLE public.services_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_all" ON public.services_pipeline_stages;
CREATE POLICY "org_members_all" ON public.services_pipeline_stages
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
