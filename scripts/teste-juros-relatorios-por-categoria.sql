-- scripts/teste-juros-relatorios-por-categoria.sql
-- Conferência de supabase/migrations/aplicar_20271110400000_juros_relatorios_por_categoria.sql
-- (ÒPURA, FP&A, Inteligência Financeira e total do Balancete com os juros separados).
--
--   npx supabase db query --linked -o table -f scripts/teste-juros-relatorios-por-categoria.sql
--
-- ANTES da migration (RED): falham as verificações de separação e as que leem as
-- colunas novas (registradas como "ausente"). DEPOIS (GREEN): todas ok = true.
--
-- NÃO GRAVA NADA: BEGIN … ROLLBACK. `db query` imprime só o último resultado com
-- linhas — a tabela final vem logo antes do ROLLBACK.
--
-- Cenários (títulos de 8.884,88, juros 1.000,00, datas em 2099; cada número é um
-- DELTA depois − antes, então lançamento real em 2099 não contamina):
--   S1 jan/2099 CONCILIATED, com obra, juros com categoria
--   S2 fev/2099 PENDING (venc. 15/02/2099), com obra e cliente, juros com categoria
--   S3 mar/2099 CONCILIATED, com obra, juros SEM categoria (fica inteiro na venda)
--   S4 abr/2099 CONCILIATED, SEM obra, juros com categoria (Inteligência › sem obra)
-- Org/obra/categorias: mesmo critério de scripts/teste-dre-juros-destacado.sql.

BEGIN;

CREATE TEMP TABLE _conf (ordem INT, verificacao TEXT, esperado TEXT, obtido TEXT, ok BOOLEAN) ON COMMIT DROP;

CREATE TEMP TABLE _ctx ON COMMIT DROP AS
WITH u AS (
    SELECT id AS user_id FROM auth.users
     WHERE lower(email) = 'desenvolvedor@alpaconstrutora.com.br' LIMIT 1
), obra_ok AS (
    SELECT p.id, p.organization_id, p.empresa_id FROM public.projects p
     WHERE p.empresa_id IS NOT NULL
       AND p.name NOT ILIKE 'Gest%o Comercial'
       AND COALESCE(p.settings->>'classification', 'OBRA') = 'OBRA'
       AND COALESCE(p.settings->>'isSystemProject', 'false') <> 'true'
), org AS (
    SELECT DISTINCT om.organization_id AS org_id
      FROM public.organization_members om CROSS JOIN u
     WHERE om.user_id = u.user_id
       AND EXISTS (SELECT 1 FROM obra_ok o WHERE o.organization_id = om.organization_id)
       AND EXISTS (SELECT 1 FROM public.clients cl WHERE cl.organization_id = om.organization_id)
     ORDER BY 1 LIMIT 1
)
SELECT u.user_id, org.org_id, ob.id AS project_id, ob.empresa_id,
       cli.id AS client_id,
       fin.id AS fin_id, fin.name AS fin_nome,
       venda.id AS venda_id, venda.name AS venda_nome
  FROM u
  LEFT JOIN org ON true
  LEFT JOIN LATERAL (SELECT o.id, o.empresa_id FROM obra_ok o WHERE o.organization_id = org.org_id ORDER BY o.id LIMIT 1) ob ON true
  LEFT JOIN LATERAL (SELECT cl.id FROM public.clients cl WHERE cl.organization_id = org.org_id ORDER BY cl.id LIMIT 1) cli ON true
  LEFT JOIN LATERAL (
      SELECT fc.id, fc.name FROM public.financial_categories fc
       WHERE fc.dre_group = 'FINANCEIRO' AND fc.nature = 'REVENUE'
         AND (fc.organization_id = org.org_id OR fc.organization_id IS NULL)
       ORDER BY (fc.name = 'Receita Financeira') DESC,
                (fc.organization_id IS NOT DISTINCT FROM org.org_id) DESC, fc.id
       LIMIT 1) fin ON true
  LEFT JOIN LATERAL (
      SELECT fc.id, fc.name FROM public.financial_categories fc
       WHERE fc.dre_group = 'RECEITA_BRUTA' AND fc.nature = 'REVENUE'
         AND (fc.organization_id = org.org_id OR fc.organization_id IS NULL)
         AND fc.id IS DISTINCT FROM fin.id
       ORDER BY (fc.name ILIKE '%venda%') DESC,
                (fc.organization_id IS NOT DISTINCT FROM org.org_id) DESC, fc.id
       LIMIT 1) venda ON true;

