-- ============================================================
-- Suprimentos › Contratos: cancela títulos de contratos já apagados
-- OrçaCloud SaaS · Migration 20270919000041
-- Idempotente (só toca PENDING).
--
-- Contexto (2026-09-13): deleteContract só limpava o Financeiro para
-- recorrente/parcelado; contrato À VISTA excluído deixava o título pendente
-- em Contas a Pagar. Encontrados 5 — quatro de teste (R$ 0,99–2,00) e
-- "Contrato: Igreja Divino — À Vista" (R$ 400.000,00, pendente desde
-- 18/06/2026). O frontend passa a cancelar antes do DELETE (mesmo commit);
-- este arquivo cobre o que já ficou para trás.
--
-- Critério: source_system CONTRACT_*, sem contract_id, reference_id não
-- casa com nenhum contrato existente (qualquer organização), status PENDING.
-- Cancela (não apaga) — trilha continua visível.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f` — NUNCA `db push`.
-- ============================================================

UPDATE public.internal_transactions it
SET status = 'CANCELLED',
    business_status = 'CANCELADO',
    description = it.description || ' — cancelado: contrato excluído'
WHERE it.source_system LIKE 'CONTRACT_%'
  AND it.status = 'PENDING'
  AND it.contract_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE it.reference_id = c.id::text
       OR it.reference_id LIKE c.id::text || '-%'
       OR it.reference_id LIKE c.id::text || ':%'
  );

-- FIM: aplicar_20270919000041_contratos_cancelar_titulos_orfaos.sql
