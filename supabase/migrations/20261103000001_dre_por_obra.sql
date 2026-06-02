-- ============================================================
-- DRE por Obra — dimensão project_id no razão financeiro
-- OrçaCloud SaaS · Migration 20261103000001
-- Estratégia: adicionar project_id/cost_center_id em
--   internal_transactions, fazer backfill das fontes conhecidas
--   (PROJECT via JSONB, CONTRACT_*, purchase_orders) e estender
--   as RPCs de DRE para filtrar/agrupar por obra.
-- Idempotente (Regra de Ouro 10).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Dimensão obra + centro de custo no razão
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES public.projects(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_project
  ON public.internal_transactions (organization_id, project_id, transaction_date)
  WHERE project_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill — fontes com obra derivável
-- ────────────────────────────────────────────────────────────

-- 2a. PROJECT: reference_id = id de parcela (installments[]) no JSONB do projeto
UPDATE public.internal_transactions it
SET project_id = sub.pid
FROM (
  SELECT p.id AS pid, (inst->>'id') AS ref
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.settings->'financialInfo'->'installments') = 'array'
         THEN p.settings->'financialInfo'->'installments' ELSE '[]'::jsonb END
  ) AS inst
) sub
WHERE it.project_id IS NULL
  AND it.source_system = 'PROJECT'
  AND it.reference_id = sub.ref;

-- 2b. PROJECT: reference_id = id de transação manual (transactions[]) no JSONB
UPDATE public.internal_transactions it
SET project_id = sub.pid
FROM (
  SELECT p.id AS pid, (tx->>'id') AS ref
  FROM public.projects p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.settings->'financialInfo'->'transactions') = 'array'
         THEN p.settings->'financialInfo'->'transactions' ELSE '[]'::jsonb END
  ) AS tx
) sub
WHERE it.project_id IS NULL
  AND it.source_system = 'PROJECT'
  AND it.reference_id = sub.ref;

-- 2c. CONTRACT_*: reference_id começa com contract.id (':pN' nos parcelados)
UPDATE public.internal_transactions it
SET project_id = c.project_id
FROM public.contracts c
WHERE it.project_id IS NULL
  AND it.source_system LIKE 'CONTRACT%'
  AND c.project_id IS NOT NULL
  AND it.reference_id LIKE c.id::text || '%';

-- 2d. COMMERCIAL/ORDER: reference_id = purchase_orders.id (quando o pedido tem obra)
UPDATE public.internal_transactions it
SET project_id = po.project_id
FROM public.purchase_orders po
WHERE it.project_id IS NULL
  AND po.project_id IS NOT NULL
  AND it.reference_id = po.id::text;

-- ────────────────────────────────────────────────────────────
-- 3. fn_dre — agora aceita filtro opcional por obra
--    (substitui a versão de 20260708000001; assinatura adiciona
--     p_project_id ao final, mantendo p_empresa_id por compat.)
--    Drop das assinaturas antigas para evitar ambiguidade de
--    overload com os novos params DEFAULT.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_dre(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.fn_dre(uuid, date, date);
DROP FUNCTION IF EXISTS public.fn_dre_summary(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_dre(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_empresa_id      UUID DEFAULT NULL,
  p_project_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  dre_group         TEXT,
  nature            TEXT,
  sort_order        INT,
  category_name     TEXT,
  total_credit      NUMERIC,
  total_debit       NUMERIC,
  net               NUMERIC,
  pending_credit    NUMERIC,
  pending_debit     NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
    COALESCE(fc.nature, 'EXPENSE')                   AS nature,
    COALESCE(fc.sort_order, 99)                      AS sort_order,
    COALESCE(fc.name, it.category, 'Sem categoria')  AS category_name,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS total_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS total_debit,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
                      WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount ELSE 0 END), 0) AS net,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_debit
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE
    it.organization_id = p_organization_id
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
    AND (p_empresa_id IS NULL OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = it.project_id AND p.empresa_id = p_empresa_id))
  GROUP BY 1, 2, 3, 4
  ORDER BY 3, 4;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. fn_dre_summary — idem, com filtro opcional por obra
-- ────────────────────────────────────────────────────────────

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
  SELECT '= Resultado Líquido',
    COALESCE(SUM(realizado),0),
    COALESCE(SUM(previsto),0)
  FROM agg;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. fn_dre_projects_summary — comparativo Receita/Custo/Margem por obra
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
    -- Receita realizada (CREDIT conciliado em categorias de receita)
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'CONCILIATED'
                      THEN it.amount ELSE 0 END), 0) AS receita,
    -- Custo realizado (DEBIT conciliado em custos/despesas)
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'CONCILIATED'
                      THEN it.amount ELSE 0 END), 0) AS custo,
    -- Margem = receita - custo (realizado)
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED' AND it.direction = 'CREDIT' THEN  it.amount
                      WHEN it.status = 'CONCILIATED' AND it.direction = 'DEBIT'  THEN -it.amount ELSE 0 END), 0) AS margem,
    -- Previstos (pending) para comparativo
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
  GROUP BY p.id, p.name
  HAVING SUM(it.amount) <> 0
  ORDER BY receita DESC, custo DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261103000001_dre_por_obra.sql
-- ────────────────────────────────────────────────────────────
