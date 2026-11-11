-- ==========================================================================
-- Imovib: premissas da curva de vendas e do recebimento por safra
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 1.3.
--
-- 16 colunas novas em imovib_studies, todas anuláveis: vazio = padrão de
-- constants/imovibDefaults.ts (o motor nunca troca valor digitado). O motor lê
-- todas (CAMPOS_DO_MOTOR em utils/imovibMotor.ts), e a listagem seleciona por
-- nome: esta migration vai ao banco ANTES do código que as lê (senão 42703).
--
-- REGRA #7
--   P1: nenhuma policy criada ou alterada; as colunas herdam a RLS de
--       imovib_studies. A função do Portal do Investidor (row_to_json do estudo
--       publicado) passa a levá-las junto, como já leva as outras premissas.
--   P2: nenhuma função criada.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN … (as 16 abaixo).

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS sales_curve_type text,
    ADD COLUMN IF NOT EXISTS sales_launch_percent numeric,
    ADD COLUMN IF NOT EXISTS sales_launch_months integer,
    ADD COLUMN IF NOT EXISTS sales_vso_percent numeric,
    ADD COLUMN IF NOT EXISTS sales_curve_custom jsonb,
    ADD COLUMN IF NOT EXISTS revenue_intermediate_percent numeric,
    ADD COLUMN IF NOT EXISTS revenue_intermediate_interval_months integer,
    ADD COLUMN IF NOT EXISTS revenue_post_handover_percent numeric,
    ADD COLUMN IF NOT EXISTS post_handover_months integer,
    ADD COLUMN IF NOT EXISTS post_handover_rate_monthly numeric,
    ADD COLUMN IF NOT EXISTS handover_delay_months integer,
    ADD COLUMN IF NOT EXISTS cancellation_lag_months integer,
    ADD COLUMN IF NOT EXISTS cancellation_refund_percent numeric,
    ADD COLUMN IF NOT EXISTS cancellation_resale boolean,
    ADD COLUMN IF NOT EXISTS sales_index_rate_monthly numeric,
    ADD COLUMN IF NOT EXISTS cost_index_rate_monthly numeric;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_sales_curve_type_check;
ALTER TABLE public.imovib_studies
    ADD CONSTRAINT imovib_studies_sales_curve_type_check
    CHECK (sales_curve_type IS NULL OR sales_curve_type IN ('linear', 'lancamento', 'vso', 'custom'));

COMMENT ON COLUMN public.imovib_studies.sales_curve_type IS 'Curva de vendas: linear | lancamento | vso | custom. Vazio = linear.';
COMMENT ON COLUMN public.imovib_studies.sales_curve_custom IS 'Curva personalizada: lista de pesos por mês de venda (normalizada).';
COMMENT ON COLUMN public.imovib_studies.post_handover_rate_monthly IS 'Juro do pós-chaves, % ao mês (Price).';
COMMENT ON COLUMN public.imovib_studies.sales_index_rate_monthly IS 'Índice das vendas, % ao mês. Vazio = inflation_rate.';
COMMENT ON COLUMN public.imovib_studies.cost_index_rate_monthly IS 'Índice da obra, % ao mês. Vazio = inflation_rate.';

COMMIT;
