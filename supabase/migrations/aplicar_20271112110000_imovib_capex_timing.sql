-- ==========================================================================
-- Imovib: momento de saída de cada rubrica do CAPEX
-- ==========================================================================
-- Plano: docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md, item 5.5.
--
-- Colunas novas em imovib_capex_items, opcionais. `timing` vazio = o
-- comportamento de antes (pela base da rubrica: terreno no mês 1, obra ao longo
-- da obra, vgv sobre a receita). Preenchido:
--   aquisicao  no mês da aquisição do terreno;
--   pre_obra   em partes iguais entre a aquisição e o mês anterior à obra;
--   lancamento nos três meses até o início das vendas;
--   obra       pela curva de desembolso;
--   vendas     pela curva de vendas;
--   pos_obra   em `timing_months` meses depois do fim da obra (padrão 12).
-- O cálculo é utils/imovibMotor.ts.
--
-- REGRA #7
--   P1 (esta perna do OR libera sozinha?): nenhuma policy criada nem alterada;
--      as colunas herdam as policies de imovib_capex_items.
--   P2 (quem mais executa?): nenhuma função criada nem alterada. A função do
--      Portal do Investidor devolve as rubricas com row_to_json(c): as duas
--      colunas novas saem nela, como as demais colunas da rubrica.
--   P3: não se aplica.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>
-- NUNCA supabase db push.
-- Reverter: ALTER TABLE public.imovib_capex_items DROP COLUMN timing, DROP COLUMN timing_months;

BEGIN;

ALTER TABLE public.imovib_capex_items
    ADD COLUMN IF NOT EXISTS timing text,
    ADD COLUMN IF NOT EXISTS timing_months integer;

ALTER TABLE public.imovib_capex_items DROP CONSTRAINT IF EXISTS imovib_capex_items_timing_check;
ALTER TABLE public.imovib_capex_items ADD CONSTRAINT imovib_capex_items_timing_check
    CHECK (timing IS NULL OR timing IN ('aquisicao', 'pre_obra', 'lancamento', 'obra', 'vendas', 'pos_obra'));

ALTER TABLE public.imovib_capex_items DROP CONSTRAINT IF EXISTS imovib_capex_items_timing_months_check;
ALTER TABLE public.imovib_capex_items ADD CONSTRAINT imovib_capex_items_timing_months_check
    CHECK (timing_months IS NULL OR timing_months >= 1);

COMMIT;
