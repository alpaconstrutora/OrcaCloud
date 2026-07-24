-- =============================================================================
-- Configurações do Sistema › Tributos e Impostos › COFINS
-- =============================================================================
-- Alíquotas de COFINS por exercício e regime tributário. Dado oficial, igual
-- para todas as organizações — global (sem organization_id) e sem FK para
-- tabela nenhuma (evita o deadlock 40P01 já visto neste repo com
-- REFERENCES organizations(id)).
-- Leitura para authenticated; escrita só via migration (novo exercício =
-- nova migration de seed), mesmo padrão de tax_pis_rates.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tax_cofins_rates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercicio          INTEGER NOT NULL,
    regime_tributario  TEXT NOT NULL,
    aliquota           NUMERIC(6, 3) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (exercicio, regime_tributario)
);

CREATE INDEX IF NOT EXISTS idx_tax_cofins_rates_exercicio ON public.tax_cofins_rates(exercicio DESC, regime_tributario);

ALTER TABLE public.tax_cofins_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_cofins_rates_select ON public.tax_cofins_rates
    FOR SELECT TO authenticated USING (true);

-- Sem políticas de INSERT/UPDATE/DELETE: escrita só por service_role (via migration).

REVOKE ALL ON public.tax_cofins_rates FROM anon;
GRANT SELECT ON public.tax_cofins_rates TO authenticated;

INSERT INTO public.tax_cofins_rates (exercicio, regime_tributario, aliquota) VALUES
  (2009, 'Lucro Real',      7.600),
  (2009, 'Lucro Presumido', 3.000),
  (2010, 'Lucro Real',      7.600),
  (2010, 'Lucro Presumido', 3.000),
  (2011, 'Lucro Real',      7.600),
  (2011, 'Lucro Presumido', 3.000),
  (2012, 'Lucro Real',      7.600),
  (2012, 'Lucro Presumido', 3.000),
  (2013, 'Lucro Real',      7.600),
  (2013, 'Lucro Presumido', 3.000),
  (2014, 'Lucro Real',      7.600),
  (2014, 'Lucro Presumido', 3.000),
  (2015, 'Lucro Real',      7.600),
  (2015, 'Lucro Presumido', 3.000),
  (2016, 'Lucro Real',      7.600),
  (2016, 'Lucro Presumido', 3.000),
  (2017, 'Lucro Real',      7.600),
  (2017, 'Lucro Presumido', 3.000),
  (2018, 'Lucro Real',      7.600),
  (2018, 'Lucro Presumido', 3.000),
  (2019, 'Lucro Real',      7.600),
  (2019, 'Lucro Presumido', 3.000),
  (2020, 'Lucro Real',      7.600),
  (2020, 'Lucro Presumido', 3.000),
  (2021, 'Lucro Real',      7.600),
  (2021, 'Lucro Presumido', 3.000),
  (2022, 'Lucro Real',      7.600),
  (2022, 'Lucro Presumido', 3.000),
  (2023, 'Lucro Real',      7.600),
  (2023, 'Lucro Presumido', 3.000),
  (2024, 'Lucro Real',      7.600),
  (2024, 'Lucro Presumido', 3.000),
  (2025, 'Lucro Real',      7.600),
  (2025, 'Lucro Presumido', 3.000),
  (2026, 'Lucro Real',      7.600),
  (2026, 'Lucro Presumido', 3.000)
ON CONFLICT (exercicio, regime_tributario) DO NOTHING;
