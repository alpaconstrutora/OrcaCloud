-- ==========================================================================
-- Controladoria · Conta Financeira nos produtores do razão + backfill
-- Date: 2026-09-20
-- Tabelas alteradas: boletos (+category_id)
-- Dados: internal_transactions (category / category_id), sem tocar valor,
--        direção, status ou data de nenhuma linha.
-- Plano: docs/planos/2026-09-20-controladoria-categoria-contratos-boletos-tributos.md
-- ==========================================================================
-- CONTEXTO (verificação de 2026-09-20 com dados reais da Alpa, RLS ativa)
--
-- A DRE classifica por `internal_transactions.category_id →
-- financial_categories.dre_group`, com fallback pelo texto `category` quando o
-- nome bate numa categoria da MESMA organização (aplicar_20270921000029).
-- Três produtores gravavam só o texto, e errado:
--
--   · contratos (contractService) — 'Mão de Obra / Serviço' fixo em TODAS as
--     parcelas, inclusive as de contrato RECEBÍVEL: R$ 1,05 M de receita
--     prevista de 2026 caía em custo. `contracts.category_id` (a "Conta
--     Financeira" do ContractModal) existia e nunca era propagado;
--   · boletos (boletoService) — título nascia sem categoria nenhuma:
--     498 títulos, R$ 508 k, em "Sem Classificação";
--   · tributos automáticos de Locações/Venda de Ativos (taxPayableService) —
--     `category = 'Locação'`/'Venda de Ativo', nomes que não existem no plano.
--
-- O código passa a gravar id + nome (services/financialCategoryResolver.ts).
-- Esta migration dá ao boleto a coluna para escolher a conta e corrige o que
-- já está no razão, na ordem do mais específico para o mais genérico.
-- ==========================================================================

-- ────────────────────────────────────────────────────────────
-- 1. boletos.category_id — Conta Financeira escolhida no boleto
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.financial_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.boletos.category_id IS
  'Conta Financeira (financial_categories) — a dimensão que a DRE lê. Distinta de cost_center_id (Centro de Custo) e plano_de_contas_id (Plano de Contas). Espelhada em internal_transactions.category_id na aprovação.';

CREATE INDEX IF NOT EXISTS boletos_category_id_idx ON public.boletos(category_id)
  WHERE category_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill A — parcela de contrato herda a Conta Financeira do contrato
-- ────────────────────────────────────────────────────────────
UPDATE public.internal_transactions it
   SET category_id = fc.id,
       category    = fc.name
  FROM public.contracts c
  JOIN public.financial_categories fc ON fc.id = c.category_id
 WHERE it.contract_id = c.id
   AND it.source_system LIKE 'CONTRACT_%'
   AND it.category_id IS DISTINCT FROM fc.id;

-- ────────────────────────────────────────────────────────────
-- 3. Backfill B — parcela RECEBÍVEL de contrato sem conta escolhida:
--    'Mão de Obra / Serviço' (custo) → receita. Preferência: categoria da
--    própria organização chamada 'Receita de Obra'; senão a global
--    'Receita de Serviços'. Mesma ordem de CATEGORIA_PADRAO_CONTRATO_RECEBIVEL.
-- ────────────────────────────────────────────────────────────
WITH escolha AS (
  SELECT it.id AS tx_id,
         COALESCE(
           (SELECT fc.id FROM public.financial_categories fc
             WHERE fc.name = 'Receita de Obra' AND fc.organization_id = it.organization_id),
           (SELECT fc.id FROM public.financial_categories fc
             WHERE fc.name = 'Receita de Serviços' AND fc.organization_id IS NULL)
         ) AS fc_id
    FROM public.internal_transactions it
   WHERE it.source_system LIKE 'CONTRACT_%'
     AND it.direction = 'CREDIT'
     AND it.category_id IS NULL
     AND it.category = 'Mão de Obra / Serviço'
)
UPDATE public.internal_transactions it
   SET category_id = fc.id,
       category    = fc.name
  FROM escolha e
  JOIN public.financial_categories fc ON fc.id = e.fc_id
 WHERE it.id = e.tx_id;

-- ────────────────────────────────────────────────────────────
-- 4. Backfill C — tributo automático sobre receita (party_type='TAX'):
--    IRPJ/CSLL → 'IRPJ / CSLL' (IMPOSTOS); o resto → 'Impostos s/ Receita
--    (ISS/PIS/COFINS)' (DEDUCOES). Espelha categoriaDoTributo().
-- ────────────────────────────────────────────────────────────
UPDATE public.internal_transactions it
   SET category_id = fc.id,
       category    = fc.name
  FROM public.financial_categories fc
 WHERE it.party_type = 'TAX'
   AND it.reference_id LIKE 'tax-%'
   AND it.category_id IS NULL
   AND fc.organization_id IS NULL
   AND fc.name = CASE
         WHEN upper(coalesce(it.party_name, '')) ~ '(IRPJ|CSLL|\mIR\M|IMPOSTO DE RENDA)'
           THEN 'IRPJ / CSLL'
         ELSE 'Impostos s/ Receita (ISS/PIS/COFINS)'
       END;

-- ────────────────────────────────────────────────────────────
-- 5. Backfill D — qualquer linha com texto e sem id: liga ao id pelo nome
--    (categoria da org primeiro, global depois). Torna explícito o que o
--    fallback da DRE já fazia por nome, e alcança também as globais, que o
--    fallback (mesma org) não alcança. `name` é UNIQUE global.
-- ────────────────────────────────────────────────────────────
UPDATE public.internal_transactions it
   SET category_id = fc.id
  FROM public.financial_categories fc
 WHERE it.category_id IS NULL
   AND it.category IS NOT NULL
   AND lower(fc.name) = lower(it.category)
   AND (fc.organization_id = it.organization_id OR fc.organization_id IS NULL);

-- Boletos (source_system='BOLETO') ficam como estão: não há fonte para
-- adivinhar a conta de 498 títulos. A partir daqui o usuário escolhe no
-- formulário ou na edição em lote, e a escolha desce ao razão.
