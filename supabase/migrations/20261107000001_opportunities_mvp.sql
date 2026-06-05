-- MVP Oportunidades: enriquecer investor_opportunities + criar opportunity_interests
-- Date: 2026-11-07

-- ─── Enriquecer investor_opportunities ───────────────────────────────────────
-- projected_yield (text) mantido para retrocompatibilidade; campos numéricos ao lado

ALTER TABLE public.investor_opportunities
    ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'estudo'
                                                CHECK (status IN ('estudo','viabilidade','lancamento','captacao','encerrada')),
    ADD COLUMN IF NOT EXISTS opportunity_type   text
                                                CHECK (opportunity_type IN ('incorporacao','loteamento','obra_privada','obra_publica')),
    ADD COLUMN IF NOT EXISTS location_city      text,
    ADD COLUMN IF NOT EXISTS location_state     text,
    ADD COLUMN IF NOT EXISTS thumbnail_url      text,
    ADD COLUMN IF NOT EXISTS land_area_m2       numeric,
    ADD COLUMN IF NOT EXISTS built_area_m2      numeric,
    ADD COLUMN IF NOT EXISTS floors             integer,
    ADD COLUMN IF NOT EXISTS vgv                numeric,
    ADD COLUMN IF NOT EXISTS roi_pct            numeric,
    ADD COLUMN IF NOT EXISTS tir_pct            numeric,
    ADD COLUMN IF NOT EXISTS cost_estimate      numeric,
    ADD COLUMN IF NOT EXISTS cost_per_m2        numeric,
    ADD COLUMN IF NOT EXISTS ticket_min         numeric,
    ADD COLUMN IF NOT EXISTS expected_start     date,
    ADD COLUMN IF NOT EXISTS project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_published       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_investor_opps_project ON public.investor_opportunities(project_id);

-- ─── opportunity_interests ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.opportunity_interests (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    opportunity_id      uuid NOT NULL REFERENCES public.investor_opportunities(id) ON DELETE CASCADE,
    contact_name        text NOT NULL,
    contact_email       text,
    contact_phone       text,
    role                text NOT NULL DEFAULT 'investidor'
                        CHECK (role IN ('investidor','arquiteto','engenheiro','projetista','consultor','outro')),
    message             text,
    stage               text NOT NULL DEFAULT 'lead'
                        CHECK (stage IN ('lead','interesse','reuniao','proposta','negociacao','fechado')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_interests ENABLE ROW LEVEL SECURITY;

-- Qualquer membro autenticado pode registrar interesse
CREATE POLICY "Authenticated can insert interest" ON public.opportunity_interests
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
        )
    );

-- Admins lêem e gerenciam tudo da org
CREATE POLICY "Admins can manage interests" ON public.opportunity_interests
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

CREATE INDEX IF NOT EXISTS idx_opp_interests_org       ON public.opportunity_interests(organization_id);
CREATE INDEX IF NOT EXISTS idx_opp_interests_opp       ON public.opportunity_interests(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_interests_stage     ON public.opportunity_interests(stage);
CREATE INDEX IF NOT EXISTS idx_opp_interests_created   ON public.opportunity_interests(created_at DESC);
