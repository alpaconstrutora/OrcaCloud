-- scripts/teste-dre-juros-destacado.sql
-- Conferência de supabase/migrations/aplicar_20271110300100_dre_juros_destacado.sql
-- (DRE e Balancete separam os juros da venda parcelada).
--
--   npx supabase db query --linked -o table -f scripts/teste-dre-juros-destacado.sql
--
-- RODA ANTES E DEPOIS DA MIGRATION (mesmo arquivo):
--   · ANTES  (RED): falham as verificações da separação (fn_dre mostra os
--     8.884,88 inteiros na categoria da venda; Receita Financeira 0) e as da
--     view (90+), que registram "view ausente". Passam as de "total
--     inalterado", CANCELLED e "sem categoria de juros".
--   · DEPOIS (GREEN): todas ok = true; a linha 999 (RESUMO) com ok = true.
--
-- NÃO GRAVA NADA: tudo entre BEGIN … ROLLBACK. `db query` imprime só o
-- resultado da ÚLTIMA instrução que devolve linhas — por isso a tabela final
-- vem logo antes do ROLLBACK (o ROLLBACK não tem resultado e não a substitui;
-- mesmo padrão já usado com EXPLAIN/SELECT seguidos de ROLLBACK).
--
-- ISOLAMENTO DOS DADOS REAIS:
--   · títulos de teste em 2099 (um cenário por mês: jan, fev, mar, abr);
--   · cada número é um DELTA: as funções são lidas antes e depois de inserir
--     os títulos de teste, e a verificação compara (depois − antes). Um
--     lançamento real perdido em 2099 não contamina o resultado.
--   · org = a primeira (por id) em que desenvolvedor@ é membro e que tenha
--     uma obra com empresa (SPE) — fn_dre_spe_summary só vê título com obra
--     de empresa, e fn_dre_projects_summary só vê título com obra. Os títulos
--     de teste levam essa obra (project_id).
--   · categorias: Receita Financeira = como resolverCategoriaReceitaFinanceira
--     (services/financialCategoryResolver.ts): dre_group FINANCEIRO + REVENUE,
--     da org ou global, preferindo o nome exato e a da org. Venda = RECEITA_BRUTA
--     + REVENUE, da org ou global, preferindo nome com "venda".
--
-- Roda como postgres (bypassa RLS). As funções exigem auth.uid()/auth.jwt()
-- (senão 'Acesso negado'): request.jwt.claims recebe o usuário desenvolvedor@.
--
-- Guarda da view: as verificações 90+ consultam v_internal_transactions_dre
-- dentro de um DO que testa to_regclass antes — antes da migration o script
-- não quebra, só registra "view ausente" com ok = false.

BEGIN;

CREATE TEMP TABLE _conf (
    ordem       INT,
    verificacao TEXT,
    esperado    TEXT,
    obtido      TEXT,
    ok          BOOLEAN
) ON COMMIT DROP;

-- ── contexto: usuário, org, obra, categorias ────────────────────────────────
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
WITH u AS (
    SELECT id AS user_id
      FROM auth.users
     WHERE lower(email) = 'desenvolvedor@alpaconstrutora.com.br'
     LIMIT 1
), obra_ok AS (
    SELECT p.id, p.organization_id, p.empresa_id
      FROM public.projects p
     WHERE p.empresa_id IS NOT NULL
       AND p.name NOT ILIKE 'Gest%o Comercial'
       AND COALESCE(p.settings->>'classification', 'OBRA') NOT IN ('ORCAMENTO','PLANEJAMENTO','DIARIO')
), org AS (
    SELECT DISTINCT om.organization_id AS org_id
      FROM public.organization_members om CROSS JOIN u
     WHERE (om.user_id = u.user_id
            OR (om.user_id IS NULL AND lower(om.email) = 'desenvolvedor@alpaconstrutora.com.br'))
       AND EXISTS (SELECT 1 FROM obra_ok o WHERE o.organization_id = om.organization_id)
     ORDER BY 1
     LIMIT 1
)
SELECT u.user_id,
       org.org_id,
       ob.id          AS project_id,
       ob.empresa_id,
       fin.id         AS fin_id,
       fin.name       AS fin_nome,
       venda.id       AS venda_id,
       venda.name     AS venda_nome
  FROM u
  LEFT JOIN org ON true
  LEFT JOIN LATERAL (
      SELECT o.id, o.empresa_id FROM obra_ok o
       WHERE o.organization_id = org.org_id
       ORDER BY o.id LIMIT 1
  ) ob ON true
  LEFT JOIN LATERAL (
      SELECT fc.id, fc.name FROM public.financial_categories fc
       WHERE fc.dre_group = 'FINANCEIRO' AND fc.nature = 'REVENUE'
         AND (fc.organization_id = org.org_id OR fc.organization_id IS NULL)
       ORDER BY (fc.name = 'Receita Financeira') DESC,
                (fc.organization_id IS NOT DISTINCT FROM org.org_id) DESC,
                fc.id
       LIMIT 1
  ) fin ON true
  LEFT JOIN LATERAL (
      SELECT fc.id, fc.name FROM public.financial_categories fc
       WHERE fc.dre_group = 'RECEITA_BRUTA' AND fc.nature = 'REVENUE'
         AND (fc.organization_id = org.org_id OR fc.organization_id IS NULL)
         AND fc.id IS DISTINCT FROM fin.id
       ORDER BY (fc.name ILIKE '%venda%') DESC,
                (fc.organization_id IS NOT DISTINCT FROM org.org_id) DESC,
                fc.id
       LIMIT 1
  ) venda ON true;

