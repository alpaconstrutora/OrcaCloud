-- =============================================================================
-- Empresa dona do imóvel comercial / empreendimento (regime tributário)
-- Date: 2026-07-25
-- =============================================================================
-- A geração de Tributos a Pagar de Locações (taxPayableService.generateForDeal)
-- precisa saber o REGIME TRIBUTÁRIO da empresa dona do imóvel para escolher a
-- alíquota correta de PIS/COFINS (tax_pis_rates/tax_cofins_rates são por
-- exercício + regime). Até aqui não havia vínculo imóvel→empresa.
--
-- Regra de resolução na geração:
--   commercial_properties.company_id  (por imóvel; sobrepõe)
--     ↳ senão empreendimentos.company_id (herança via empreendimento_units.commercial_property_id)
--
-- commercial_properties e empreendimentos são tabelas QUENTES (PostgREST lê o
-- tempo todo). ADD COLUMN de coluna nullable é metadata-only; a FK entra como
-- NOT VALID para não travar a tabela inteira validando as linhas existentes
-- (todas company_id = NULL, nada a validar de fato). lock_timeout por segurança.
-- =============================================================================

SET lock_timeout = '4s';

ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS company_id UUID;

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS company_id UUID;

-- FK NOT VALID: registra a referência sem varrer/lockar a tabela existente.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commercial_properties_company_id_fkey'
    ) THEN
        ALTER TABLE public.commercial_properties
            ADD CONSTRAINT commercial_properties_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_company_id_fkey'
    ) THEN
        ALTER TABLE public.empreendimentos
            ADD CONSTRAINT empreendimentos_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END $$;

COMMENT ON COLUMN public.commercial_properties.company_id IS
    'Empresa (companies) dona do imóvel. Define o regime tributário usado na geração de Tributos a Pagar de Locações. Sobrepõe empreendimentos.company_id.';
COMMENT ON COLUMN public.empreendimentos.company_id IS
    'Empresa (companies) dona do empreendimento. Herdada pelos imóveis sem company_id próprio na geração de tributos.';

-- =============================================================================
-- FIM: 20270826000002_commercial_property_company.sql
-- =============================================================================
