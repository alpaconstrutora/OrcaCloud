-- =============================================================================
-- Configurações do Sistema › Tributos e Impostos
-- =============================================================================
-- Cadastro de parâmetros tributários por organização (alíquota, base de
-- cálculo e regra de retenção) — grupo novo em Settings.tsx, análogo aos
-- demais catálogos de "Categorias Gerais".
-- =============================================================================

-- organization_id SEM FK proposital: REFERENCES organizations(id) pega
-- ShareRowExclusiveLock e deadlocka (40P01) contra o app em produção —
-- mesmo problema já visto em broker_proposals e na Inbox de Curadoria.
-- Integridade é garantida por is_org_member() nas policies abaixo.
CREATE TABLE IF NOT EXISTS public.tax_settings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    nome             TEXT NOT NULL,
    aliquota         NUMERIC(6, 3),
    base_calculo     TEXT,
    regra_retencao   TEXT,
    ativo            BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_tax_settings_org ON public.tax_settings(organization_id);

ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_settings_read ON public.tax_settings
    FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY tax_settings_write ON public.tax_settings
    FOR ALL USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.tax_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_settings TO authenticated;
