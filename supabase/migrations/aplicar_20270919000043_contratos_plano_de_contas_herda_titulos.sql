-- ============================================================
-- Plano de contas / centro de custo: negociação → contrato → parcelas
-- OrçaCloud SaaS · Migration 20270919000043
-- Idempotente (só preenche onde está nulo).
--
-- Sintoma (2026-09-14): ÒPURA · Relatórios › Plano de Contas não mostrava
-- títulos cujo plano estava informado — no CONTRATO (Suprimentos) ou na
-- NEGOCIAÇÃO (Locações). Medido: 9 contratos com plano → 33 títulos, 24
-- herdaram; 4 locações com "2.1.2 Receitas de Locação" → 605 títulos, 36
-- herdaram (só as geradas por "Gerar parcelas").
--
-- Causa: createFromDeal não levava o plano da negociação para o contrato;
-- syncRecurringToFinance e syncAVistaToFinance não gravavam plano/CC na
-- parcela; parcelado só copiava se o plano já existia na geração; editar o
-- plano no contrato não descia para as parcelas. Frontend corrigido no
-- mesmo commit. Este arquivo cobre o que já existe:
--   1. contrato sem plano/CC herda da negociação (contracts.deal_id);
--   2. parcela (CONTRACT_*) sem plano/CC herda do contrato.
-- Tributos (source_system COMMERCIAL, 'tax-…') ficam fora: são despesa, e o
-- plano da negociação é receita.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

-- 1. negociação → contrato
UPDATE public.contracts c
SET plano_de_contas_id = COALESCE(c.plano_de_contas_id, d.plano_de_contas_id),
    cost_center_id     = COALESCE(c.cost_center_id,     d.cost_center_id)
FROM public.commercial_deals d
WHERE d.id = c.deal_id
  AND ((c.plano_de_contas_id IS NULL AND d.plano_de_contas_id IS NOT NULL)
    OR (c.cost_center_id     IS NULL AND d.cost_center_id     IS NOT NULL));

-- 2. contrato → parcelas (só CONTRACT_*, só onde nulo)
UPDATE public.internal_transactions it
SET plano_de_contas_id = COALESCE(it.plano_de_contas_id, c.plano_de_contas_id),
    cost_center_id     = COALESCE(it.cost_center_id,     c.cost_center_id)
FROM public.contracts c
WHERE c.id = it.contract_id
  AND it.source_system IN ('CONTRACT_RECURRING', 'CONTRACT_PARCELADO', 'CONTRACT_AVISTA')
  AND ((it.plano_de_contas_id IS NULL AND c.plano_de_contas_id IS NOT NULL)
    OR (it.cost_center_id     IS NULL AND c.cost_center_id     IS NOT NULL));

-- FIM: aplicar_20270919000043_contratos_plano_de_contas_herda_titulos.sql
