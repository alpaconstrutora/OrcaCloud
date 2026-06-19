-- ============================================================
-- Regra de conciliação: repasse Asaas = transferência (não receita)
-- OrçaCloud SaaS · Migration 20261119000004
-- Idempotente (Regra de Ouro 10).
-- ============================================================
--
-- Contexto: o webhook do Asaas já reconhece a receita no pagamento
-- do boleto (recebível RECEBIDO+CONCILIATED). Quando o repasse líquido
-- cai no extrato (OFX), ele NÃO deve virar receita nova. Esta regra
-- identifica créditos com "ASAAS" na descrição e os auto-confirma como
-- "Repasse Gateway (Asaas)", removendo-os do pool de matching de receita.
-- (depende do suporte a actions.auto_confirm no bankReconciliationService)
-- ============================================================

INSERT INTO public.reconciliation_rules
  (organization_id, name, priority, is_active, conditions, actions)
SELECT
  cc.organization_id,
  'Repasse Gateway (Asaas)',
  100,
  true,
  '{"field":"description","type":"contains","value":"ASAAS"}'::jsonb,
  '{"category":"Repasse Gateway (Asaas)","auto_confirm":true}'::jsonb
FROM (SELECT DISTINCT organization_id FROM public.client_charges) cc
WHERE NOT EXISTS (
  SELECT 1 FROM public.reconciliation_rules r
  WHERE r.organization_id = cc.organization_id
    AND r.name = 'Repasse Gateway (Asaas)'
);

-- ────────────────────────────────────────────────────────────
-- FIM: 20261119000004_asaas_settlement_rule.sql
-- ────────────────────────────────────────────────────────────