INSERT INTO _conf
SELECT 0, 'contexto: usuário + org + obra com SPE + categoria venda + Receita Financeira',
       'tudo resolvido',
       format('user=%s org=%s obra=%s spe=%s venda=%s fin=%s',
              c.user_id, c.org_id, c.project_id, c.empresa_id, c.venda_nome, c.fin_nome),
       (c.user_id IS NOT NULL AND c.org_id IS NOT NULL AND c.project_id IS NOT NULL
        AND c.empresa_id IS NOT NULL AND c.venda_id IS NOT NULL AND c.fin_id IS NOT NULL)
  -- LEFT JOIN de uma linha fixa: sem usuário/org a verificação 0 aparece
  -- com ok = false em vez de sumir.
  FROM (SELECT 1) AS um
  LEFT JOIN _ctx c ON true;

SELECT set_config('request.jwt.claims',
                  json_build_object('sub', c.user_id,
                                    'email', 'desenvolvedor@alpaconstrutora.com.br',
                                    'role', 'authenticated')::text,
                  true),
       set_config('request.jwt.claim.sub', c.user_id::text, true)
  FROM _ctx c;

-- ── métricas de um mês de 2099 (lidas antes e depois dos títulos de teste) ──
CREATE FUNCTION pg_temp.metricas(p_ini DATE)
RETURNS TABLE (chave TEXT, valor NUMERIC)
LANGUAGE sql AS $$
    WITH c AS (SELECT * FROM pg_temp._ctx),
         d AS (SELECT p_ini AS d1, (p_ini + interval '1 month' - interval '1 day')::date AS d2),
         r AS (SELECT unnest(ARRAY['CAIXA','COMPETENCIA']) AS regime)
    -- fn_dre: categoria da venda, Receita Financeira e total
    SELECT 'dre_venda_' || r.regime,
           COALESCE((SELECT SUM(f.net) FROM public.fn_dre(c.org_id, d.d1, d.d2, NULL::uuid, NULL::uuid, r.regime) f
                      WHERE f.category_name = c.venda_nome), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'dre_fin_' || r.regime,
           COALESCE((SELECT SUM(f.net) FROM public.fn_dre(c.org_id, d.d1, d.d2, NULL::uuid, NULL::uuid, r.regime) f
                      WHERE f.category_name = c.fin_nome), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'dre_total_' || r.regime,
           COALESCE((SELECT SUM(f.net) FROM public.fn_dre(c.org_id, d.d1, d.d2, NULL::uuid, NULL::uuid, r.regime) f), 0)
      FROM c, d, r
    -- fn_dre_summary: Receita Bruta, (-) Resultado Financeiro, = Resultado Líquido
    -- (LIKE com % no lugar do acento: não depender do encoding do arquivo)
    UNION ALL
    SELECT 'sum_rb_' || r.regime,
           COALESCE((SELECT SUM(s.valor_realizado) FROM public.fn_dre_summary(c.org_id, d.d1, d.d2, NULL::uuid, r.regime) s
                      WHERE s.linha = 'Receita Bruta'), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'sum_rf_' || r.regime,
           COALESCE((SELECT SUM(s.valor_realizado) FROM public.fn_dre_summary(c.org_id, d.d1, d.d2, NULL::uuid, r.regime) s
                      WHERE s.linha = '(-) Resultado Financeiro'), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'sum_rl_' || r.regime,
           COALESCE((SELECT SUM(s.valor_realizado) FROM public.fn_dre_summary(c.org_id, d.d1, d.d2, NULL::uuid, r.regime) s
                      WHERE s.linha LIKE '= Resultado L%quido'), 0)
      FROM c, d, r
    -- fn_balancete: total e linha da Receita Financeira
    UNION ALL
    SELECT 'bal_total_' || r.regime,
           COALESCE((SELECT SUM(b.saldo_liquido) FROM public.fn_balancete(c.org_id, d.d1, d.d2, NULL::uuid, r.regime) b), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'bal_fin_' || r.regime,
           COALESCE((SELECT SUM(b.saldo_liquido) FROM public.fn_balancete(c.org_id, d.d1, d.d2, NULL::uuid, r.regime) b
                      WHERE b.category_id = c.fin_id), 0)
      FROM c, d, r
    -- fn_dre_spe_summary: SPE da obra de teste
    UNION ALL
    SELECT 'spe_rl_' || r.regime,
           COALESCE((SELECT SUM(s.resultado_liquido) FROM public.fn_dre_spe_summary(c.org_id, d.d1, d.d2, r.regime) s
                      WHERE s.empresa_id = c.empresa_id), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'spe_rb_' || r.regime,
           COALESCE((SELECT SUM(s.receita_bruta) FROM public.fn_dre_spe_summary(c.org_id, d.d1, d.d2, r.regime) s
                      WHERE s.empresa_id = c.empresa_id), 0)
      FROM c, d, r
    UNION ALL
    SELECT 'spe_n_' || r.regime,
           COALESCE((SELECT SUM(s.n_transacoes) FROM public.fn_dre_spe_summary(c.org_id, d.d1, d.d2, r.regime) s
                      WHERE s.empresa_id = c.empresa_id), 0)
      FROM c, d, r
    -- fn_dre_projects_summary (só caixa: lê transaction_date + CONCILIATED)
    UNION ALL
    SELECT 'proj_receita',
           COALESCE((SELECT SUM(p.receita) FROM public.fn_dre_projects_summary(c.org_id, d.d1, d.d2) p
                      WHERE p.project_id = c.project_id), 0)
      FROM c, d
    UNION ALL
    SELECT 'proj_margem',
           COALESCE((SELECT SUM(p.margem) FROM public.fn_dre_projects_summary(c.org_id, d.d1, d.d2) p
                      WHERE p.project_id = c.project_id), 0)
      FROM c, d
$$;

CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT m.mes, x.chave, x.valor
  FROM generate_series(1, 4) AS m(mes)
 CROSS JOIN LATERAL pg_temp.metricas(make_date(2099, m.mes, 1)) x;

-- ── títulos de teste: um cenário por mês de 2099 ───────────────────────────
--   S1 jan: CREDIT 8.884,88, juros 1.000 + categoria de juros, CONCILIATED
--   S2 fev: idem, CANCELLED
--   S3 mar: juros 9.999 (> parcela) + categoria de juros, CONCILIATED
--   S4 abr: juros 1.000 SEM categoria de juros (interest_category_id NULL)
-- reference_id 'teste-dre-juros-*' não casa com 'tx-%' (gatilho de comissão).
CREATE TEMP TABLE _titulos (cenario TEXT, id UUID, amount NUMERIC) ON COMMIT DROP;

WITH ins AS (
    INSERT INTO public.internal_transactions
        (organization_id, source_system, reference_id, transaction_date, competencia_date,
         amount, direction, description, category, category_id, project_id, status,
         interest_amount, interest_category_id)
    SELECT c.org_id, 'MANUAL', 'teste-dre-juros-' || v.cenario, v.d, v.d,
           8884.88, 'CREDIT', 'TESTE dre_juros_destacado ' || v.cenario,
           c.venda_nome, c.venda_id, c.project_id, v.st,
           v.juros, CASE WHEN v.com_cat THEN c.fin_id END
      FROM _ctx c,
           (VALUES ('S1', DATE '2099-01-15', 'CONCILIATED', 1000.00::numeric, true),
                   ('S2', DATE '2099-02-15', 'CANCELLED',   1000.00::numeric, true),
                   ('S3', DATE '2099-03-15', 'CONCILIATED', 9999.00::numeric, true),
                   ('S4', DATE '2099-04-15', 'CONCILIATED', 1000.00::numeric, false)
           ) AS v(cenario, d, st, juros, com_cat)
     WHERE c.org_id IS NOT NULL
    RETURNING id, reference_id, amount
)
INSERT INTO _titulos
SELECT replace(reference_id, 'teste-dre-juros-', ''), id, amount FROM ins;

CREATE TEMP TABLE _depois ON COMMIT DROP AS
SELECT m.mes, x.chave, x.valor
  FROM generate_series(1, 4) AS m(mes)
 CROSS JOIN LATERAL pg_temp.metricas(make_date(2099, m.mes, 1)) x;

CREATE FUNCTION pg_temp.delta(p_mes INT, p_chave TEXT)
RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT COALESCE((SELECT SUM(valor) FROM pg_temp._depois WHERE mes = p_mes AND chave = p_chave), 0)
         - COALESCE((SELECT SUM(valor) FROM pg_temp._antes  WHERE mes = p_mes AND chave = p_chave), 0)
$$;

-- ── verificações (esperado × delta) ────────────────────────────────────────
INSERT INTO _conf
SELECT v.ordem, v.verificacao, v.esperado::text, d.obtido::text,
       d.obtido IS NOT DISTINCT FROM v.esperado
  FROM (VALUES
    ( 1, 'S1 juros 1000 · fn_dre CAIXA · categoria da venda',              1, 'dre_venda_CAIXA',        7884.88),
    ( 2, 'S1 juros 1000 · fn_dre CAIXA · Receita Financeira',              1, 'dre_fin_CAIXA',          1000.00),
    ( 3, 'S1 juros 1000 · fn_dre COMPETENCIA · categoria da venda',        1, 'dre_venda_COMPETENCIA',  7884.88),
    ( 4, 'S1 juros 1000 · fn_dre COMPETENCIA · Receita Financeira',        1, 'dre_fin_COMPETENCIA',    1000.00),
    ( 5, 'S1 juros 1000 · fn_dre CAIXA · total (soma de net) inalterado',  1, 'dre_total_CAIXA',        8884.88),
    ( 6, 'S1 juros 1000 · fn_dre COMPETENCIA · total inalterado',          1, 'dre_total_COMPETENCIA',  8884.88),
    (10, 'S2 CANCELLED · fn_dre CAIXA · categoria da venda',               2, 'dre_venda_CAIXA',        0),
    (11, 'S2 CANCELLED · fn_dre CAIXA · Receita Financeira',               2, 'dre_fin_CAIXA',          0),
    (12, 'S2 CANCELLED · fn_dre COMPETENCIA · categoria da venda',         2, 'dre_venda_COMPETENCIA',  0),
    (13, 'S2 CANCELLED · fn_dre COMPETENCIA · Receita Financeira',         2, 'dre_fin_COMPETENCIA',    0),
    (20, 'S3 juros 9999 · fn_dre CAIXA · Receita Financeira = parcela',    3, 'dre_fin_CAIXA',          8884.88),
    (21, 'S3 juros 9999 · fn_dre CAIXA · categoria da venda = 0',          3, 'dre_venda_CAIXA',        0),
    (22, 'S3 juros 9999 · fn_dre COMPETENCIA · Receita Financeira',        3, 'dre_fin_COMPETENCIA',    8884.88),
    (23, 'S3 juros 9999 · fn_dre COMPETENCIA · categoria da venda = 0',    3, 'dre_venda_COMPETENCIA',  0),
    (30, 'S4 sem categoria de juros · fn_dre CAIXA · tudo na venda',       4, 'dre_venda_CAIXA',        8884.88),
    (31, 'S4 sem categoria de juros · fn_dre CAIXA · Receita Financeira',  4, 'dre_fin_CAIXA',          0),
    (32, 'S4 sem categoria de juros · fn_dre COMPETENCIA · venda',         4, 'dre_venda_COMPETENCIA',  8884.88),
    (33, 'S4 sem categoria de juros · fn_dre COMPETENCIA · Rec. Financ.',  4, 'dre_fin_COMPETENCIA',    0),
    (40, 'S1 · fn_dre_summary CAIXA · = Resultado Liquido inalterado',     1, 'sum_rl_CAIXA',           8884.88),
    (41, 'S1 · fn_dre_summary COMPETENCIA · = Resultado Liquido',          1, 'sum_rl_COMPETENCIA',     8884.88),
    (42, 'S1 · fn_dre_summary CAIXA · Receita Bruta sem os juros',         1, 'sum_rb_CAIXA',           7884.88),
    (43, 'S1 · fn_dre_summary CAIXA · (-) Resultado Financeiro',           1, 'sum_rf_CAIXA',          -1000.00),
    (50, 'S1 · fn_balancete CAIXA · total (saldo_liquido) inalterado',     1, 'bal_total_CAIXA',        8884.88),
    (51, 'S1 · fn_balancete COMPETENCIA · total inalterado',               1, 'bal_total_COMPETENCIA',  8884.88),
    (52, 'S1 · fn_balancete CAIXA · linha Receita Financeira',             1, 'bal_fin_CAIXA',          1000.00),
    (60, 'S1 · fn_dre_spe_summary CAIXA · resultado_liquido inalterado',   1, 'spe_rl_CAIXA',           8884.88),
    (61, 'S1 · fn_dre_spe_summary COMPETENCIA · resultado_liquido',        1, 'spe_rl_COMPETENCIA',     8884.88),
    (62, 'S1 · fn_dre_spe_summary CAIXA · receita_bruta sem os juros',     1, 'spe_rb_CAIXA',           7884.88),
    (63, 'S1 · fn_dre_spe_summary CAIXA · n_transacoes conta 1 titulo',    1, 'spe_n_CAIXA',            1),
    (70, 'S1 · fn_dre_projects_summary · receita da obra inalterada',      1, 'proj_receita',           8884.88),
    (71, 'S1 · fn_dre_projects_summary · margem da obra inalterada',       1, 'proj_margem',            8884.88)
  ) AS v(ordem, verificacao, mes, chave, esperado)
 CROSS JOIN LATERAL (SELECT pg_temp.delta(v.mes, v.chave) AS obtido) d;

INSERT INTO _conf
SELECT 80, 'títulos de teste inseridos', '4', count(*)::text, count(*) = 4 FROM _titulos;

-- ── view (só existe depois da migration) ───────────────────────────────────
DO $$
DECLARE
    v_s1 TEXT; v_s3 TEXT; v_n4 BIGINT; v_div BIGINT; v_div_global BIGINT; v_opts TEXT[];
BEGIN
    IF to_regclass('public.v_internal_transactions_dre') IS NULL THEN
        INSERT INTO pg_temp._conf VALUES
          (90, 'view: soma de amount_dre por título = amount (títulos de teste)', '0 divergências', 'view ausente (antes da migration)', false),
          (91, 'view: S1 = principal 7884.88 + juros 1000.00 na Receita Financeira', 'principal=7884.88 juros=1000.00 cat_juros=fin', 'view ausente (antes da migration)', false),
          (92, 'view: S3 = principal 0.00 + juros 8884.88', 'principal=0.00 juros=8884.88', 'view ausente (antes da migration)', false),
          (93, 'view: S4 (sem categoria de juros) = 1 linha', '1', 'view ausente (antes da migration)', false),
          (94, 'view: GRANT SELECT authenticated, nada para anon', 'authenticated=true anon=false', 'view ausente (antes da migration)', false),
          (95, 'view: security_invoker=true', 'security_invoker=true', 'view ausente (antes da migration)', false),
          (96, 'view: contrato em TODA a tabela (títulos com soma ≠ amount)', '0', 'view ausente (antes da migration)', false);
        RETURN;
    END IF;

    SELECT count(*) INTO v_div
      FROM (SELECT t.id, t.amount, SUM(v.amount_dre) AS soma
              FROM pg_temp._titulos t
              JOIN public.v_internal_transactions_dre v ON v.id = t.id
             GROUP BY t.id, t.amount) x
     WHERE x.soma IS DISTINCT FROM x.amount;
    INSERT INTO pg_temp._conf VALUES
      (90, 'view: soma de amount_dre por título = amount (títulos de teste)', '0 divergências',
       v_div || ' divergências', v_div = 0 AND (SELECT count(*) FROM pg_temp._titulos) = 4);

    SELECT format('principal=%s juros=%s cat_juros=%s',
                  max(v.amount_dre) FILTER (WHERE NOT v.parte_juros),
                  max(v.amount_dre) FILTER (WHERE v.parte_juros),
                  CASE WHEN bool_and(v.category_id_dre = c.fin_id) FILTER (WHERE v.parte_juros) THEN 'fin' ELSE 'outra' END)
      INTO v_s1
      FROM pg_temp._titulos t
      JOIN public.v_internal_transactions_dre v ON v.id = t.id
     CROSS JOIN pg_temp._ctx c
     WHERE t.cenario = 'S1';
    INSERT INTO pg_temp._conf VALUES
      (91, 'view: S1 = principal 7884.88 + juros 1000.00 na Receita Financeira',
       'principal=7884.88 juros=1000.00 cat_juros=fin', v_s1,
       v_s1 = 'principal=7884.88 juros=1000.00 cat_juros=fin');

    SELECT format('principal=%s juros=%s',
                  max(v.amount_dre) FILTER (WHERE NOT v.parte_juros),
                  max(v.amount_dre) FILTER (WHERE v.parte_juros))
      INTO v_s3
      FROM pg_temp._titulos t
      JOIN public.v_internal_transactions_dre v ON v.id = t.id
     WHERE t.cenario = 'S3';
    INSERT INTO pg_temp._conf VALUES
      (92, 'view: S3 = principal 0.00 + juros 8884.88', 'principal=0.00 juros=8884.88', v_s3,
       v_s3 = 'principal=0.00 juros=8884.88');

    SELECT count(*) INTO v_n4
      FROM pg_temp._titulos t
      JOIN public.v_internal_transactions_dre v ON v.id = t.id
     WHERE t.cenario = 'S4';
    INSERT INTO pg_temp._conf VALUES
      (93, 'view: S4 (sem categoria de juros) = 1 linha', '1', v_n4::text, v_n4 = 1);

    INSERT INTO pg_temp._conf
    SELECT 94, 'view: GRANT SELECT authenticated, nada para anon', 'authenticated=true anon=false',
           format('authenticated=%s anon=%s',
                  has_table_privilege('authenticated', 'public.v_internal_transactions_dre', 'SELECT'),
                  has_table_privilege('anon', 'public.v_internal_transactions_dre', 'SELECT')),
           has_table_privilege('authenticated', 'public.v_internal_transactions_dre', 'SELECT')
           AND NOT has_table_privilege('anon', 'public.v_internal_transactions_dre', 'SELECT');

    SELECT c.reloptions INTO v_opts FROM pg_class c WHERE c.oid = 'public.v_internal_transactions_dre'::regclass;
    INSERT INTO pg_temp._conf VALUES
      (95, 'view: security_invoker=true', 'security_invoker=true', COALESCE(array_to_string(v_opts, ','), '(nenhuma)'),
       'security_invoker=true' = ANY(COALESCE(v_opts, '{}')));

    SELECT count(*) INTO v_div_global
      FROM (SELECT v.id, SUM(v.amount_dre) AS soma, max(v.amount) AS amount
              FROM public.v_internal_transactions_dre v
             GROUP BY v.id) x
     WHERE x.soma IS DISTINCT FROM x.amount;
    INSERT INTO pg_temp._conf VALUES
      (96, 'view: contrato em TODA a tabela (títulos com soma ≠ amount)', '0', v_div_global::text, v_div_global = 0);
END $$;

-- ── resultado (última instrução com linhas — é o que `db query` imprime) ────
SELECT ordem, verificacao, esperado, obtido, ok
  FROM (
    -- ok NULL (valor não calculado) conta como falha, não some do resumo.
    SELECT ordem, verificacao, esperado, obtido, COALESCE(ok, false) AS ok FROM _conf
    UNION ALL
    SELECT 999, 'RESUMO',
           count(*)::text || ' verificações',
           count(*) FILTER (WHERE ok)::text || ' ok',
           COALESCE(bool_and(COALESCE(ok, false)), false)
      FROM _conf
  ) r
 ORDER BY ordem;

ROLLBACK;
