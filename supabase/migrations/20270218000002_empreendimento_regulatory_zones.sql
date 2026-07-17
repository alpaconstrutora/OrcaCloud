-- migration: 20270218000002_empreendimento_regulatory_zones.sql
--
-- Mapa Regulatório passa a MORAR no empreendimento (fonte única), não mais na Viabilidade.
-- Até aqui os parâmetros urbanísticos viviam em imovib_regulatory_zones (do estudo Imovib) e o
-- empreendimento só emprestava a tela. Agora o empreendimento é o dono: os três módulos
-- (Empreendimento, Viabilidade, Planta) leem e editam ESTA tabela, e os cálculos da Viabilidade
-- (Potencial Construtivo, CAPEX, Viabilidade Estática) também. Um estudo sem empreendimento
-- vinculado fica sem regulatório — decisão de "fonte única" (igual a Torres & Unidades).
--
-- Anti-deadlock: sem FK (padrão do módulo), sem view. A cópia de dados é INSERT..SELECT
-- (AccessShare nas origens), idempotente pelo NOT EXISTS.

-- 1) Tabela dona, no empreendimento. 21 campos (os 8 do zoneamento + os 13 unificados da Planta).
CREATE TABLE IF NOT EXISTS public.empreendimento_regulatory_zones (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id           UUID NOT NULL,          -- sem FK (anti-deadlock, padrão do módulo)
    organization_id             UUID NOT NULL,          -- p/ RLS
    macroarea                   TEXT,
    zona                        TEXT,
    ca_minimo                   TEXT,
    ca_basico                   TEXT,
    ca_maximo                   TEXT,
    taxa_ocupacao_maxima        TEXT,
    taxa_permeabilidade_minima  TEXT,
    gabarito_altura_maxima      TEXT,
    uso_permitido               TEXT,
    recuo_frente                TEXT,
    recuo_fundos                TEXT,
    recuo_lateral_direita       TEXT,
    recuo_lateral_esquerda      TEXT,
    gabarito_pavimentos         TEXT,
    regra_vagas                 TEXT,
    vagas_por_unidade           TEXT,
    area_minima_unidade         TEXT,
    lei_referencia              TEXT,
    documento_fonte             TEXT,
    nivel_confianca             TEXT,
    observacoes                 TEXT,
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_regulatory_zones_emp
    ON public.empreendimento_regulatory_zones (empreendimento_id);

ALTER TABLE public.empreendimento_regulatory_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_emp_regulatory_zones" ON public.empreendimento_regulatory_zones;
CREATE POLICY "org_access_emp_regulatory_zones" ON public.empreendimento_regulatory_zones
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT public.empr_user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.empr_user_org_ids()));

-- 2) Copia o que já existe: para cada empreendimento com estudo Imovib vinculado, traz as zonas
--    daquele estudo. imovib_regulatory_zones já tem os 21 campos (migration 20270218000001).
--    NOT EXISTS: idempotente — não re-copia se o empreendimento já tiver zonas.
INSERT INTO public.empreendimento_regulatory_zones (
    empreendimento_id, organization_id,
    macroarea, zona, ca_minimo, ca_basico, ca_maximo, taxa_ocupacao_maxima,
    taxa_permeabilidade_minima, gabarito_altura_maxima, uso_permitido, recuo_frente,
    recuo_fundos, recuo_lateral_direita, recuo_lateral_esquerda, gabarito_pavimentos,
    regra_vagas, vagas_por_unidade, area_minima_unidade, lei_referencia, documento_fonte,
    nivel_confianca, observacoes, created_at, updated_at
)
SELECT
    e.id, e.organization_id,
    z.macroarea, z.zona, z.ca_minimo, z.ca_basico, z.ca_maximo, z.taxa_ocupacao_maxima,
    z.taxa_permeabilidade_minima, z.gabarito_altura_maxima, z.uso_permitido, z.recuo_frente,
    z.recuo_fundos, z.recuo_lateral_direita, z.recuo_lateral_esquerda, z.gabarito_pavimentos,
    z.regra_vagas, z.vagas_por_unidade, z.area_minima_unidade, z.lei_referencia, z.documento_fonte,
    z.nivel_confianca, z.observacoes, z.created_at, z.updated_at
FROM public.imovib_regulatory_zones z
JOIN public.empreendimentos e ON e.imovib_study_id = z.study_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.empreendimento_regulatory_zones erz WHERE erz.empreendimento_id = e.id
);

-- 3) Torres & Unidades 100%: suítes é o único campo de unidade que a Planta tinha e o
--    empreendimento não. ADD COLUMN metadata-only, sem FK.
ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS suites INTEGER;
