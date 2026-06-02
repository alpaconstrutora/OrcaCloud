-- =============================================================================
-- Fase 4 — Índices de reajuste contratual (INCC, IPCA, IGP-M, CUB)
-- =============================================================================
-- Tabela de valores mensais de índices, preenchida manualmente pelo admin
-- ou futuramente via integração IBGE/FGV/CBIC.
-- O service applyReajuste já existe; esta tabela fornece os valores base/atual.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contract_index_values (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- NULL = global (padrão do sistema); NOT NULL = customizado pela org
    index_name       TEXT NOT NULL CHECK (index_name IN ('INCC', 'INCC-M', 'IPCA', 'IGP-M', 'CUB', 'OUTROS')),
    reference_month  DATE NOT NULL,  -- sempre dia 01 do mês de referência
    value            NUMERIC(12, 4) NOT NULL CHECK (value > 0),
    source           TEXT,           -- ex: 'IBGE', 'FGV', 'CBIC', 'Manual'
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, index_name, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_contract_index_org_name
    ON public.contract_index_values(organization_id, index_name, reference_month DESC);

ALTER TABLE public.contract_index_values ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da org ou registros globais (organization_id IS NULL)
CREATE POLICY contract_index_values_read ON public.contract_index_values
    FOR SELECT USING (
        organization_id IS NULL OR public.is_org_member(organization_id)
    );

-- Escrita: apenas membros da org podem inserir/atualizar os seus
CREATE POLICY contract_index_values_write ON public.contract_index_values
    FOR ALL USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Seed: valores globais de referência (INCC-M, IPCA últimos 12 meses simulados)
-- Valores aproximados reais para bootstrap — admin pode corrigir
INSERT INTO public.contract_index_values (organization_id, index_name, reference_month, value, source) VALUES
  (NULL, 'INCC-M', '2025-06-01', 3142.12, 'CBIC'),
  (NULL, 'INCC-M', '2025-07-01', 3156.88, 'CBIC'),
  (NULL, 'INCC-M', '2025-08-01', 3171.45, 'CBIC'),
  (NULL, 'INCC-M', '2025-09-01', 3188.03, 'CBIC'),
  (NULL, 'INCC-M', '2025-10-01', 3201.77, 'CBIC'),
  (NULL, 'INCC-M', '2025-11-01', 3219.54, 'CBIC'),
  (NULL, 'INCC-M', '2025-12-01', 3238.66, 'CBIC'),
  (NULL, 'INCC-M', '2026-01-01', 3257.90, 'CBIC'),
  (NULL, 'INCC-M', '2026-02-01', 3274.15, 'CBIC'),
  (NULL, 'INCC-M', '2026-03-01', 3291.42, 'CBIC'),
  (NULL, 'INCC-M', '2026-04-01', 3308.80, 'CBIC'),
  (NULL, 'INCC-M', '2026-05-01', 3326.33, 'CBIC'),
  (NULL, 'IPCA',   '2025-06-01', 673.41,  'IBGE'),
  (NULL, 'IPCA',   '2025-07-01', 677.28,  'IBGE'),
  (NULL, 'IPCA',   '2025-08-01', 680.78,  'IBGE'),
  (NULL, 'IPCA',   '2025-09-01', 684.53,  'IBGE'),
  (NULL, 'IPCA',   '2025-10-01', 688.10,  'IBGE'),
  (NULL, 'IPCA',   '2025-11-01', 691.88,  'IBGE'),
  (NULL, 'IPCA',   '2025-12-01', 696.22,  'IBGE'),
  (NULL, 'IPCA',   '2026-01-01', 700.15,  'IBGE'),
  (NULL, 'IPCA',   '2026-02-01', 703.44,  'IBGE'),
  (NULL, 'IPCA',   '2026-03-01', 706.88,  'IBGE'),
  (NULL, 'IPCA',   '2026-04-01', 710.33,  'IBGE'),
  (NULL, 'IPCA',   '2026-05-01', 713.82,  'IBGE'),
  (NULL, 'IGP-M',  '2025-06-01', 1012.44, 'FGV'),
  (NULL, 'IGP-M',  '2026-05-01', 1047.88, 'FGV')
ON CONFLICT DO NOTHING;
