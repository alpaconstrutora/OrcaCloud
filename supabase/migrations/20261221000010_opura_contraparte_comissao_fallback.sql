-- ============================================================
-- ÒPURA — Contraparte: completa o backfill das comissões
-- OrçaCloud SaaS · Migration 20261221000010
-- Idempotente (Regra de Ouro 10).
--
-- A 20261221000009 só resolveu comissões cujo reference_id
-- 'commission-<id>' aponta para commercial_deals. Algumas apontam
-- para broker_portal_commissions (ou para deals já apagados).
-- Aqui:
--   1. resolve o corretor via broker_portal_commissions.broker_email
--   2. fallback: rótulo genérico 'Comissão de corretagem' no que
--      sobrar (melhor que '— Sem contraparte')
-- ============================================================

-- 1. Corretor via broker_portal_commissions (id no reference_id)
UPDATE public.internal_transactions it
SET party_name = bpc.broker_email
FROM public.broker_portal_commissions bpc
WHERE (it.party_name IS NULL OR it.party_name = '')
  AND it.reference_id LIKE 'commission-%'
  AND bpc.broker_email IS NOT NULL
  AND bpc.id::text = substring(it.reference_id from 'commission-(.*)');

-- 2. Fallback genérico para comissões ainda sem contraparte
UPDATE public.internal_transactions
SET party_name = 'Comissão de corretagem'
WHERE (party_name IS NULL OR party_name = '')
  AND reference_id LIKE 'commission-%';

-- ────────────────────────────────────────────────────────────
-- FIM: 20261221000010_opura_contraparte_comissao_fallback.sql
-- ────────────────────────────────────────────────────────────
