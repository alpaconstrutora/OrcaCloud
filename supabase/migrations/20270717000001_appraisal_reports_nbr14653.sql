-- Laudo de Avaliação de Imóvel — NBR 14653-2 (imóveis urbanos)
-- Método comparativo direto de dados de mercado: comparáveis homogeneizados + tratamento estatístico.
-- Date: 2027-07-17

CREATE TABLE IF NOT EXISTS public.appraisal_reports (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title                   text NOT NULL,
    client_name             text,
    finalidade              text NOT NULL DEFAULT 'compra_venda'
                            CHECK (finalidade IN ('compra_venda', 'garantia', 'judicial', 'seguro', 'desapropriacao', 'partilha', 'outro')),
    objetivo                text NOT NULL DEFAULT 'valor_mercado_venda'
                            CHECK (objetivo IN ('valor_mercado_venda', 'valor_mercado_locacao', 'valor_liquidacao_forcada')),
    metodologia             text NOT NULL DEFAULT 'comparativo_direto'
                            CHECK (metodologia IN ('comparativo_direto', 'involutivo', 'renda', 'evolutivo', 'comparativo_custo')),

    -- Imóvel avaliando
    property_address        text,
    property_city           text,
    property_state          text,
    property_type           text CHECK (property_type IN ('apartamento', 'casa', 'terreno', 'comercial', 'galpao', 'outro')),
    property_area_privativa numeric,
    property_area_total     numeric,
    property_typology       text,
    property_description    text,

    data_base               date NOT NULL DEFAULT CURRENT_DATE,
    responsavel_tecnico     text,
    crea_cau                text,
    art_numero              text,

    diagnostico_mercado     text,
    premissas_ressalvas     text,
    notes                   text,

    status                  text NOT NULL DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho', 'em_elaboracao', 'concluido', 'assinado')),

    -- Resultado (calculado a partir dos comparáveis, editável manualmente para outras metodologias)
    valor_estimado          numeric,
    valor_minimo            numeric,
    valor_maximo            numeric,
    grau_fundamentacao      text CHECK (grau_fundamentacao IN ('I', 'II', 'III')),

    created_by_email        text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appraisal_comparables (
    id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    report_id               uuid NOT NULL REFERENCES public.appraisal_reports(id) ON DELETE CASCADE,
    address                 text NOT NULL,
    source                  text NOT NULL DEFAULT 'oferta' CHECK (source IN ('oferta', 'venda')),
    area                    numeric NOT NULL,
    price_total             numeric NOT NULL,
    -- fatores de homogeneização (multiplicadores; 1.0 = sem ajuste)
    fator_oferta            numeric NOT NULL DEFAULT 1.0,
    fator_localizacao       numeric NOT NULL DEFAULT 1.0,
    fator_area              numeric NOT NULL DEFAULT 1.0,
    fator_estado_conservacao numeric NOT NULL DEFAULT 1.0,
    fator_outros            numeric NOT NULL DEFAULT 1.0,
    distance_km             numeric,
    data_coleta             date DEFAULT CURRENT_DATE,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appraisal_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read appraisal reports" ON public.appraisal_reports
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage appraisal reports" ON public.appraisal_reports
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can read appraisal comparables" ON public.appraisal_comparables
    FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE POLICY "Members can manage appraisal comparables" ON public.appraisal_comparables
    FOR ALL TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE email = auth.jwt()->>'email'
    ));

CREATE INDEX IF NOT EXISTS idx_appraisal_reports_org ON public.appraisal_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_comparables_org ON public.appraisal_comparables(organization_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_comparables_report ON public.appraisal_comparables(report_id);
