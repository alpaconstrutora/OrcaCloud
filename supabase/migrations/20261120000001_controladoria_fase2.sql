-- ============================================================
-- Controladoria Fase 2
--   1. competencia_date em internal_transactions
--   2. fn_dre / fn_dre_summary / fn_balancete com p_regime
--   3. fn_dre_spe_summary  — DRE por SPE/empresa
--   4. fn_project_wip      — Work In Progress por obra
-- Idempotente.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Coluna regime de competência
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS competencia_date DATE;

UPDATE public.internal_transactions
SET competencia_date = transaction_date::date
WHERE competencia_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_internal_txs_competencia
  ON public.internal_transactions (organization_id, competencia_date)
  WHERE competencia_date IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. fn_dre — adiciona p_regime ('CAIXA' | 'COMPETENCIA')
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_dre(uuid, date, date, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_dre(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.fn_dre(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_dre(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_empresa_id      UUID    DEFAULT NULL,
  p_project_id      UUID    DEFAULT NULL,
  p_regime          TEXT    DEFAULT 'CAIXA'   -- 'CAIXA' | 'COMPETENCIA'
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
    -- Caixa: apenas CONCILIATED | Competência: tudo não-cancelado
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0)
    END AS total_credit,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0)
    END AS total_debit,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount
                        WHEN it.direction = 'DEBIT'  THEN -it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount ELSE 0 END), 0)
    END AS net,
    -- pending: em competência = ainda não pago dentro do período
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_debit
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE
    it.organization_id = p_organization_id
    AND (
      CASE WHEN p_regime = 'COMPETENCIA'
           THEN COALESCE(it.competencia_date, it.transaction_date::date)
           ELSE it.transaction_date::date
      END
    ) BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
    AND (p_empresa_id IS NULL OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = it.project_id AND p.empresa_id = p_empresa_id))
  GROUP BY 1, 2, 3, 4
  ORDER BY 3, 4;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre(UUID, DATE, DATE, UUID, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. fn_dre_summary — adiciona p_regime
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_dre_summary(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.fn_dre_summary(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_dre_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_project_id      UUID DEFAULT NULL,
  p_regime          TEXT DEFAULT 'CAIXA'
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
      AND (
        CASE WHEN p_regime = 'COMPETENCIA'
             THEN COALESCE(it.competencia_date, it.transaction_date::date)
             ELSE it.transaction_date::date
        END
      ) BETWEEN p_date_from AND p_date_to
      AND it.status <> 'CANCELLED'
      AND (p_project_id IS NULL OR it.project_id = p_project_id)
  ),
  agg AS (
    SELECT
      dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN direction='CREDIT' THEN  amount
                 WHEN direction='DEBIT'  THEN -amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
                 WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END)
      END AS realizado,
      SUM(CASE WHEN direction='CREDIT' AND status='PENDING' THEN  amount
               WHEN direction='DEBIT'  AND status='PENDING' THEN -amount ELSE 0 END) AS previsto
    FROM base GROUP BY dre_group
  )
  SELECT 'Receita Bruta' AS linha,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA' THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Deduções',
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= Receita Líquida',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Custos Diretos',
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= Lucro Bruto',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Despesas Operacionais',
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= EBITDA',
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO','DESPESA_ADM','DESPESA_COMERCIAL') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Resultado Financeiro',
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(-) Impostos sobre Resultado',
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS' THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(+/-) Resultado Não Operacional',
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='NAO_OPERACIONAL' THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '= Resultado Líquido',
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO') THEN previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(!) Sem Classificação',
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0)
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_summary(UUID, DATE, DATE, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. fn_balancete — adiciona p_regime
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_balancete(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.fn_balancete(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_balancete(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_project_id      UUID DEFAULT NULL,
  p_regime          TEXT DEFAULT 'CAIXA'
)
RETURNS TABLE (
  category_id    UUID,
  category_name  TEXT,
  dre_group      TEXT,
  nature         TEXT,
  sort_order     INT,
  creditos       NUMERIC,
  debitos        NUMERIC,
  saldo_liquido  NUMERIC,
  n_transacoes   BIGINT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    fc.id                                                            AS category_id,
    COALESCE(fc.name, it.category, '(Sem Categoria)')               AS category_name,
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')                     AS dre_group,
    COALESCE(fc.nature,    'EXPENSE')                               AS nature,
    COALESCE(fc.sort_order, 99)                                     AS sort_order,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0)
    END AS creditos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount ELSE 0 END), 0)
    END AS debitos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount
                        WHEN it.direction = 'DEBIT'  THEN -it.amount ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount
                        ELSE 0 END), 0)
    END AS saldo_liquido,
    COUNT(*)                                                         AS n_transacoes
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE it.organization_id = p_organization_id
    AND it.status != 'CANCELLED'
    AND (
      CASE WHEN p_regime = 'COMPETENCIA'
           THEN COALESCE(it.competencia_date, it.transaction_date::date)
           ELSE it.transaction_date::date
      END
    ) BETWEEN p_date_from AND p_date_to
    AND (p_project_id IS NULL OR it.project_id = p_project_id)
  GROUP BY
    fc.id,
    COALESCE(fc.name, it.category, '(Sem Categoria)'),
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO'),
    COALESCE(fc.nature,    'EXPENSE'),
    COALESCE(fc.sort_order, 99)
  ORDER BY
    COALESCE(fc.sort_order, 99),
    COALESCE(fc.name, it.category, '(Sem Categoria)')
