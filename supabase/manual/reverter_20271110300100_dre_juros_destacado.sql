-- =====================================================================
-- REVERTER aplicar_20271110300100_dre_juros_destacado.sql
-- (DRE e Balancete separam os juros da venda parcelada)
--
-- O QUE É: os corpos de fn_balancete, fn_dre, fn_dre_projects_summary,
-- fn_dre_spe_summary e fn_dre_summary como estavam em PRODUÇÃO antes da
-- migration — extraídos com pg_get_functiondef em 10/11/2026, lidos como
-- UTF-8 (não dos arquivos antigos de migration). No fim, derruba a view
-- v_internal_transactions_dre (depois de as funções deixarem de lê-la).
--
-- QUANDO USAR: só se a DRE/Balancete ficar errada depois da migration e for
-- preciso voltar ao comportamento anterior (juros somados na categoria da
-- venda) enquanto se investiga. As colunas interest_amount /
-- interest_category_id de internal_transactions NÃO são tocadas — os títulos
-- continuam com a parte de juros gravada; só a leitura da DRE volta a ignorá-la.
--
-- COMO: npx supabase db query --linked -f supabase/manual/reverter_20271110300100_dre_juros_destacado.sql
--       (nunca `supabase db push`). Idempotente: pode rodar mais de uma vez.
--
-- POR QUE AQUI e não em supabase/migrations/: __tests__/migrationsPrefixo.test.ts
-- exige que todo .sql daquela pasta comece com (aplicar_)?<14 dígitos>_ — um
-- `reverter_...` lá quebra o teste, e um nome `aplicar_...` para um arquivo de
-- reversão convidaria alguém a "aplicar a pendente" e desfazer a mudança.
-- A ACL das funções não muda com CREATE OR REPLACE; os GRANT/REVOKE no fim
-- só reafirmam o que a migration reafirmou.
-- =====================================================================


CREATE OR REPLACE FUNCTION public.fn_balancete(p_organization_id uuid, p_date_from date, p_date_to date, p_project_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(category_id uuid, category_name text, dre_group text, nature text, sort_order integer, creditos numeric, debitos numeric, saldo_liquido numeric, n_transacoes bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_dre(p_organization_id uuid, p_date_from date, p_date_to date, p_empresa_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(dre_group text, nature text, sort_order integer, category_name text, total_credit numeric, total_debit numeric, net numeric, pending_credit numeric, pending_debit numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id
    OR (it.category_id IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_dre_projects_summary(p_organization_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(project_id uuid, project_name text, receita numeric, custo numeric, margem numeric, receita_prev numeric, custo_prev numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- 🔴 Movimento patrimonial fora da margem: a amortização não é custo da
    -- obra, e a liberação do financiamento não é receita dela.
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED'
                       AND COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') NOT IN ('PASSIVO','ATIVO')
                      THEN CASE WHEN it.direction = 'CREDIT' THEN it.amount ELSE -it.amount END
                      ELSE 0 END), 0) AS margem,
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_dre_spe_summary(p_organization_id uuid, p_date_from date, p_date_to date, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(empresa_id uuid, empresa_nome text, receita_bruta numeric, deducoes numeric, receita_liquida numeric, custos_diretos numeric, lucro_bruto numeric, despesas_operacionais numeric, ebitda numeric, resultado_financeiro numeric, impostos numeric, resultado_liquido numeric, n_transacoes bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    LEFT JOIN public.financial_categories fc
      ON fc.id = it.category_id
      OR (it.category_id IS NULL
          AND fc.organization_id = it.organization_id
          AND lower(fc.name) = lower(it.category))
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
      t.empresa_id,
      t.dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN t.direction='CREDIT' THEN  t.amount WHEN t.direction='DEBIT' THEN -t.amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN t.direction='CREDIT' AND t.status='CONCILIATED' THEN  t.amount
                 WHEN t.direction='DEBIT'  AND t.status='CONCILIATED' THEN -t.amount ELSE 0 END)
      END AS net,
      COUNT(*) AS n
    FROM txs t
    GROUP BY t.empresa_id, t.dre_group
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
    -- 🔴 PASSIVO/ATIVO entram no NOT IN: amortização de principal não é item
    -- operacional e não pode inflar (nem deprimir) o EBITDA.
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('FINANCEIRO','IMPOSTOS','NAO_OPERACIONAL','SEM_CLASSIFICACAO','PASSIVO','ATIVO')
                      THEN net ELSE 0 END),0) AS ebitda,
    COALESCE(SUM(CASE WHEN dre_group='FINANCEIRO'      THEN -net ELSE 0 END),0) AS resultado_financeiro,
    COALESCE(SUM(CASE WHEN dre_group='IMPOSTOS'        THEN -net ELSE 0 END),0) AS impostos,
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN net ELSE 0 END),0) AS resultado_liquido,
    -- 🔴 SUM(bigint) devolve numeric; a coluna declarada é BIGINT (42804).
    -- Segundo defeito latente, escondido pelo 42702 que nunca deixou chegar aqui.
    SUM(a.n)::BIGINT AS n_transacoes
  FROM agg a
  LEFT JOIN public.companies c ON c.id = a.empresa_id
  GROUP BY a.empresa_id, c.nome_fantasia, c.razao_social
  ORDER BY receita_bruta DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_dre_summary(p_organization_id uuid, p_date_from date, p_date_to date, p_project_id uuid DEFAULT NULL::uuid, p_regime text DEFAULT 'CAIXA'::text)
 RETURNS TABLE(linha text, valor_realizado numeric, valor_previsto numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    LEFT JOIN public.financial_categories fc
      ON fc.id = it.category_id
      OR (it.category_id IS NULL
          AND fc.organization_id = it.organization_id
          AND lower(fc.name) = lower(it.category))
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
  -- 🔴 AQUI: PASSIVO e ATIVO fora. Amortização de principal reduz dívida, não
  -- resultado. Antes, uma parcela de financiamento derrubava o lucro pelo
  -- valor cheio da parcela.
  UNION ALL SELECT '= Resultado Líquido',
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN previsto  ELSE 0 END),0)
  FROM agg
  -- Linha memo: sai do resultado, mas não some da tela. É saída de caixa real
  -- e quem lê a DRE precisa vê-la para conciliar com o fluxo.
  UNION ALL SELECT '(o) Amortização de Principal',
    COALESCE(SUM(CASE WHEN dre_group IN ('PASSIVO','ATIVO') THEN -realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group IN ('PASSIVO','ATIVO') THEN -previsto  ELSE 0 END),0)
  FROM agg
  UNION ALL SELECT '(!) Sem Classificação',
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN realizado ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN dre_group='SEM_CLASSIFICACAO' THEN previsto  ELSE 0 END),0)
  FROM agg;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_dre(UUID, DATE, DATE, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_dre(UUID, DATE, DATE, UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dre_summary(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_dre_summary(UUID, DATE, DATE, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_balancete(UUID, DATE, DATE, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dre_spe_summary(UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_dre_spe_summary(UUID, DATE, DATE, TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_dre_projects_summary(UUID, DATE, DATE) TO authenticated;

-- As cinco funções acima já não leem a view (plpgsql não registra
-- dependência, por isso o DROP não precisa de CASCADE e não derruba nada).
DROP VIEW IF EXISTS public.v_internal_transactions_dre;