INSERT INTO _conf
SELECT 0, 'contexto resolvido (usuário, org, obra com SPE, cliente, categorias)', 'tudo resolvido',
       format('org=%s obra=%s cliente=%s venda=%s fin=%s', c.org_id, c.project_id, c.client_id, c.venda_nome, c.fin_nome),
       (c.org_id IS NOT NULL AND c.project_id IS NOT NULL AND c.client_id IS NOT NULL
        AND c.venda_id IS NOT NULL AND c.fin_id IS NOT NULL)
  FROM (SELECT 1) um LEFT JOIN _ctx c ON true;

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', c.user_id, 'email', 'desenvolvedor@alpaconstrutora.com.br',
                                    'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', c.user_id::text, true)
  FROM _ctx c;

-- Métricas lidas antes e depois dos títulos de teste. Tudo que depende de coluna
-- nova vai por SQL dinâmico dentro de DO — antes da migration vira "ausente".
CREATE TEMP TABLE _m (fase TEXT, chave TEXT, valor NUMERIC) ON COMMIT DROP;

CREATE FUNCTION pg_temp.medir(p_fase TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c RECORD;
  v NUMERIC;
BEGIN
  SELECT * INTO c FROM pg_temp._ctx;

  -- ÒPURA pivot por categoria / grupo DRE / mês (jan = S1)
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_cat_venda_jan', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'category', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p
   WHERE p.dimension_key = c.venda_id::text;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_cat_fin_jan', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'category', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p
   WHERE p.dimension_key = c.fin_id::text;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_dre_receita_bruta_jan', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'dre_group', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p
   WHERE p.dimension_key = 'RECEITA_BRUTA';
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_dre_financeiro_jan', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'dre_group', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p
   WHERE p.dimension_key = 'FINANCEIRO';
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_mes_qtd_jan', COALESCE(SUM(p.qtd), 0)
    FROM public.fn_opura_pivot(c.org_id, 'tx_month', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_mes_net_jan', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'tx_month', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_cat_qtd_jan', COALESCE(SUM(p.qtd), 0)
    FROM public.fn_opura_pivot(c.org_id, 'category', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p;
  BEGIN
    EXECUTE $q$SELECT COALESCE(SUM(p.qtd_titulos), 0)
                 FROM public.fn_opura_pivot($1, 'category', 'transaction', DATE '2099-01-01', DATE '2099-01-31') p$q$
       INTO v USING c.org_id;
    INSERT INTO pg_temp._m VALUES (p_fase, 'pivot_cat_titulos_jan', v);
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO pg_temp._m VALUES (p_fase, 'pivot_cat_titulos_jan', NULL);
  END;
  -- "— Sem categoria-pai" (venda e Receita Financeira sem pai no seed): as duas
  -- partes passam no mesmo filtro — tem de sair 1 linha (id único) com o valor cheio.
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_sem_pai_ids_repetidos', count(*) - count(DISTINCT e.id)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28',
                                 p_sem_dimensao => 'category_parent', p_limit => 100000) e;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'pivot_cat_venda_mar', COALESCE(SUM(p.net_realizado), 0)
    FROM public.fn_opura_pivot(c.org_id, 'category', 'transaction', DATE '2099-03-01', DATE '2099-03-31') p
   WHERE p.dimension_key = c.venda_id::text;

  -- ÒPURA aging (S2, a vencer): por título
  INSERT INTO pg_temp._m
  SELECT p_fase, 'aging_qtd', COALESCE(SUM(a.qtd), 0)
    FROM public.fn_opura_aging(c.org_id, c.client_id, NULL, NULL, NULL, 'hoje', NULL) a
   WHERE a.faixa = 'a_vencer';
  INSERT INTO pg_temp._m
  SELECT p_fase, 'aging_valor', COALESCE(SUM(a.valor), 0)
    FROM public.fn_opura_aging(c.org_id, c.client_id, NULL, NULL, NULL, 'hoje', NULL) a
   WHERE a.faixa = 'a_vencer';

  -- ÒPURA lançamentos de fev (S2): título; e detalhe por categoria/grupo
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_fev_linhas', count(*)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28', p_limit => 100000) e;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_fev_soma', COALESCE(SUM(e.amount), 0)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28', p_limit => 100000) e;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_fev_fin_soma', COALESCE(SUM(e.amount), 0)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28',
                                 p_category_id => c.fin_id, p_limit => 100000) e;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_fev_fin_desc_juros', count(*)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28',
                                 p_category_id => c.fin_id, p_limit => 100000) e
   WHERE e.description LIKE '% · juros';
  INSERT INTO pg_temp._m
  SELECT p_fase, 'entries_fev_receita_soma', COALESCE(SUM(e.amount), 0)
    FROM public.fn_opura_entries(c.org_id, 'transaction', DATE '2099-02-01', DATE '2099-02-28',
                                 p_dre_group => 'RECEITA_BRUTA', p_limit => 100000) e;

  -- Inteligência Financeira › sem obra (S4): por categoria
  INSERT INTO pg_temp._m
  SELECT p_fase, 'sem_obra_venda', COALESCE(SUM(x.realizado), 0)
    FROM public.fn_entries_without_project(c.org_id) x
   WHERE x.direction = 'CREDIT' AND x.categoria = c.venda_nome;
  INSERT INTO pg_temp._m
  SELECT p_fase, 'sem_obra_fin', COALESCE(SUM(x.realizado), 0)
    FROM public.fn_entries_without_project(c.org_id) x
   WHERE x.direction = 'CREDIT' AND x.categoria = c.fin_nome;

  -- Balancete jan (S1): contagens
  INSERT INTO pg_temp._m
  SELECT p_fase, 'balancete_n_jan', COALESCE(SUM(l.n_transacoes), 0)
    FROM public.fn_balancete(c.org_id, DATE '2099-01-01', DATE '2099-01-31', NULL, 'CAIXA') l;
  BEGIN
    EXECUTE $q$SELECT COALESCE(SUM(l.n_transacoes - l.n_partes_juros), 0)
                 FROM public.fn_balancete($1, DATE '2099-01-01', DATE '2099-01-31', NULL, 'CAIXA') l$q$
       INTO v USING c.org_id;
    INSERT INTO pg_temp._m VALUES (p_fase, 'balancete_titulos_jan', v);
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO pg_temp._m VALUES (p_fase, 'balancete_titulos_jan', NULL);
  END;

  -- Fato (colunas novas)
  BEGIN
    EXECUTE $q$SELECT count(*) FROM public.vw_fact_financial_tx f
                WHERE f.reference_id = 'teste-juros-rel-S1' AND f.parte_juros AND f.amount_titulo = 8884.88$q$ INTO v;
    INSERT INTO pg_temp._m VALUES (p_fase, 'fato_s1_parte_juros', v);
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO pg_temp._m VALUES (p_fase, 'fato_s1_parte_juros', NULL);
  END;