$$;

GRANT EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. fn_dre_spe_summary — DRE consolidado por empresa/SPE
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_dre_spe_summary(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_regime          TEXT DEFAULT 'CAIXA'
)
RETURNS TABLE (
  empresa_id             UUID,
  empresa_nome           TEXT,
  receita_bruta          NUMERIC,
  deducoes               NUMERIC,
  receita_liquida        NUMERIC,
  custos_diretos         NUMERIC,
  lucro_bruto            NUMERIC,
  despesas_operacionais  NUMERIC,
  ebitda                 NUMERIC,
  resultado_financeiro   NUMERIC,
  impostos               NUMERIC,
  resultado_liquido      NUMERIC,
  n_transacoes           BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH txs AS (
    SELECT
      p.empresa_id,
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    JOIN public.projects p ON p.id = it.project_id
    WHERE it.organization_id = p_organization_id
      AND p.empresa_id IS NOT NULL
      AND it.status <> 'CANCELLED'
      AND (
        CASE WHEN p_regime = 'COMPETENCIA'
             THEN COALESCE(it.competencia_date, it.transaction_date::date)
             ELSE it.transaction_date::date
        END
      ) BETWEEN p_date_from AND p_date_to
  ),
  agg AS (
    SELECT
      empresa_id,
      dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN direction='CREDIT' THEN  amount WHEN direction='DEBIT' THEN -amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN direction='CREDIT' AND status='CONCILIATED' THEN  amount
                 WHEN direction='DEBIT'  AND status='CONCILIATED' THEN -amount ELSE 0 END)
      END AS net,
      COUNT(*) AS n
    FROM txs
    GROUP BY empresa_id, dre_group
  )
  SELECT
    a.empresa_id,
    COALESCE(c.nome_fantasia, c.razao_social, a.empresa_id::text) AS empresa_nome,
    COALESCE(SUM(CASE WHEN dre_group='RECEITA_BRUTA'       THEN net  ELSE 0 END),0) AS receita_bruta,
    COALESCE(SUM(CASE WHEN dre_group='DEDUCOES'            THEN -net ELSE 0 END),0) AS deducoes,
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES')
                      THEN net ELSE 0 END),0) AS receita_liquida,
    COALESCE(SUM(CASE WHEN dre_group IN ('CUSTO_OBRA','CUSTO_SERVICO') THEN -net ELSE 0 END),0) AS custos_diretos,
    COALESCE(SUM(CASE WHEN dre_group IN ('RECEITA_BRUTA','DEDUCOES','CUSTO_OBRA','CUSTO_SERVICO')
                      THEN net ELSE 0 END),0) AS lucro_bruto,
    COALESCE(SUM(CASE WHEN dre_group IN ('DESPESA_ADM','DESPESA_COMERCIAL') THEN -net ELSE 0 END),0) AS despesas_operacionais,
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('FINANCEIRO','IMPOSTOS','NAO_OPERACIONAL','SEM_CLASSIFICACAO')
                      THEN net ELSE 0 END),0) AS ebitda,
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO'      THEN -net ELSE 0 END),0) AS resultado_financeiro,
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS'        THEN -net ELSE 0 END),0) AS impostos,
    COALESCE(SUM(CASE WHEN dre_group <> 'SEM_CLASSIFICACAO' THEN net ELSE 0 END),0) AS resultado_liquido,
    SUM(a.n) AS n_transacoes
  FROM agg a
  LEFT JOIN public.companies c ON c.id = a.empresa_id
  GROUP BY a.empresa_id, c.nome_fantasia, c.razao_social
  ORDER BY receita_bruta DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_spe_summary(UUID, DATE, DATE, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. fn_project_wip — Work In Progress por obra
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_project_wip(
  p_organization_id UUID,
  p_date_to         DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  project_id           UUID,
  project_name         TEXT,
  project_code         TEXT,
  empresa_id           UUID,
  empresa_nome         TEXT,
  contrato_valor       NUMERIC,  -- settings.financialInfo.totalValue
  custo_incorrido      NUMERIC,  -- DEBIT CONCILIATED acumulado até p_date_to
  receita_reconhecida  NUMERIC,  -- CREDIT CONCILIATED acumulado até p_date_to
  custos_pendentes     NUMERIC,  -- DEBIT PENDING
  receitas_pendentes   NUMERIC,  -- CREDIT PENDING
  saldo_contrato       NUMERIC,  -- contrato_valor - receita_reconhecida
  margem_bruta         NUMERIC,  -- receita_reconhecida - custo_incorrido
  margem_pct           NUMERIC   -- margem_bruta / receita_reconhecida * 100
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH financials AS (
    SELECT
      it.project_id,
      SUM(CASE WHEN it.direction='DEBIT'  AND it.status='CONCILIATED' THEN it.amount ELSE 0 END) AS custo_incorrido,
      SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount ELSE 0 END) AS receita_reconhecida,
      SUM(CASE WHEN it.direction='DEBIT'  AND it.status='PENDING'     THEN it.amount ELSE 0 END) AS custos_pendentes,
      SUM(CASE WHEN it.direction='CREDIT' AND it.status='PENDING'     THEN it.amount ELSE 0 END) AS receitas_pendentes
    FROM public.internal_transactions it
    WHERE it.organization_id = p_organization_id
      AND it.project_id IS NOT NULL
      AND it.status <> 'CANCELLED'
      AND it.transaction_date::date <= p_date_to
    GROUP BY it.project_id
  )
  SELECT
    p.id                                                             AS project_id,
    p.name                                                           AS project_name,
    p.code                                                           AS project_code,
    p.empresa_id,
    COALESCE(c.nome_fantasia, c.razao_social)                        AS empresa_nome,
    COALESCE((p.settings->'financialInfo'->>'totalValue')::numeric, 0) AS contrato_valor,
    COALESCE(f.custo_incorrido,     0)                               AS custo_incorrido,
    COALESCE(f.receita_reconhecida, 0)                               AS receita_reconhecida,
    COALESCE(f.custos_pendentes,    0)                               AS custos_pendentes,
    COALESCE(f.receitas_pendentes,  0)                               AS receitas_pendentes,
    COALESCE((p.settings->'financialInfo'->>'totalValue')::numeric, 0)
      - COALESCE(f.receita_reconhecida, 0)                           AS saldo_contrato,
    COALESCE(f.receita_reconhecida, 0) - COALESCE(f.custo_incorrido, 0) AS margem_bruta,
    CASE
      WHEN COALESCE(f.receita_reconhecida, 0) = 0 THEN NULL
      ELSE ROUND(
        (COALESCE(f.receita_reconhecida, 0) - COALESCE(f.custo_incorrido, 0))
        / COALESCE(f.receita_reconhecida, 0) * 100
      , 1)
    END AS margem_pct
  FROM public.projects p
  LEFT JOIN financials f ON f.project_id = p.id
  LEFT JOIN public.companies c ON c.id = p.empresa_id
  WHERE p.organization_id = p_organization_id
    AND p.tipo_obra IS NOT NULL
    AND p.tipo_obra NOT IN ('ORCAMENTO', 'PLANEJAMENTO')
    AND p.name NOT ILIKE '%gestão comercial%'
    AND (f.custo_incorrido > 0 OR f.receita_reconhecida > 0
         OR (p.settings->'financialInfo'->>'totalValue')::numeric > 0)
  ORDER BY COALESCE(f.receita_reconhecida, 0) DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_project_wip(UUID, DATE) TO authenticated;
