-- ============================================================
-- Suprimentos › Contratos → Financeiro: backfill de contract_id nos títulos
-- OrçaCloud SaaS · Migration 20270919000040
-- Idempotente (só preenche onde está nulo).
--
-- Sintoma: ÒPURA · Relatórios › aba Contrato mostrava tudo como
-- "— Sem contrato"; qualquer filtro por contrato (p_contract_id) vinha vazio.
--
-- Causa (medido em produção, 2026-09-13): contractService gerava os títulos
-- (CONTRACT_RECURRING 311, CONTRACT_PARCELADO 93, CONTRACT_AVISTA 17) com o
-- id do contrato embutido no reference_id ('<id>-p<data>', '<id>:p<n>',
-- '<id>') e NUNCA preenchia a coluna contract_id — 1 de 421 tinha.
-- O frontend passa a gravar a coluna (mesmo commit); este arquivo cobre o
-- que já existia, casando reference_id com contracts.id da MESMA organização.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

UPDATE public.internal_transactions it
SET contract_id = c.id
FROM public.contracts c
WHERE it.contract_id IS NULL
  AND it.source_system LIKE 'CONTRACT_%'
  AND c.organization_id = it.organization_id
  AND (it.reference_id = c.id::text OR it.reference_id LIKE c.id::text || '-%' OR it.reference_id LIKE c.id::text || ':%');

-- FIM: aplicar_20270919000040_contratos_backfill_contract_id.sql
