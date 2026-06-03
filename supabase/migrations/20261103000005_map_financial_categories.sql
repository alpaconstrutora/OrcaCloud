-- ============================================================
-- Mapeamento de categorias financeiras p/ dre_group + fallback texto
-- OrçaCloud SaaS · Migration 20261103000005
--
-- Diagnóstico (20261103): R$ 5,6M caíam em SEM_CLASSIFICACAO porque
--   categorias da org existiam com dre_group=SEM_CLASSIFICACAO
--   (ex.: "Receita com Venda Imobiliária" = R$ 5,75M) e 2 textos
--   não tinham category_id ("Material", "Mão de Obra / Serviço").
--
-- Correção:
--   1. Remapeia categorias mal classificadas (só onde hoje é SEM_CLASSIF.)
--   2. Cria categorias faltantes a partir do uso + backfill de category_id
--   3. fn_dre/_summary/_projects: fallback por nome quando category_id é null
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Remapear categorias mal classificadas (idempotente: só toca
--    as que ainda estão em SEM_CLASSIFICACAO)
-- ────────────────────────────────────────────────────────────

-- Receitas
UPDATE public.financial_categories SET dre_group='RECEITA_BRUTA', nature='REVENUE'
WHERE dre_group='SEM_CLASSIFICACAO'
  AND name IN ('Receita com Venda Imobiliária','Receita com Locações');

-- Despesas comerciais
UPDATE public.financial_categories SET dre_group='DESPESA_COMERCIAL', nature='EXPENSE'
WHERE dre_group='SEM_CLASSIFICACAO'
  AND name IN ('Comissão de Corretagem');

-- Despesas administrativas (folha/encargos/utilidades/admin)
UPDATE public.financial_categories SET dre_group='DESPESA_ADM', nature='EXPENSE'
WHERE dre_group='SEM_CLASSIFICACAO'
  AND name IN (
    'Folha de Pagamento','Encargos Patronais','Contribuições de Terceiros','Pessoal',
    'Software e Sistemas','Água','Energia','Internet','Combustível','Condomínio',
    'Contabilidade','Movimentação'
  );

-- Financeiro
UPDATE public.financial_categories SET dre_group='FINANCEIRO', nature='EXPENSE'
WHERE dre_group='SEM_CLASSIFICACAO'
  AND name IN ('Despesas Financeiras');

-- Custo de obra
UPDATE public.financial_categories SET dre_group='CUSTO_OBRA', nature='COST'
WHERE dre_group='SEM_CLASSIFICACAO'
  AND name IN ('Insumos');

-- ────────────────────────────────────────────────────────────
-- 2. Criar categorias faltantes (texto usado nos lançamentos sem
--    category_id) e fazer backfill do category_id por nome
-- ────────────────────────────────────────────────────────────

-- Atualiza se já existirem (idempotência) …
UPDATE public.financial_categories
  SET dre_group='CUSTO_OBRA', nature='COST'
WHERE name IN ('Material','Mão de Obra / Serviço')
  AND COALESCE(dre_group,'SEM_CLASSIFICACAO')='SEM_CLASSIFICACAO';

-- … e cria as que faltam (nome é UNIQUE global → 1 linha, da org que mais usa)
INSERT INTO public.financial_categories (organization_id, name, dre_group, nature, sort_order)
SELECT sub.org, 'Material', 'CUSTO_OBRA', 'COST', 30
FROM (
  SELECT it.organization_id AS org, count(*) AS c
  FROM public.internal_transactions it
  WHERE it.category = 'Material' AND it.category_id IS NULL AND it.organization_id IS NOT NULL
  GROUP BY it.organization_id ORDER BY c DESC LIMIT 1
) sub
WHERE NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE name = 'Material');

INSERT INTO public.financial_categories (organization_id, name, dre_group, nature, sort_order)
SELECT sub.org, 'Mão de Obra / Serviço', 'CUSTO_OBRA', 'COST', 31
FROM (
  SELECT it.organization_id AS org, count(*) AS c
  FROM public.internal_transactions it
  WHERE it.category = 'Mão de Obra / Serviço' AND it.category_id IS NULL AND it.organization_id IS NOT NULL
  GROUP BY it.organization_id ORDER BY c DESC LIMIT 1
) sub
WHERE NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE name = 'Mão de Obra / Serviço');

