-- ============================================================
-- Relatórios Financeiros — suporta "Todas as Organizações"
-- (p_organization_id NULL) nas RPCs de financialReportService
-- OrçaCloud SaaS · Migration 20270128000000
--
-- Mesmo contexto de 20270126000000 (BI) e 20270127000000 (ÒPURA
-- Analytics). Todas as 8 funções abaixo são agregações amplas sobre
-- internal_transactions/projects (sem entidade única já selecionada
-- que restrinja a organização sozinha), então recebem o mesmo
-- tratamento do BI: calcular as organizações do usuário (v_org_ids),
-- validar posse de p_organization_id quando informado, e agregar por
-- ANY(v_targets) quando NULL. Nenhuma é SECURITY DEFINER — a RLS de
-- internal_transactions/projects continua sendo a proteção de fundo.
--
-- Funções: fn_dre, fn_dre_summary, fn_balancete, fn_dre_spe_summary,
-- fn_project_wip, fn_list_obras, fn_dre_projects_summary, fn_cash_flow.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. fn_dre
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dre(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_empresa_id      UUID    DEFAULT NULL,
  p_project_id      UUID    DEFAULT NULL,
  p_regime          TEXT    DEFAULT 'CAIXA'
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
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  SELECT
    COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')     AS dre_group,
    COALESCE(fc.nature, 'EXPENSE')                   AS nature,
    COALESCE(fc.sort_order, 99)                      AS sort_order,
    COALESCE(fc.name, it.category, 'Sem categoria')  AS category_name,
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
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount ELSE 0 END), 0) AS pending_debit
  FROM public.internal_transactions it
  LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
  WHERE
    it.organization_id = ANY(v_targets)
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre(UUID, DATE, DATE, UUID, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. fn_dre_summary
-- ────────────────────────────────────────────────────────────
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
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH base AS (
    SELECT
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO') AS dre_group,
      it.direction,
      it.status,
      it.amount
    FROM public.internal_transactions it
    LEFT JOIN public.financial_categories fc ON fc.id = it.category_id
    WHERE it.organization_id = ANY(v_targets)
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_summary(UUID, DATE, DATE, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. fn_balancete
-- ────────────────────────────────────────────────────────────
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
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
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
  WHERE it.organization_id = ANY(v_targets)
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
    COALESCE(fc.name, it.category, '(Sem Categoria)');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. fn_dre_spe_summary
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
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
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
    WHERE it.organization_id = ANY(v_targets)
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dre_spe_summary(UUID, DATE, DATE, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. fn_project_wip
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
  contrato_valor       NUMERIC,
  custo_incorrido      NUMERIC,
  receita_reconhecida  NUMERIC,
  custos_pendentes     NUMERIC,
  receitas_pendentes   NUMERIC,
  saldo_contrato       NUMERIC,
  margem_bruta         NUMERIC,
  margem_pct           NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH financials AS (
    SELECT
      it.project_id,
      SUM(CASE WHEN it.direction='DEBIT'  AND it.status='CONCILIATED' THEN it.amount ELSE 0 END) AS custo_incorrido,
      SUM(CASE WHEN it.direction='CREDIT' AND it.status='CONCILIATED' THEN it.amount ELSE 0 END) AS receita_reconhecida,
      SUM(CASE WHEN it.direction='DEBIT'  AND it.status='PENDING'     THEN it.amount ELSE 0 END) AS custos_pendentes,
      SUM(CASE WHEN it.direction='CREDIT' AND it.status='PENDING'     THEN it.amount ELSE 0 END) AS receitas_pendentes
    FROM public.internal_transactions it
    WHERE it.organization_id = ANY(v_targets)
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
  WHERE p.organization_id = ANY(v_targets)
    AND p.tipo_obra IS NOT NULL
    AND p.tipo_obra NOT IN ('ORCAMENTO', 'PLANEJAMENTO')
    AND p.name NOT ILIKE '%gestão comercial%'
    AND (f.custo_incorrido > 0 OR f.receita_reconhecida > 0
         OR (p.settings->'financialInfo'->>'totalValue')::numeric > 0)
  ORDER BY COALESCE(f.receita_reconhecida, 0) DESC, p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_project_wip(UUID, DATE) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. fn_list_obras
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_list_obras(
  p_organization_id UUID
)
RETURNS TABLE (
  project_id   UUID,
  project_name TEXT,
  code         TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  SELECT p.id, p.name, p.code
  FROM public.projects p
  WHERE (
          p.organization_id = ANY(v_targets)
          OR (p.organization_id IS NULL
              AND (p.settings->>'organizationId')::uuid = ANY(v_targets))
        )
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA')
        NOT IN ('ORCAMENTO', 'PLANEJAMENTO', 'DIARIO')
  ORDER BY p.name;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. fn_dre_projects_summary
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
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
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
  WHERE it.organization_id = ANY(v_targets)
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
  GROUP BY p.id, p.name
  HAVING SUM(it.amount) <> 0
  ORDER BY receita DESC, custo DESC;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 8. fn_cash_flow
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cash_flow(
  p_organization_id UUID,
  p_date_from       DATE,
  p_date_to         DATE,
  p_granularity     TEXT DEFAULT 'month'
)
RETURNS TABLE (
  period_start    DATE,
  period_label    TEXT,
  credit_real     NUMERIC,
  debit_real      NUMERIC,
  saldo_real      NUMERIC,
  credit_prev     NUMERIC,
  debit_prev      NUMERIC,
  saldo_prev      NUMERIC,
  saldo_acumulado NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ids UUID[];
  v_targets UUID[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  RETURN QUERY
  WITH periods AS (
    SELECT
      generate_series(
        date_trunc(p_granularity, p_date_from::TIMESTAMPTZ),
        date_trunc(p_granularity, p_date_to::TIMESTAMPTZ),
        ('1 ' || p_granularity)::INTERVAL
      )::DATE AS period_start
  ),
  txs AS (
    SELECT
      date_trunc(p_granularity, transaction_date::TIMESTAMPTZ)::DATE AS period_start,
      direction,
      status,
      amount
    FROM public.internal_transactions
    WHERE organization_id = ANY(v_targets)
      AND transaction_date BETWEEN p_date_from AND p_date_to
      AND status <> 'CANCELLED'
  ),
  agg AS (
    SELECT
      p.period_start,
      COALESCE(SUM(CASE WHEN t.direction='CREDIT' AND t.status='CONCILIATED' THEN t.amount ELSE 0 END),0) AS cr,
      COALESCE(SUM(CASE WHEN t.direction='DEBIT'  AND t.status='CONCILIATED' THEN t.amount ELSE 0 END),0) AS dr,
      COALESCE(SUM(CASE WHEN t.direction='CREDIT' AND t.status='PENDING'     THEN t.amount ELSE 0 END),0) AS cp,
      COALESCE(SUM(CASE WHEN t.direction='DEBIT'  AND t.status='PENDING'     THEN t.amount ELSE 0 END),0) AS dp
    FROM periods p
    LEFT JOIN txs t ON t.period_start = p.period_start
    GROUP BY p.period_start
  )
  SELECT
    a.period_start,
    TO_CHAR(a.period_start, CASE p_granularity
      WHEN 'day'   THEN 'DD/MM/YYYY'
      WHEN 'week'  THEN 'WW/YYYY'
      ELSE              'MM/YYYY'
    END)                                              AS period_label,
    a.cr                                              AS credit_real,
    a.dr                                              AS debit_real,
    a.cr - a.dr                                       AS saldo_real,
    a.cp                                              AS credit_prev,
    a.dp                                              AS debit_prev,
    a.cp - a.dp                                       AS saldo_prev,
    SUM(a.cr - a.dr) OVER (ORDER BY a.period_start)  AS saldo_acumulado
  FROM agg a
  ORDER BY a.period_start;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FIM: 20270128000000_financial_reports_todas_organizacoes.sql
-- ────────────────────────────────────────────────────────────
