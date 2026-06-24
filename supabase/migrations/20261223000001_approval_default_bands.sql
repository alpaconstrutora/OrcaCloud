-- ============================================================
-- ÒPURA Approval — Fase 0: faixas de aprovação default
-- OrçaCloud SaaS · Migration 20261223000001
-- Idempotente (Regra de Ouro 10).
--
-- Diagnóstico (2026-06-23): o fluxo de aprovação financeiro nunca
-- foi usado (291 lançamentos, 100% RASCUNHO) e nenhuma organização
-- tem faixa configurada em financial_approval_config. Sem ao menos
-- uma faixa, fn_resolve_approval_levels não resolve nada e o portão
-- soft (Fase 3) seria inócuo.
--
-- Aqui: para TODA organização SEM config, semeia 2 faixas default:
--   abaixo de 5.000  → SEM faixa = nenhuma aprovação exigida (fn retorna NULL)
--   5.000 – 50.000   → 1 nível  (Gestor)
--   50.000+          → 2 níveis (Gestor + Diretoria)
-- Não há faixa cobrindo [0, 5.000): abaixo do piso, fn_resolve_approval_levels
-- retorna NULL e nada é exigido (o modelo não suporta "0 níveis").
-- São apenas sementes — editáveis na tela (FinancialApprovalModule).
-- NÃO altera orgs que já configuraram (preserva escolha do cliente).
-- ============================================================

INSERT INTO public.financial_approval_config
  (organization_id, faixa_min, faixa_max, required_levels, level1_label, level2_label, is_active, sort_order)
SELECT
  o.id, b.faixa_min, b.faixa_max, b.required_levels, b.level1_label, b.level2_label, true, b.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  (5000::numeric,  50000::numeric, 1, 'Gestor'::text, NULL::text,        1),
  (50000::numeric, NULL::numeric,  2, 'Gestor'::text, 'Diretoria'::text, 2)
) AS b(faixa_min, faixa_max, required_levels, level1_label, level2_label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_approval_config c
  WHERE c.organization_id = o.id
);

-- ────────────────────────────────────────────────────────────
-- FIM: 20261223000001_approval_default_bands.sql
-- ────────────────────────────────────────────────────────────
