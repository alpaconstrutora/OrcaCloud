-- scripts/conferencia-juros-relatorios-antes-depois.sql
-- Impressão digital (md5) de cada relatório por categoria, por organização, ANTES ×
-- DEPOIS de supabase/migrations/aplicar_20271110400000_juros_relatorios_por_categoria.sql.
--
--   npx supabase db query --linked -o table -f scripts/conferencia-juros-relatorios-antes-depois.sql > antes.txt
--   (aplicar a migration)
--   npx supabase db query --linked -o table -f scripts/conferencia-juros-relatorios-antes-depois.sql > depois.txt
--   diff antes.txt depois.txt
--
-- O QUE SE ESPERA: org sem título com juros (titulos_com_juros = 0) → linha IGUAL.
-- Só as colunas que existiam antes entram (a fato ganhou parte_juros/amount_titulo,
-- o Balancete ganhou n_partes_juros). Rodar os dois no mesmo dia, sem ninguém lançando.
--
-- Somente leitura, BEGIN … ROLLBACK, como postgres com request.jwt.claims =
-- desenvolvedor@ (membro de toda org) para as funções passarem na checagem de acesso.

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
orgs AS (
    SELECT DISTINCT om.organization_id AS org
      FROM public.organization_members om CROSS JOIN u
     WHERE om.user_id = u.id
)
SELECT
  o.org,
  (SELECT count(*) FROM public.internal_transactions t
    WHERE t.organization_id = o.org AND t.interest_amount > 0) AS titulos_com_juros,
  -- fato: só as colunas de antes
  (SELECT md5(string_agg(concat_ws('|', f.id, f.amount, f.category_id, f.category_parent_id,
            f.dre_group, f.nature, f.category_name, f.sort_order, f.credit_realizado,
            f.debit_realizado, f.credit_previsto, f.debit_previsto, f.net_realizado,
            f.net_previsto, f.category_parent_name), ',' ORDER BY f.id))
     FROM public.vw_fact_financial_tx f WHERE f.organization_id = o.org) AS fato,
  (SELECT md5(string_agg(concat_ws('|', dim.d, p.dimension_key, p.dimension_label, p.qtd,
            p.credit_realizado, p.debit_realizado, p.credit_previsto, p.debit_previsto,
            p.net_realizado, p.vencido), ',' ORDER BY dim.d, p.dimension_key, p.dimension_label))
     FROM unnest(ARRAY['category','category_parent','dre_group','client','project','tx_month','contract']) dim(d)
     CROSS JOIN LATERAL public.fn_opura_pivot(o.org, dim.d) p) AS pivot,
  (SELECT md5(string_agg(concat_ws('|', b.mes, b.receita, b.custo, b.ebitda), ',' ORDER BY b.mes))
     FROM public.fn_bi_trend(o.org, 24) b) AS bi_trend,
  (SELECT md5(string_agg(concat_ws('|', a.dimension_key, a.faixa, a.qtd, a.valor, a.atraso_max), ','
            ORDER BY a.dimension_key, a.faixa))
     FROM public.fn_opura_aging(o.org, NULL,
            (SELECT array_agg(c.id) FROM public.clients c WHERE c.organization_id = o.org),
            NULL, NULL, 'hoje', 'client') a) AS aging,
  (SELECT md5(string_agg(concat_ws('|', e.id, e.amount, e.category_name, e.dre_group, e.description,
            e.total_count), ',' ORDER BY e.id))
     FROM public.fn_opura_entries(o.org, p_limit => 100000) e) AS entries,
  (SELECT md5(string_agg(concat_ws('|', e.id, e.amount, e.category_name, e.description,
            e.total_count), ',' ORDER BY e.id))
     FROM public.fn_opura_entries(o.org, p_dre_group => 'RECEITA_BRUTA', p_limit => 100000) e) AS entries_receita,
  (SELECT md5(string_agg(concat_ws('|', x.direction, x.natureza, x.empreendimento_id, x.categoria,
            x.realizado, x.a_vencer_90d, x.vencido, x.qtd), ','
            ORDER BY x.direction, x.natureza, x.empreendimento_id, x.categoria))
     FROM public.fn_entries_without_project(o.org) x) AS sem_obra,
  (SELECT md5(string_agg(concat_ws('|', r.regime, l.category_id, l.category_name, l.dre_group,
            l.creditos, l.debitos, l.saldo_liquido, l.n_transacoes), ','
            ORDER BY r.regime, l.sort_order, l.category_name, l.category_id))
     FROM unnest(ARRAY['CAIXA','COMPETENCIA']) r(regime)
     CROSS JOIN LATERAL public.fn_balancete(o.org, DATE '2020-01-01', DATE '2030-12-31', NULL, r.regime) l) AS balancete,
  (SELECT md5(string_agg(concat_ws('|', v.budget_id, v.month, v.category_name, v.actual_amount), ','
            ORDER BY v.budget_id, v.month, v.category_name, v.actual_amount))
     FROM public.vw_fpa_budget_vs_actual v
     JOIN public.fpa_budgets fb ON fb.id = v.budget_id
     JOIN public.companies c ON c.id = fb.empresa_id AND c.org_id = o.org) AS fpa
FROM orgs o
ORDER BY o.org;

ROLLBACK;
