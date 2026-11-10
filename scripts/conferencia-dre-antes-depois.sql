-- scripts/conferencia-dre-antes-depois.sql
-- DRE real das organizações ANTES × DEPOIS de
-- supabase/migrations/aplicar_20271110300100_dre_juros_destacado.sql.
--
--   npx supabase db query --linked -o table -f scripts/conferencia-dre-antes-depois.sql > dre-antes.txt
--   (aplicar a migration)
--   npx supabase db query --linked -o table -f scripts/conferencia-dre-antes-depois.sql > dre-depois.txt
--   diff dre-antes.txt dre-depois.txt
--
-- Rodar os dois no MESMO DIA (o período é o mês corrente e o anterior a
-- partir de current_date) e sem ninguém lançando no meio — senão o diff
-- mostra lançamento novo, não efeito da migration.
--
-- O QUE SE ESPERA NO DIFF:
--   · titulos_com_juros = 0 → a linha inteira IGUAL.
--   · titulos_com_juros > 0 → iguais: dre_net, dre_credit, dre_debit,
--     dre_pend_*, resumo_resultado_liquido(_prev) (os juros só trocam de
--     categoria, o total não muda). Mudam: resumo_receita_bruta e
--     resumo_ebitda (caem pelo valor dos juros, que vão para o Resultado
--     Financeiro) e resumo_soma_linhas (impressão digital = soma de todas as
--     linhas do resumo, inclusive subtotais — muda quando valor troca de linha).
-- As duas linhas TOTAL (uma por regime) somam todas as orgs e os dois meses.
--
-- Somente leitura, dentro de BEGIN … ROLLBACK. Roda como postgres;
-- request.jwt.claims = desenvolvedor@ (membro de toda org) para as funções
-- passarem na checagem de acesso. Orgs em que ele NÃO é membro ficam de fora
-- (senão a função levantaria 'Acesso negado' e abortaria o script) — as
-- linhas TOTAL dizem quantas orgs entraram.
-- `db query` imprime só o resultado da última instrução com linhas: a SELECT
-- final, logo antes do ROLLBACK. Saída ordenada (org, período, regime).

BEGIN;

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', u.id,
                                    'email', 'desenvolvedor@alpaconstrutora.com.br',
                                    'role', 'authenticated')::text,
                  true),
       set_config('request.jwt.claim.sub', u.id::text, true)
  FROM auth.users u
 WHERE lower(u.email) = 'desenvolvedor@alpaconstrutora.com.br';

