-- ============================================================
-- Fix DRE — Resultado Líquido coerente com a cascata
-- OrçaCloud SaaS · Migration 20261103000003
--
-- Bug: a linha "= Resultado Líquido" somava TODOS os dre_groups
--   (inclusive SEM_CLASSIFICACAO), então créditos sem categoria
--   inflavam o resultado acima do EBITDA — impossível numa DRE.
--
-- Correção:
--   • Resultado Líquido = EBITDA - Financeiro - Impostos +/- Não Op.
--     (soma de todos os grupos EXCETO SEM_CLASSIFICACAO)
--   • Nova linha "(+/-) Resultado Não Operacional"
--   • Nova linha informativa "(!) Sem Classificação" (fora do total)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_dre_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_project_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  linha           TEXT,
  valor_realizado NUMERIC,
  valor_previsto  NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    WHERE it.organization_id = p_organization_id
      AND it.transaction_date BETWEEN p_date_from AND p_date_to
      AND it.status <> 'CANCELLED'
      AND (p_project_id IS NULL OR it.project_id = p_project_id)
  ),
  agg AS (
    SELECT
      dre_group,
      SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
               WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END) AS realizado,
      SUM(CASE WHEN direction='CREDIT' AND status='PENDING' THEN  amount
               WHEN direction='DEBIT'  AND status='PENDING' THEN -amount ELSE 0 END) AS previsto
    FROM base GROUP BY dre_group
  )
  SELECT 'Receita Bruta'           AS linha,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Deduções',
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Receita Líquida',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Custos Diretos',
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Lucro Bruto',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Despesas Operacionais',
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= EBITDA',
    COALESCE(SUM(CASE WHEN dre_group IN (
      'RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL'
    ) THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN (
      'RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL'
    ) THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Resultado Financeiro',
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(-) Impostos sobre Resultado',
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(+/-) Resultado Não Operacional',
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '= Resultado Líquido',
    -- TODOS os grupos EXCETO os não classificados (não inflar o resultado)
    COALESCE(SUM(CASE WHEN dre_group <> 'SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group <> 'SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL
  SELECT '(!) Sem Classificação',
    -- informativo: lançamentos sem categoria mapeada — NÃO entram no resultado
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0)
  FROM agg;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261103000003_fix_dre_resultado_liquido.sql
-- ────────────────────────────────────────────────────────────
