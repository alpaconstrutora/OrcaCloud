-- ==========================================================================
-- Imovib: regras do financiamento à produção, caixa mínimo e origem da TMA
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, itens
-- 4.1, 4.3 e 4.5.
--
-- Colunas novas em imovib_studies, todas opcionais. Vazio = padrão de
-- constants/imovibDefaults.ts, que reproduz o cálculo de antes:
--   financing_release_lag_months  meses entre a medição e a liberação (padrão 0);
--   financing_min_sales_percent   % do VGV vendável vendido antes da 1ª
--                                 liberação (padrão 0 = sem exigência);
--   financing_interest_mode       'capitaliza' (padrão) ou 'paga_mensal';
--   financing_amortization        'receitas' (padrão: toda a receita líquida
--                                 amortiza) ou 'repasse' (só o repasse);
--   min_cash_balance              caixa mínimo da SPE, R$ (padrão 0) — aportes
--                                 e distribuições do item 4.3;
--   discount_rate_basis           texto: de onde vem a TMA (item 4.5).
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada;
--      as colunas herdam as policies de imovib_studies.
--   P2 (quem mais executa?): nenhuma função criada nem alterada. A função do
--      Portal do Investidor (fn_investor_portal_get_study) devolve a linha
--      inteira com row_to_json(s): as colunas novas saem nela para quem tem link
--      válido de oportunidade publicada — são premissas do mesmo estudo que o
--      portal já calcula, sem dado pessoal.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_studies DROP COLUMN … (as seis abaixo).

BEGIN;

ALTER TABLE public.imovib_studies
    ADD COLUMN IF NOT EXISTS financing_release_lag_months integer,
    ADD COLUMN IF NOT EXISTS financing_min_sales_percent numeric,
    ADD COLUMN IF NOT EXISTS financing_interest_mode text,
    ADD COLUMN IF NOT EXISTS financing_amortization text,
    ADD COLUMN IF NOT EXISTS min_cash_balance numeric,
    ADD COLUMN IF NOT EXISTS discount_rate_basis text;

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_financing_interest_mode_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_financing_interest_mode_check
    CHECK (financing_interest_mode IS NULL OR financing_interest_mode IN ('capitaliza', 'paga_mensal'));

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_financing_amortization_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_financing_amortization_check
    CHECK (financing_amortization IS NULL OR financing_amortization IN ('receitas', 'repasse'));

ALTER TABLE public.imovib_studies DROP CONSTRAINT IF EXISTS imovib_studies_financing_release_lag_check;
ALTER TABLE public.imovib_studies ADD CONSTRAINT imovib_studies_financing_release_lag_check
    CHECK (financing_release_lag_months IS NULL OR financing_release_lag_months >= 0);

COMMIT;