-- Backfill category_id por nome (mesma org), para os lançamentos órfãos
UPDATE public.internal_transactions it
SET category_id = fc.id
FROM public.financial_categories fc
WHERE it.category_id IS NULL
  AND fc.organization_id = it.organization_id
  AND lower(fc.name) = lower(it.category);

-- ────────────────────────────────────────────────────────────
-- 3. Fallback por texto nas funções da DRE
--    (quando category_id é null, casa pelo nome na mesma org)
-- ────────────────────────────────────────────────────────────

-- 3a. fn_dre
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
LANGUAGE sql STABLE SET search_path = public, pg_temp
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
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
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

-- 3b. fn_dre_summary
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
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction, it.status, it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc
      ON fc.id = it.category_id
      OR (it.category_id IS NULL
          AND fc.organization_id = it.organization_id
          AND lower(fc.name) = lower(it.category))
    WHERE it.organization_id = p_organization_id
      AND it.transaction_date BETWEEN p_date_from AND p_date_to
      AND it.status <> 'CANCELLED'
      AND (p_project_id IS NULL OR it.project_id = p_project_id)
  ),
  agg AS (
    SELECT dre_group,
      SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
               WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END) AS realizado,
      SUM(CASE WHEN direction='CREDIT' AND status='PENDING' THEN  amount
               WHEN direction='DEBIT'  AND status='PENDING' THEN -amount ELSE 0 END) AS previsto
    FROM base GROUP BY dre_group
  )
  SELECT 'Receita Bruta', COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN realizado ELSE 0 END),0),
                          COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(-) Deduções', COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -realizado ELSE 0 END),0),
                         COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '= Receita Líquida', COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN realizado ELSE 0 END),0),
                              COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(-) Custos Diretos', COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -realizado ELSE 0 END),0),
                               COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '= Lucro Bruto', COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN realizado ELSE 0 END),0),
                          COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(-) Despesas Operacionais', COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -realizado ELSE 0 END),0),
                                      COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '= EBITDA', COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN realizado ELSE 0 END),0),
                     COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(-) Resultado Financeiro', COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -realizado ELSE 0 END),0),
                                     COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(-) Impostos sobre Resultado', COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -realizado ELSE 0 END),0),
                                         COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(+/-) Resultado Não Operacional', COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN realizado ELSE 0 END),0),
                                            COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '= Resultado Líquido', COALESCE(SUM(CASE WHEN dre_group <> 'SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
                                COALESCE(SUM(CASE WHEN dre_group <> 'SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0) FROM agg
  UNION ALL
  SELECT '(!) Sem Classificação', COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
                                  COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0) FROM agg;
$$;

-- 3c. fn_dre_projects_summary
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
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.name,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS receita,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0) AS custo,
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED' AND it.direction = 'CREDIT' THEN  it.amount
                      WHEN it.status = 'CONCILIATED' AND it.direction = 'DEBIT'  THEN -it.amount ELSE 0 END), 0) AS margem,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS receita_prev,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS custo_prev
  FROM public.projects p
  JOIN public.internal_transactions it ON it.project_id = p.id
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
  WHERE it.organization_id = p_organization_id
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
  GROUP BY p.id, p.name
  HAVING SUM(it.amount) <> 0
  ORDER BY receita DESC, custo DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Verificação (log) — quanto restou em SEM_CLASSIFICACAO
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE v_rest numeric; v_rec numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN it.direction='CREDIT' THEN it.amount ELSE -it.amount END),0)
    INTO v_rest
  FROM internal_transactions it
  LEFT JOIN financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL AND fc.organization_id = it.organization_id AND lower(fc.name)=lower(it.category))
  WHERE it.status <> 'CANCELLED' AND COALESCE(fc.dre_group,'SEM_CLASSIFICACAO')='SEM_CLASSIFICACAO';

  SELECT COALESCE(SUM(it.amount),0) INTO v_rec
  FROM internal_transactions it
  LEFT JOIN financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL AND fc.organization_id = it.organization_id AND lower(fc.name)=lower(it.category))
  WHERE it.status='CONCILIATED' AND it.direction='CREDIT' AND fc.dre_group='RECEITA_BRUTA';

  RAISE NOTICE '>>> POS-FIX: SEM_CLASSIFICACAO net = % | Receita Bruta (concil.) = %', round(v_rest,2), round(v_rec,2);
END $$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20261103000005_map_financial_categories.sql
-- ────────────────────────────────────────────────────────────
