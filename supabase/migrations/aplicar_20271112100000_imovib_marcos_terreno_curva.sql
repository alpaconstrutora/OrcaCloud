-- ==========================================================================
-- Imovib: marcos do cronograma, terreno parcelado, curva de desembolso e
-- custo de carregamento do estoque
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, itens
-- 5.1, 5.2, 5.3 e 5.6.
--
-- Colunas novas em imovib_studies, todas opcionais. Vazio = padrão de
-- constants/imovibDefaults.ts, que reproduz o cálculo de antes:
--   acquisition_month             mês da aquisição do terreno (padrão 1);
--   approval_month                mês da aprovação do projeto (vazio = sem marco);
--   incorporation_registry_month  mês do registro da incorporação (vazio = sem marco);
--   land_payment_schedule         [{ "month": n, "percent": p }] — vazio = 100% na aquisição;
--   cost_curve_type               'linear' (padrão), 'curva_s' ou 'custom';
--   cost_curve_custom             pesos mensais da curva personalizada (somam 100);
--   stock_carrying_cost_unit_month  R$ por unidade em estoque por mês, depois da obra (padrão 0).
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada;
--      as colunas herdam as policies de imovib_studies.
--   P2 (quem mais executa?): nenhuma função criada nem alterada. A função do
--      Portal do Investidor (fn_investor_portal_get_study) devolve a linha
--      inteira com row_to_json(s): as colunas novas saem nela para quem tem link
--      válido de oportunidade publicada — premissas do mesmo estudo que o
--      portal já calcula, sem dado pessoal.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN … (as sete abaixo).

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS acquisition_month integer,
    ADD COLUMN IF NOT EXISTS approval_month integer,
    ADD COLUMN IF NOT EXISTS incorporation_registry_month integer,
    ADD COLUMN IF NOT EXISTS land_payment_schedule jsonb,
    ADD COLUMN IF NOT EXISTS cost_curve_type text,
    ADD COLUMN IF NOT EXISTS cost_curve_custom jsonb,
    ADD COLUMN IF NOT EXISTS stock_carrying_cost_unit_month numeric;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_cost_curve_type_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_cost_curve_type_check
    CHECK (cost_curve_type IS NULL OR cost_curve_type IN ('linear', 'curva_s', 'custom'));

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_marcos_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_marcos_check
    CHECK ((acquisition_month IS NULL OR acquisition_month >= 1)
       AND (approval_month IS NULL OR approval_month >= 1)
       AND (incorporation_registry_month IS NULL OR incorporation_registry_month >= 1));

COMMIT;
