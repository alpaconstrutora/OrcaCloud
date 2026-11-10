-- ==========================================================================
-- DRE e Balancete separam os juros da venda parcelada
-- Date: 2026-11-10 · Frente feat/negociacao-juros-parcelamento (Task 5 de 6)
-- Funções alteradas: fn_dre, fn_dre_summary, fn_balancete, fn_dre_spe_summary,
--                    fn_dre_projects_summary
-- View nova: v_internal_transactions_dre
-- Reverter: supabase/manual/reverter_20271110300100_dre_juros_destacado.sql
-- Conferência: scripts/teste-dre-juros-destacado.sql (antes = falha nos juros,
--              depois = tudo ok) e scripts/conferencia-dre-antes-depois.sql
--              (DRE real das orgs, mês corrente e anterior, antes × depois).
--
-- ⚠️ Aplicar com `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push`. Idempotente (CREATE OR REPLACE em tudo).
-- ==========================================================================
-- CONTEXTO
--
-- A venda parcelada com juros (Price/SAC) grava UM título por parcela em
-- internal_transactions: `amount` = parcela cheia (principal + juros),
-- `interest_amount` = parte de juros e `interest_category_id` = categoria
-- "Receita Financeira" (nula quando a org não tem essa categoria). Sem esta
-- migration a DRE somava a parcela cheia na categoria da venda (Receita
-- Bruta) — os juros inflavam a receita operacional e o EBITDA.
--
-- COMO: as cinco funções passam a ler a view v_internal_transactions_dre em
-- vez da tabela. A view "explode" cada título com juros em duas linhas:
--   · linha principal: categoria do título, amount_dre = amount − juros
--   · linha de juros : categoria de juros,  amount_dre = juros
-- Contrato: para todo título, Σ amount_dre das suas linhas = amount. Título
-- sem juros (ou sem categoria de juros) = uma linha, amount_dre = amount —
-- por isso a DRE de quem não tem juros não muda em nada.
--
-- Corpos das funções: os de PRODUÇÃO (pg_get_functiondef de 10/11/2026, lido
-- como UTF-8 — o mesmo texto do arquivo de reversão), com só estas trocas:
--   FROM/JOIN public.internal_transactions it → public.v_internal_transactions_dre it
--   it.amount                                  → it.amount_dre
--   fc.id = it.category_id e a perna "it.category_id IS NULL" do fallback
--   por nome                                   → it.category_id_dre
-- A perna "IS NULL" também usa category_id_dre: a linha de juros sempre tem
-- categoria (id), então nunca cai no fallback por nome do título.
-- Filtros de status/direção/datas/obra ficam nas MESMAS colunas: as duas
-- linhas de um título carregam status, direção, datas e obra do título —
-- um título CANCELLED some inteiro (as duas linhas) pelo filtro que já existia.
-- Nas CTEs de fn_dre_summary e fn_dre_spe_summary a coluna sai como
-- `it.amount_dre AS amount`, para o resto do corpo ficar idêntico.
--
-- Única mudança além das trocas: fn_dre_spe_summary.n_transacoes conta
-- TÍTULOS (`FILTER (WHERE NOT parte_juros)`), não linhas da view. No
-- fn_balancete o n_transacoes continua COUNT(*) POR CATEGORIA — a linha
-- "Receita Financeira" conta os títulos cujos juros caíram nela (o total
-- somado pela tela passa a contar a parcela com juros duas vezes).
--
-- RPC/VIEW = REVOKE de anon: a view nasce com REVOKE de anon e PUBLIC. As
-- funções são SECURITY INVOKER — quem chama precisa de SELECT na view, e o
-- `security_invoker` faz a RLS de internal_transactions valer por baixo.
-- GRANT/REVOKE das funções reafirmados como nas migrations
-- aplicar_20270921000029 e aplicar_20270915000003 (CREATE OR REPLACE não
-- muda a ACL; reafirmar só documenta).
-- ==========================================================================

-- ────────────────────────────────────────────────────────────
-- 1. View: um título vira 1 linha (sem juros) ou 2 (principal + juros)
-- ────────────────────────────────────────────────────────────
-- Colunas LISTADAS, não `it.*`: (a) com `*`, o próximo ALTER TABLE que
-- acrescentar coluna em internal_transactions faz este CREATE OR REPLACE
-- VIEW falhar ao ser reexecutado (a coluna nova entra antes de amount_dre e
-- o Postgres recusa trocar nome/posição de coluna de view) — a migration
-- deixaria de ser idempotente; (b) a view só expõe o que a DRE usa. Entram
-- as colunas que as cinco funções leem (organization_id, project_id,
-- direction, status, transaction_date, competencia_date, category,
-- category_id_dre, amount_dre) + id, amount, category_id, interest_amount,
-- interest_category_id e parte_juros para conferência e diagnóstico
-- (Σ amount_dre por id = amount).
--
-- Condição da linha de juros: interest_category_id NOT NULL, interest_amount
-- > 0 e amount > 0. A parte de juros é LEAST(interest_amount, amount) — juros
-- maiores que a parcela (dado inconsistente) não geram principal negativo:
-- a parcela inteira vai para juros e o principal fica 0. `amount > 0` evita
-- uma "linha de juros" negativa em título de valor zero/negativo.
CREATE OR REPLACE VIEW public.v_internal_transactions_dre
WITH (security_invoker = true) AS
SELECT
  it.id,
  it.organization_id,
  it.project_id,
  it.direction,
  it.status,
  it.transaction_date,
  it.competencia_date,
  it.category,
  it.category_id,
  it.amount,
  it.interest_amount,
  it.interest_category_id,
  false AS parte_juros,
  CASE WHEN it.interest_category_id IS NOT NULL
        AND it.interest_amount > 0
        AND it.amount > 0
       THEN it.amount - LEAST(it.interest_amount, it.amount)
       ELSE it.amount
  END                AS amount_dre,
  it.category_id     AS category_id_dre
