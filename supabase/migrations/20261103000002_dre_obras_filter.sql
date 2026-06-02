-- ============================================================
-- DRE por Obra — filtro: só OBRAS (exclui orçamento/planejamento/
--   diário e o vault "Gestão Comercial") + lista completa de obras
-- OrçaCloud SaaS · Migration 20261103000002
--
-- Contexto: a tabela projects é sobrecarregada (orçamentos,
--   planejamentos, diários, vault e obras). A classificação fica
--   em settings->>'classification'. Obra = COALESCE(classif,'OBRA')
--   NÃO em ('ORCAMENTO','PLANEJAMENTO','DIARIO') e name<>'Gestão Comercial'.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_list_obras — todas as obras da org (para o dropdown),
--    independentemente de terem movimentação financeira.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_list_obras(
  p_organization_id UUID
)
RETURNS TABLE (
  project_id   UUID,
  project_name TEXT,
  code         TEXT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.name, p.code
  FROM public.projects p
  WHERE (
          p.organization_id = p_organization_id
          OR (p.organization_id IS NULL
              AND (p.settings->>'organizationId')::uuid = p_organization_id)
        )
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA')
        NOT IN ('ORCAMENTO', 'PLANEJAMENTO', 'DIARIO')
  ORDER BY p.name;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. fn_dre_projects_summary — mesmo filtro de obras no comparativo
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dre_projects_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE
)
RETURNS TABLE (
  project_id      UUID,
  project_name    TEXT,
  receita         NUMERIC,
  custo           NUMERIC,
  margem          NUMERIC,
  receita_prev    NUMERIC,
  custo_prev      NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.name,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'CONCILIATED'
                      THEN it.amount ELSE 0 END), 0) AS receita,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'CONCILIATED'
                      THEN it.amount ELSE 0 END), 0) AS custo,
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED' AND it.direction = 'CREDIT' THEN  it.amount
                      WHEN it.status = 'CONCILIATED' AND it.direction = 'DEBIT'  THEN -it.amount ELSE 0 END), 0) AS margem,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'PENDING'
                      THEN it.amount ELSE 0 END), 0) AS receita_prev,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'PENDING'
                      THEN it.amount ELSE 0 END), 0) AS custo_prev
  FROM public.projects p
  JOIN public.internal_transactions it ON it.project_id = p.id
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE it.organization_id = p_organization_id
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA')
        NOT IN ('ORCAMENTO', 'PLANEJAMENTO', 'DIARIO')
  GROUP BY p.id, p.name
  HAVING SUM(it.amount) <> 0
  ORDER BY receita DESC, custo DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261103000002_dre_obras_filter.sql
-- ────────────────────────────────────────────────────────────