END;
$$;

SELECT pg_temp.medir('antes');

-- Títulos de teste
INSERT INTO public.internal_transactions
    (organization_id, source_system, reference_id, transaction_date, competencia_date, due_date,
     amount, direction, description, category, category_id, project_id, status,
     party_id, party_type, interest_amount, interest_category_id)
SELECT c.org_id, 'MANUAL', 'teste-juros-rel-' || v.cen, v.d, v.d, v.d,
       8884.88, 'CREDIT', 'TESTE juros relatorios ' || v.cen,
       c.venda_nome, c.venda_id, CASE WHEN v.com_obra THEN c.project_id END, v.st,
       CASE WHEN v.cen = 'S2' THEN c.client_id END, CASE WHEN v.cen = 'S2' THEN 'CLIENT' END,
       1000.00, CASE WHEN v.com_cat THEN c.fin_id END
  FROM _ctx c,
       (VALUES ('S1', DATE '2099-01-15', 'CONCILIATED', true,  true),
               ('S2', DATE '2099-02-15', 'PENDING',     true,  true),
               ('S3', DATE '2099-03-15', 'CONCILIATED', true,  false),
               ('S4', DATE '2099-04-15', 'CONCILIATED', false, true)
       ) AS v(cen, d, st, com_obra, com_cat)
 WHERE c.org_id IS NOT NULL;

SELECT pg_temp.medir('depois');

-- FP&A: orçamento de 2099 da SPE da obra, linhas de jan para venda e juros (absoluto: não há real em 2099)
WITH b AS (
    INSERT INTO public.fpa_budgets (empresa_id, project_id, name, type, year)
    SELECT c.empresa_id, c.project_id, 'TESTE juros relatorios', 'OBRA', 2099 FROM _ctx c
    RETURNING id
)
INSERT INTO public.fpa_budget_lines (budget_id, financial_category_id, month, planned_amount)
SELECT b.id, x.cat, 1, 0 FROM b, _ctx c, LATERAL (VALUES (c.venda_id), (c.fin_id)) x(cat);

