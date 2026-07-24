-- =============================================================================
-- Configurações do Sistema › Tributos e Impostos › INSS
-- =============================================================================
-- Faixas de contribuição previdenciária (INSS) por exercício. Dado oficial
-- (tabela do INSS/Previdência), igual para todas as organizações — por isso
-- é global (sem organization_id), sem FK para tabela nenhuma (evita o
-- deadlock 40P01 já visto em REFERENCES organizations(id) neste repo).
-- Leitura pública para authenticated; escrita só via migration (novo
-- exercício = nova migration de seed), mesmo padrão de master_banks etc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tax_inss_brackets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercicio   INTEGER NOT NULL,
    base_de     NUMERIC(12, 2) NOT NULL,
    base_ate    NUMERIC(12, 2) NOT NULL,
    aliquota    NUMERIC(6, 3) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (exercicio, base_de)
);

CREATE INDEX IF NOT EXISTS idx_tax_inss_brackets_exercicio ON public.tax_inss_brackets(exercicio DESC, base_de);

ALTER TABLE public.tax_inss_brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_inss_brackets_select ON public.tax_inss_brackets
    FOR SELECT TO authenticated USING (true);

-- Sem políticas de INSERT/UPDATE/DELETE: escrita só por service_role (via migration).

REVOKE ALL ON public.tax_inss_brackets FROM anon;
GRANT SELECT ON public.tax_inss_brackets TO authenticated;

INSERT INTO public.tax_inss_brackets (exercicio, base_de, base_ate, aliquota) VALUES
  (2026,    0.00, 1621.00,  7.500),
  (2026, 1621.01, 2902.84,  9.000),
  (2026, 2902.85, 4354.27, 12.000),
  (2026, 4354.28, 8475.55, 14.000),
  (2025,    0.00, 1518.00,  7.500),
  (2025, 1518.01, 2793.88,  9.000),
  (2025, 2793.89, 4190.83, 12.000),
  (2025, 4190.84, 8157.41, 14.000),
  (2024,    0.00, 1412.00,  7.500),
  (2024, 1412.01, 2666.68,  9.000),
  (2024, 2666.69, 4000.03, 12.000),
  (2024, 4000.04, 7786.02, 14.000)
ON CONFLICT (exercicio, base_de) DO NOTHING;
