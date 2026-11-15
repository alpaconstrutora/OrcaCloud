-- Controladoria › DRE › "Por Obra" passa a FECHAR com o Resumo da DRE.
-- Plano: docs/planos/2026-11-14-controladoria-critica.md (passo 1, item 1.5).
--
-- O que estava errado (medido em produção, 14/11/2026, crítica /impeccable):
--   1. Sem regime: a função não recebia p_regime e contava sempre o conciliado
--      (Caixa). Trocar a DRE para Competência não mudava a tabela "Por Obra".
--   2. Sem a linha "sem obra": só entravam lançamentos COM obra, então o total
--      (R$ 1.002,90 de custo) nunca batia com os Custos Diretos do Resumo (R$ 6.000).
--   3. "Custo" e "margem" tinham definições próprias (natureza COST/EXPENSE a débito;
--      margem incluindo Sem Classificação), diferentes das linhas da DRE.
--
-- Agora, por obra (e uma linha project_id = NULL, "Sem obra"):
--   receita = Receita Bruta            (mesma regra da linha 'Receita Bruta' de fn_dre_summary)
--   margem  = Resultado Líquido        (mesma regra de '= Resultado Líquido': fora
--                                       SEM_CLASSIFICACAO, PASSIVO e ATIVO)
--   custo   = receita − margem         (deduções + custos + despesas + financeiro +
--                                       impostos − não operacional)
--   receita_liquida = Receita Bruta + Deduções (coluna nova, no fim): é a base da
--                     margem %, a mesma da DRE e da DRE por SPE (utils/periodoControladoria.ts).
-- Somando todas as linhas, receita = Receita Bruta e margem = Resultado Líquido do Resumo,
-- no mesmo período, organização e regime.
--
-- "Obra" = o mesmo critério de fn_list_obras (o filtro de obra da DRE): não é o projeto de
-- sistema "Gestão Comercial" e a classificação não é ORCAMENTO/PLANEJAMENTO/DIARIO.
-- Lançamento sem projeto, ou em projeto que não é obra, cai em "Sem obra".
--
-- A assinatura ganha p_regime com DEFAULT. A versão antiga (3 parâmetros) precisa sair: com as
-- duas no banco, a chamada com 3 argumentos nomeados ficaria ambígua. O front publicado hoje chama
-- com 3 argumentos nomeados e continua funcionando com a nova (o regime cai no padrão CAIXA).

BEGIN;

DROP FUNCTION IF EXISTS public.fn_dre_projects_summary(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_dre_projects_summary(
  p_organization_id uuid,
  p_date_from       date,
  p_date_to         date,
  p_regime          text DEFAULT 'CAIXA'
)
 RETURNS TABLE(project_id uuid, project_name text, receita numeric, custo numeric, margem numeric, receita_prev numeric, custo_prev numeric, receita_liquida numeric)
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
      -- Obra pelo critério de fn_list_obras; o resto vira NULL ("Sem obra").
      CASE WHEN p.id IS NOT NULL
            AND p.name <> 'Gestão Comercial'
            AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
           THEN p.id END                                   AS obra_id,
      COALESCE(fc.dre_group, 'SEM_CLASSIFICACAO')          AS dre_group,
      it.direction,
      it.status,
      it.amount_dre                                        AS amount
    FROM public.v_internal_transactions_dre it
    LEFT JOIN public.projects p ON p.id = it.project_id
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
  ),
  -- Mesma conta de fn_dre_summary: realizado por regime, previsto = pendente.
  agg AS (
    SELECT
      b.obra_id,
      b.dre_group,
      CASE WHEN p_regime = 'COMPETENCIA' THEN
        SUM(CASE WHEN b.direction='CREDIT' THEN  b.amount
                 WHEN b.direction='DEBIT'  THEN -b.amount ELSE 0 END)
      ELSE
        SUM(CASE WHEN b.direction='CREDIT' AND b.status='CONCILIATED' THEN  b.amount
                 WHEN b.direction='DEBIT'  AND b.status='CONCILIATED' THEN -b.amount ELSE 0 END)
      END AS realizado,
      SUM(CASE WHEN b.direction='CREDIT' AND b.status='PENDING' THEN  b.amount
               WHEN b.direction='DEBIT'  AND b.status='PENDING' THEN -b.amount ELSE 0 END) AS previsto
    FROM base b
    GROUP BY b.obra_id, b.dre_group
  ),
  por_obra AS (
    SELECT
      a.obra_id,
      COALESCE(SUM(CASE WHEN a.dre_group = 'RECEITA_BRUTA' THEN a.realizado ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN a.dre_group IN ('RECEITA_BRUTA','DEDUCOES') THEN a.realizado ELSE 0 END), 0) AS rec_liquida,
      COALESCE(SUM(CASE WHEN a.dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN a.realizado ELSE 0 END), 0) AS margem,
      COALESCE(SUM(CASE WHEN a.dre_group = 'RECEITA_BRUTA' THEN a.previsto ELSE 0 END), 0) AS receita_prev,
      COALESCE(SUM(CASE WHEN a.dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO') THEN a.previsto ELSE 0 END), 0) AS margem_prev,
      -- Há movimento que conta no resultado? (linha só com Sem Classificação/Passivo não aparece)
      bool_or(a.dre_group NOT IN ('SEM_CLASSIFICACAO','PASSIVO','ATIVO')
              AND (a.realizado <> 0 OR a.previsto <> 0)) AS tem_movimento
    FROM agg a
    GROUP BY a.obra_id
  )
  SELECT
    o.obra_id,
    COALESCE(pr.name, 'Sem obra')::text,
    o.receita,
    o.receita - o.margem,
    o.margem,
    o.receita_prev,
    o.receita_prev - o.margem_prev,
    o.rec_liquida
  FROM por_obra o
  LEFT JOIN public.projects pr ON pr.id = o.obra_id
  WHERE o.tem_movimento
  -- "Sem obra" por último; obras por receita, depois custo.
  ORDER BY (o.obra_id IS NULL), o.receita DESC, (o.receita - o.margem) DESC;
END;
$function$;

-- REGRA #7: o PostgreSQL concede EXECUTE a PUBLIC por padrão; GRANT não revoga isso.
REVOKE EXECUTE ON FUNCTION public.fn_dre_projects_summary(uuid, date, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_dre_projects_summary(uuid, date, date, text) TO authenticated;

COMMIT;