WITH u AS (
    SELECT id FROM auth.users WHERE lower(email) = 'desenvolvedor@alpaconstrutora.com.br' LIMIT 1
),
meses AS (
    SELECT 1 AS ordem, 'anterior' AS periodo,
           (date_trunc('month', current_date) - interval '1 month')::date AS d1,
           (date_trunc('month', current_date) - interval '1 day')::date   AS d2
    UNION ALL
    SELECT 2, 'corrente',
           date_trunc('month', current_date)::date,
           (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
),
regimes AS (
    SELECT unnest(ARRAY['CAIXA','COMPETENCIA']) AS regime
),
membro AS (
    SELECT DISTINCT om.organization_id
      FROM public.organization_members om CROSS JOIN u
     WHERE om.user_id = u.id
        OR (om.user_id IS NULL AND lower(om.email) = 'desenvolvedor@alpaconstrutora.com.br')
),
orgs AS (
    -- Org com QUALQUER título (por data de transação OU competência) no mês
    -- corrente ou no anterior.
    SELECT DISTINCT it.organization_id AS org_id
      FROM public.internal_transactions it
     WHERE it.organization_id IN (SELECT organization_id FROM membro)
       AND (   it.transaction_date::date BETWEEN (SELECT min(d1) FROM meses) AND (SELECT max(d2) FROM meses)
            OR it.competencia_date      BETWEEN (SELECT min(d1) FROM meses) AND (SELECT max(d2) FROM meses))
),
linhas AS (
    SELECT o.org_id,
           org.name                         AS org_nome,
           m.ordem, m.periodo, m.d1, r.regime,
           d.dre_net, d.dre_credit, d.dre_debit, d.dre_pend_credit, d.dre_pend_debit,
           s.resumo_receita_bruta, s.resumo_ebitda, s.resumo_resultado_liquido,
           s.resumo_resultado_liquido_prev, s.resumo_soma_linhas,
           j.titulos_com_juros
      FROM orgs o
      LEFT JOIN public.organizations org ON org.id = o.org_id
     CROSS JOIN meses m
     CROSS JOIN regimes r
     CROSS JOIN LATERAL (
         SELECT round(COALESCE(SUM(f.net), 0), 2)            AS dre_net,
                round(COALESCE(SUM(f.total_credit), 0), 2)   AS dre_credit,
                round(COALESCE(SUM(f.total_debit), 0), 2)    AS dre_debit,
                round(COALESCE(SUM(f.pending_credit), 0), 2) AS dre_pend_credit,
                round(COALESCE(SUM(f.pending_debit), 0), 2)  AS dre_pend_debit
           FROM public.fn_dre(o.org_id, m.d1, m.d2, NULL::uuid, NULL::uuid, r.regime) f
     ) d
     CROSS JOIN LATERAL (
         SELECT round(COALESCE(SUM(x.valor_realizado) FILTER (WHERE x.linha = 'Receita Bruta'), 0), 2)          AS resumo_receita_bruta,
                round(COALESCE(SUM(x.valor_realizado) FILTER (WHERE x.linha = '= EBITDA'), 0), 2)               AS resumo_ebitda,
                round(COALESCE(SUM(x.valor_realizado) FILTER (WHERE x.linha LIKE '= Resultado L%quido'), 0), 2) AS resumo_resultado_liquido,
                round(COALESCE(SUM(x.valor_previsto)  FILTER (WHERE x.linha LIKE '= Resultado L%quido'), 0), 2) AS resumo_resultado_liquido_prev,
                round(COALESCE(SUM(x.valor_realizado), 0), 2)                                                    AS resumo_soma_linhas
           FROM public.fn_dre_summary(o.org_id, m.d1, m.d2, NULL::uuid, r.regime) x
     ) s
     CROSS JOIN LATERAL (
         SELECT count(*) AS titulos_com_juros
           FROM public.internal_transactions it
          WHERE it.organization_id = o.org_id
            AND it.status <> 'CANCELLED'
            AND it.interest_category_id IS NOT NULL
            AND it.interest_amount > 0
            AND (CASE WHEN r.regime = 'COMPETENCIA'
                      THEN COALESCE(it.competencia_date, it.transaction_date::date)
                      ELSE it.transaction_date::date END) BETWEEN m.d1 AND m.d2
     ) j
)
SELECT org_nome, org_id, periodo, d1 AS mes, regime,
       dre_net, dre_credit, dre_debit, dre_pend_credit, dre_pend_debit,
       resumo_receita_bruta, resumo_ebitda, resumo_resultado_liquido,
       resumo_resultado_liquido_prev, resumo_soma_linhas, titulos_com_juros
  FROM (
    SELECT 0 AS bloco, l.org_nome, l.org_id, l.ordem, l.periodo, l.d1, l.regime,
           l.dre_net, l.dre_credit, l.dre_debit, l.dre_pend_credit, l.dre_pend_debit,
           l.resumo_receita_bruta, l.resumo_ebitda, l.resumo_resultado_liquido,
           l.resumo_resultado_liquido_prev, l.resumo_soma_linhas, l.titulos_com_juros
      FROM linhas l
    UNION ALL
    SELECT 1, 'TOTAL (' || count(DISTINCT l.org_id) || ' orgs)', NULL::uuid, 99, 'dois meses', NULL::date, l.regime,
           SUM(l.dre_net), SUM(l.dre_credit), SUM(l.dre_debit), SUM(l.dre_pend_credit), SUM(l.dre_pend_debit),
           SUM(l.resumo_receita_bruta), SUM(l.resumo_ebitda), SUM(l.resumo_resultado_liquido),
           SUM(l.resumo_resultado_liquido_prev), SUM(l.resumo_soma_linhas), SUM(l.titulos_com_juros)
      FROM linhas l
     GROUP BY l.regime
  ) t
 ORDER BY bloco, org_nome, org_id, ordem, regime;

ROLLBACK;
