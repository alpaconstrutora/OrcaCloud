-- ============================================================
-- ÒPURA Financial Analytics — Fase 0.1: correção de supplier_id
-- OrçaCloud SaaS · Migration 20261221000003
-- Idempotente (Regra de Ouro 10).
--
-- Conserto do bug semântico introduzido em 20261221000001 (3b):
-- a backfill de supplier_id a partir do contrato não respeitava a
-- direção, atribuindo fornecedor a lançamentos de RECEITA (CREDIT),
-- cuja contraparte é CLIENTE (party_id), não fornecedor.
--
-- Diagnóstico em produção (2026-06-22): os 18 únicos supplier_id
-- preenchidos eram TODOS CREDIT (CONTRACT_PARCELADO/AVISTA =
-- recebíveis de venda), poluindo a dimensão Fornecedor.
--
-- A backfill original (3b/4b) já foi corrigida com `direction='DEBIT'`;
-- esta migration repara os dados já gravados.
--
-- NOTA (não-migration): a cobertura de fornecedor em DEBIT permanece
-- ~0 porque os pagáveis desta base são dominados por LABOR (folha),
-- PROJECT (custos no JSONB) e comissões de corretor
-- (reference_id 'commission-<id>') — nenhum carrega FK p/ suppliers.
-- Atribuir fornecedor a esses exige captura na origem / pontes
-- dedicadas (folha→empregado, comissão→corretor), fora desta fase.
-- ============================================================

-- supplier_id só faz sentido em SAÍDAS. Em entradas (CREDIT) a
-- contraparte é cliente — zera atribuições indevidas.
UPDATE public.internal_transactions
SET supplier_id = NULL
WHERE supplier_id IS NOT NULL
  AND direction = 'CREDIT';

-- Relatório de verificação (NOTICE)
DO $$
DECLARE
  v_debit_forn  BIGINT;
  v_credit_forn BIGINT;
BEGIN
  SELECT count(*) FILTER (WHERE supplier_id IS NOT NULL AND direction = 'DEBIT'),
         count(*) FILTER (WHERE supplier_id IS NOT NULL AND direction = 'CREDIT')
    INTO v_debit_forn, v_credit_forn
  FROM public.internal_transactions;

  RAISE NOTICE 'ÒPURA Fase 0.1 — supplier_id por direção: DEBIT=% (válido), CREDIT=% (deve ser 0)',
    v_debit_forn, v_credit_forn;
END $$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000003_opura_fase01_fix_supplier_direction.sql
-- ────────────────────────────────────────────────────────────