FROM public.internal_transactions it
UNION ALL
SELECT
  it.id,
  it.organization_id,
  it.project_id,
  it.direction,
  it.status,
  it.transaction_date,
  it.competencia_date,
  it.category,
  it.category_id,
  it.amount,
  it.interest_amount,
  it.interest_category_id,
  true AS parte_juros,
  LEAST(it.interest_amount, it.amount) AS amount_dre,
  it.interest_category_id              AS category_id_dre
FROM public.internal_transactions it
WHERE it.interest_category_id IS NOT NULL
  AND it.interest_amount > 0
  AND it.amount > 0;

COMMENT ON VIEW public.v_internal_transactions_dre IS
'Títulos de internal_transactions para DRE/Balancete com os juros destacados: título com interest_amount > 0 e interest_category_id vira 2 linhas (principal na categoria do título, juros na categoria de juros); os demais, 1 linha. Σ amount_dre por id = amount. Lida por fn_dre, fn_dre_summary, fn_balancete, fn_dre_spe_summary e fn_dre_projects_summary (migration aplicar_20271110300100).';

REVOKE ALL ON public.v_internal_transactions_dre FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.v_internal_transactions_dre TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. As cinco funções (corpo de produção + trocas acima)
-- ────────────────────────────────────────────────────────────

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
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS creditos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS debitos,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  THEN -it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount_dre
                        ELSE 0 END), 0)
    END AS saldo_liquido,
    COUNT(*)                                                         AS n_transacoes
  FROM public.v_internal_transactions_dre it
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id_dre
    OR (it.category_id_dre IS NULL
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
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS total_credit,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  THEN it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0)
    END AS total_debit,
    CASE WHEN p_regime = 'COMPETENCIA' THEN
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  THEN -it.amount_dre ELSE 0 END), 0)
    ELSE
      COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN  it.amount_dre
                        WHEN it.direction = 'DEBIT'  AND it.status = 'CONCILIATED' THEN -it.amount_dre ELSE 0 END), 0)
    END AS net,
    COALESCE(SUM(CASE WHEN it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount_dre ELSE 0 END), 0) AS pending_credit,
    COALESCE(SUM(CASE WHEN it.direction = 'DEBIT'  AND it.status = 'PENDING' THEN it.amount_dre ELSE 0 END), 0) AS pending_debit
  FROM public.v_internal_transactions_dre it
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id_dre
    OR (it.category_id_dre IS NULL
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
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0) AS receita,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'CONCILIATED' THEN it.amount_dre ELSE 0 END), 0) AS custo,
    -- 🔴 Movimento patrimonial fora da margem: a amortização não é custo da
    -- obra, e a liberação do financiamento não é receita dela.
    COALESCE(SUM(CASE WHEN it.status = 'CONCILIATED'
                       AND COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') NOT IN ('PASSIVO','ATIVO')
                      THEN CASE WHEN it.direction = 'CREDIT' THEN it.amount_dre ELSE -it.amount_dre END
                      ELSE 0 END), 0) AS margem,
    COALESCE(SUM(CASE WHEN fc.nature = 'REVENUE' AND it.direction = 'CREDIT' AND it.status = 'PENDING' THEN it.amount_dre ELSE 0 END), 0) AS receita_prev,
    COALESCE(SUM(CASE WHEN COALESCE(fc.nature,'EXPENSE') IN ('COST','EXPENSE') AND it.direction = 'DEBIT' AND it.status = 'PENDING' THEN it.amount_dre ELSE 0 END), 0) AS custo_prev
  FROM public.projects p
  JOIN public.v_internal_transactions_dre it ON it.project_id = p.id
  LEFT JOIN public.financial_categories fc
    ON fc.id = it.category_id_dre
    OR (it.category_id_dre IS NULL
        AND fc.organization_id = it.organization_id
        AND lower(fc.name) = lower(it.category))
  WHERE it.organization_id = ANY(v_targets)
    AND it.transaction_date BETWEEN p_date_from AND p_date_to
    AND it.status <> 'CANCELLED'
    AND p.name <> 'Gestão Comercial'
    AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
  GROUP BY p.id, p.name
  HAVING SUM(it.amount_dre) <> 0
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
      it.amount_dre AS amount,
      it.parte_juros
    FROM public.v_internal_transactions_dre it
    LEFT JOIN public.financial_categories fc
      ON fc.id = it.category_id_dre
      OR (it.category_id_dre IS NULL
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
      -- Conta TÍTULOS, não linhas da view: a parte de juros de um título é a
      -- 2ª linha dele na view e não pode virar "mais um lançamento" da SPE.
      COUNT(*) FILTER (WHERE NOT t.parte_juros) AS n
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
      it.amount_dre AS amount
    FROM public.v_internal_transactions_dre it
    LEFT JOIN public.financial_categories fc
      ON fc.id = it.category_id_dre
      OR (it.category_id_dre IS NULL
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
-- fn_dre_projects_summary: a última migration que a tocou
-- (aplicar_20270915000003) só fez o GRANT; repito só o GRANT para não mudar
-- a ACL fora do escopo desta frente.
GRANT  EXECUTE ON FUNCTION public.fn_dre_projects_summary(UUID, DATE, DATE) TO authenticated;