CREATE FUNCTION pg_temp.delta(p_chave TEXT) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (SELECT valor FROM pg_temp._m WHERE fase = 'depois' AND chave = p_chave)
         - (SELECT valor FROM pg_temp._m WHERE fase = 'antes'  AND chave = p_chave)
$$;

INSERT INTO _conf
SELECT o, v, e::text, COALESCE(pg_temp.delta(k)::text, 'ausente'), pg_temp.delta(k) IS NOT DISTINCT FROM e
  FROM (VALUES
    (10, 'ÒPURA pivot categoria venda (jan)',          'pivot_cat_venda_jan',         7884.88),
    (11, 'ÒPURA pivot categoria Receita Financeira',   'pivot_cat_fin_jan',           1000.00),
    (12, 'ÒPURA pivot grupo RECEITA_BRUTA (jan)',      'pivot_dre_receita_bruta_jan', 7884.88),
    (13, 'ÒPURA pivot grupo FINANCEIRO (jan)',         'pivot_dre_financeiro_jan',    1000.00),
    (14, 'ÒPURA pivot por mês conta 1 título',         'pivot_mes_qtd_jan',           1),
    (15, 'ÒPURA pivot por mês soma o título cheio',    'pivot_mes_net_jan',           8884.88),
    (16, 'Juros sem categoria: venda fica inteira',    'pivot_cat_venda_mar',         8884.88),
    (17, 'ÒPURA pivot categoria: Σ qtd = 2 (1 por categoria)', 'pivot_cat_qtd_jan',   2),
    (18, 'ÒPURA pivot categoria: Σ qtd_titulos = 1',   'pivot_cat_titulos_jan',       1),
    (35, '"Sem categoria-pai": nenhum id repetido',    'entries_sem_pai_ids_repetidos', 0),
    (20, 'Aging conta 1 título',                       'aging_qtd',                   1),
    (21, 'Aging soma o título cheio',                  'aging_valor',                 8884.88),
    (30, 'Lançamentos: 1 linha por título',            'entries_fev_linhas',          1),
    (31, 'Lançamentos: valor cheio',                   'entries_fev_soma',            8884.88),
    (32, 'Detalhe categoria juros: só a parte',        'entries_fev_fin_soma',        1000.00),
    (33, 'Detalhe categoria juros: descrição "· juros"','entries_fev_fin_desc_juros', 1),
    (34, 'Detalhe RECEITA_BRUTA: só o principal',      'entries_fev_receita_soma',    7884.88),
    (40, 'Sem obra: venda recebe o principal',         'sem_obra_venda',              7884.88),
    (41, 'Sem obra: Receita Financeira recebe juros',  'sem_obra_fin',                1000.00),
    (50, 'Balancete: linhas por categoria (2)',        'balancete_n_jan',             2),
    (51, 'Balancete: títulos = n − n_partes_juros (1)','balancete_titulos_jan',       1),
    (60, 'Fato: S1 tem a linha de juros + amount_titulo','fato_s1_parte_juros',       1)
  ) t(o, v, k, e);

-- FP&A (absoluto)
INSERT INTO _conf
SELECT 70, 'FP&A realizado jan: venda', '7884.88', COALESCE(SUM(v.actual_amount)::text, 'nada'),
       SUM(v.actual_amount) IS NOT DISTINCT FROM 7884.88
  FROM public.vw_fpa_budget_vs_actual v, _ctx c
 WHERE v.budget_name = 'TESTE juros relatorios' AND v.month = 1 AND v.category_name = c.venda_nome;
INSERT INTO _conf
SELECT 71, 'FP&A realizado jan: Receita Financeira', '1000.00', COALESCE(SUM(v.actual_amount)::text, 'nada'),
       SUM(v.actual_amount) IS NOT DISTINCT FROM 1000.00
  FROM public.vw_fpa_budget_vs_actual v, _ctx c
 WHERE v.budget_name = 'TESTE juros relatorios' AND v.month = 1 AND v.category_name = c.fin_nome;

INSERT INTO _conf
SELECT 999, 'RESUMO', 'todas ok', format('%s de %s ok', count(*) FILTER (WHERE ok), count(*)), bool_and(ok)
  FROM _conf;

SELECT * FROM _conf ORDER BY ordem;

ROLLBACK;
