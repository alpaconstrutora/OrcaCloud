-- ==========================================================================
-- Gestão de Dívidas · Posição consolidada, concentração e dívida por destino
-- Date: 2026-08-29
-- Cria: fn_debt_position, fn_debt_concentration, fn_debt_schedule_curve,
--       vw_debt_by_target
-- Plano: docs/planos/2026-08-29-gestao-dividas-financiamentos.md
-- ==========================================================================
-- CONTEXTO
-- Os indicadores do item 10 do PRD. Três decisões de leitura, todas com
-- consequência em número:
--
-- 1. **Saldo devedor = Σ amortização das parcelas em aberto.** Não é o
--    `closing_balance` da última parcela vencida: esse depende de existir
--    parcela vencida, e num contrato em carência não existe. Como
--    `Σ amortização == principal` por construção do motor, somar o que falta
--    amortizar dá o mesmo número e é aditivo (soma por contrato, por obra, por
--    banco — sem recalcular nada).
--
-- 2. **A perna CREDORA do mútuo intercompany fica FORA.** Apurado em
--    2026-08-29: nenhuma view do sistema elimina intercompany
--    (`vw_intercompany_transactions` só lista pedidos de compra;
--    `vw_company_consolidated` é roll-up de contagens). Sem o filtro
--    `mirror_role IS DISTINCT FROM 'CREDORA'`, o mútuo entra duas vezes na
--    dívida do grupo.
--
-- 3. **Custo médio é PONDERADO pelo saldo, não média simples.** A média simples
--    esconde o contrato grande e caro atrás de vários pequenos e baratos —
--    exatamente o número que a diretoria olha para decidir refinanciamento.
--
-- SECURITY INVOKER (o default) de propósito: as tabelas `debt_*` têm RLS por
-- `is_org_member`, então o recorte por organização acontece sozinho. Não
-- reimplementar o array de orgs das fn_dre* aqui — seria uma segunda regra de
-- acesso para manter em dia.
--
-- LANGUAGE sql, e não plpgsql: `RETURNS TABLE` em plpgsql cria parâmetros OUT
-- que colidem com colunas de mesmo nome (foi o que quebrou as 4 telas de
-- Análise de Dados em 2026-07-16, erro 42702).
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'debt_installments') THEN
        RAISE EXCEPTION 'ABORTADO: debt_installments nao existe (rode aplicar_20270915000001 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'debt_contracts'
                      AND column_name = 'mirror_role') THEN
        RAISE EXCEPTION 'ABORTADO: debt_contracts.mirror_role nao existe (rode aplicar_20270915000003 antes).';
    END IF;
END $$;

-- ==========================================================================
-- 1. Parcelas vivas do cronograma VIGENTE — a base de tudo
-- ==========================================================================
-- View intermediária para as três funções não repetirem o mesmo join de
-- contrato → cronograma ativo → parcela, com o mesmo filtro de espelho.

CREATE OR REPLACE VIEW public.vw_debt_open_installments
WITH (security_invoker = on) AS
SELECT
    i.id                        AS installment_id,
    c.id                        AS debt_contract_id,
    c.organization_id,
    c.company_id,
    c.institution_supplier_id,
    c.modality,
    c.status                    AS contract_status,
    c.rate_type,
    c.index_name,
    c.nominal_rate,
    c.rate_period,
    c.final_due_date,
    i.seq,
    i.due_date,
    i.status                    AS installment_status,
    i.amortization,
    i.interest,
    i.monetary_correction,
    i.iof,
    i.insurance,
    i.fees,
    i.total,
    i.closing_balance,
    -- Taxa sempre ao MÊS, para o custo médio somar peras com peras: contrato a
    -- 12% a.a. não pode entrar na mesma média que outro a 1% a.m. sem converter.
    CASE WHEN c.rate_period = 'ANUAL'
         THEN (power(1 + c.nominal_rate / 100.0, 1.0 / 12.0) - 1) * 100
         ELSE c.nominal_rate
    END                         AS taxa_mensal_pct
FROM public.debt_installments i
JOIN public.debt_schedules   s ON s.id = i.debt_schedule_id
                              AND s.kind = 'VIGENTE'
                              AND s.is_active
JOIN public.debt_contracts   c ON c.id = s.debt_contract_id
WHERE i.status NOT IN ('PAGA', 'CANCELADA')
  AND c.status NOT IN ('LIQUIDADO', 'CANCELADO')
  -- Elimina a duplicidade do mútuo intercompany (ver contexto, item 2).
  AND c.mirror_role IS DISTINCT FROM 'CREDORA';

COMMENT ON VIEW public.vw_debt_open_installments IS
    'Parcelas em aberto do cronograma VIGENTE ativo, ja sem a perna CREDORA do '
    'mutuo intercompany e sem contrato liquidado/cancelado. Base unica dos KPIs '
    'de divida — nao consultar debt_installments direto num indicador.';

REVOKE ALL ON public.vw_debt_open_installments FROM anon;
GRANT SELECT ON public.vw_debt_open_installments TO authenticated;

-- ==========================================================================
-- 2. fn_debt_position — os indicadores principais (PRD item 10)
-- ==========================================================================

DROP FUNCTION IF EXISTS public.fn_debt_position(UUID, DATE);

CREATE FUNCTION public.fn_debt_position(
    p_organization_id UUID DEFAULT NULL,
    p_ref_date        DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    n_contratos         BIGINT,
    n_instituicoes      BIGINT,
    divida_total        NUMERIC,
    curto_prazo         NUMERIC,
    longo_prazo         NUMERIC,
    encargos_a_pagar    NUMERIC,
    servico_30          NUMERIC,
    servico_90          NUMERIC,
    servico_365         NUMERIC,
    vencido             NUMERIC,
    n_parcelas_vencidas BIGINT,
    custo_medio_mensal  NUMERIC,
    prazo_medio_meses   NUMERIC,
    pct_taxa_variavel   NUMERIC,
    pct_indexada        NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH b AS (
        -- `p_organization_id IS NULL` = "Todas as organizações": a RLS já
        -- recorta para as do usuário, então não filtrar aqui é o correto —
        -- e nunca bloqueia a leitura (REGRA #5).
        SELECT * FROM public.vw_debt_open_installments v
         WHERE p_organization_id IS NULL OR v.organization_id = p_organization_id
    ),
    por_contrato AS (
        SELECT
            b.debt_contract_id,
            b.institution_supplier_id,
            b.taxa_mensal_pct,
            b.rate_type,
            b.index_name,
            b.final_due_date,
            SUM(b.amortization) AS saldo
        FROM b
        GROUP BY 1, 2, 3, 4, 5, 6
    )
    SELECT
        (SELECT COUNT(*) FROM por_contrato)::BIGINT,
        (SELECT COUNT(DISTINCT pc.institution_supplier_id) FROM por_contrato pc
          WHERE pc.institution_supplier_id IS NOT NULL)::BIGINT,
        COALESCE((SELECT SUM(pc.saldo) FROM por_contrato pc), 0),
        -- Curto prazo = o que amortiza em até 12 meses. É o corte contábil
        -- (circulante x não circulante), não uma escolha de tela.
        COALESCE((SELECT SUM(b.amortization) FROM b
                   WHERE b.due_date <= p_ref_date + 365), 0),
        COALESCE((SELECT SUM(b.amortization) FROM b
                   WHERE b.due_date >  p_ref_date + 365), 0),
        COALESCE((SELECT SUM(b.interest + b.monetary_correction + b.iof + b.insurance + b.fees)
                    FROM b), 0),
        COALESCE((SELECT SUM(b.total) FROM b
                   WHERE b.due_date BETWEEN p_ref_date AND p_ref_date + 30), 0),
        COALESCE((SELECT SUM(b.total) FROM b
                   WHERE b.due_date BETWEEN p_ref_date AND p_ref_date + 90), 0),
        COALESCE((SELECT SUM(b.total) FROM b
                   WHERE b.due_date BETWEEN p_ref_date AND p_ref_date + 365), 0),
        COALESCE((SELECT SUM(b.total) FROM b WHERE b.due_date < p_ref_date), 0),
        COALESCE((SELECT COUNT(*) FROM b WHERE b.due_date < p_ref_date), 0)::BIGINT,
        -- Ponderado pelo saldo (ver contexto, item 3). Sem dívida, 0 — e não
        -- NULL, que a tela mostraria como "—" e leria como "não sei".
        COALESCE((SELECT SUM(pc.taxa_mensal_pct * pc.saldo) / NULLIF(SUM(pc.saldo), 0)
                    FROM por_contrato pc), 0),
        -- Prazo médio ponderado pelo saldo, em meses até o vencimento final.
        -- `date - date` no Postgres devolve INTEGER (dias), não interval — daí
        -- a divisão direta por 30.44 e não um EXTRACT(EPOCH ...), que aqui nem
        -- existe como função.
        COALESCE((SELECT SUM(GREATEST(0, (pc.final_due_date - p_ref_date)) / 30.44 * pc.saldo)
                       / NULLIF(SUM(pc.saldo), 0)
                    FROM por_contrato pc WHERE pc.final_due_date IS NOT NULL), 0),
        COALESCE((SELECT SUM(pc.saldo) FILTER (WHERE pc.rate_type = 'VARIAVEL')
                       / NULLIF(SUM(pc.saldo), 0) * 100 FROM por_contrato pc), 0),
        COALESCE((SELECT SUM(pc.saldo) FILTER (WHERE pc.index_name IS NOT NULL)
                       / NULLIF(SUM(pc.saldo), 0) * 100 FROM por_contrato pc), 0);
$$;

COMMENT ON FUNCTION public.fn_debt_position(UUID, DATE) IS
    'Posicao consolidada da divida (PRD item 10). Saldo = soma da amortizacao '
    'em aberto; perna CREDORA de mutuo ja excluida; custo medio ponderado pelo '
    'saldo. p_organization_id NULL = todas as orgs do usuario (a RLS recorta).';

REVOKE ALL ON FUNCTION public.fn_debt_position(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_position(UUID, DATE) TO authenticated;

-- ==========================================================================
-- 3. fn_debt_concentration — exposição por dimensão
-- ==========================================================================
-- Dimensão via whitelist num CASE, nunca SQL dinâmico: é o mesmo padrão de
-- `fn_opura_pivot`, e o que impede a dimensão virar vetor de injeção.

DROP FUNCTION IF EXISTS public.fn_debt_concentration(UUID, TEXT);

CREATE FUNCTION public.fn_debt_concentration(
    p_organization_id UUID  DEFAULT NULL,
    p_dimension       TEXT  DEFAULT 'INSTITUICAO'
)
RETURNS TABLE (
    chave      TEXT,
    rotulo     TEXT,
    saldo      NUMERIC,
    encargos   NUMERIC,
    pct        NUMERIC,
    n_contratos BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH b AS (
        SELECT * FROM public.vw_debt_open_installments v
         WHERE p_organization_id IS NULL OR v.organization_id = p_organization_id
    ),
    marcado AS (
        SELECT
            b.*,
            CASE p_dimension
                WHEN 'INSTITUICAO' THEN COALESCE(b.institution_supplier_id::TEXT, 'SEM_INSTITUICAO')
                WHEN 'INDEXADOR'   THEN COALESCE(b.index_name, 'PREFIXADO')
                WHEN 'MODALIDADE'  THEN b.modality
                WHEN 'EMPRESA'     THEN COALESCE(b.company_id::TEXT, 'SEM_EMPRESA')
                WHEN 'TAXA'        THEN b.rate_type
                ELSE 'TODOS'
            END AS k
        FROM b
    ),
    agrupado AS (
        SELECT
            m.k,
            SUM(m.amortization) AS saldo,
            SUM(m.interest + m.monetary_correction + m.iof + m.insurance + m.fees) AS encargos,
            COUNT(DISTINCT m.debt_contract_id) AS n_contratos
        FROM marcado m
        GROUP BY m.k
    )
    SELECT
        a.k,
        COALESCE(
            CASE p_dimension
                WHEN 'INSTITUICAO' THEN sup.name
                WHEN 'EMPRESA'     THEN COALESCE(comp.nome_fantasia, comp.razao_social)
                ELSE a.k
            END,
            a.k
        ),
        a.saldo,
        a.encargos,
        ROUND(a.saldo / NULLIF(SUM(a.saldo) OVER (), 0) * 100, 2),
        a.n_contratos
    FROM agrupado a
    LEFT JOIN public.suppliers sup
           ON p_dimension = 'INSTITUICAO'
          AND a.k <> 'SEM_INSTITUICAO'
          AND sup.id = a.k::UUID
    LEFT JOIN public.companies comp
           ON p_dimension = 'EMPRESA'
          AND a.k <> 'SEM_EMPRESA'
          AND comp.id = a.k::UUID
    ORDER BY a.saldo DESC;
$$;

COMMENT ON FUNCTION public.fn_debt_concentration(UUID, TEXT) IS
    'Concentracao da divida por INSTITUICAO | INDEXADOR | MODALIDADE | EMPRESA '
    '| TAXA. Dimensao por whitelist em CASE, sem SQL dinamico.';

REVOKE ALL ON FUNCTION public.fn_debt_concentration(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_concentration(UUID, TEXT) TO authenticated;

-- ==========================================================================
-- 4. fn_debt_schedule_curve — curva de amortização e calendário
-- ==========================================================================

DROP FUNCTION IF EXISTS public.fn_debt_schedule_curve(UUID, DATE, INT);

CREATE FUNCTION public.fn_debt_schedule_curve(
    p_organization_id UUID DEFAULT NULL,
    p_from            DATE DEFAULT CURRENT_DATE,
    p_months          INT  DEFAULT 24
)
RETURNS TABLE (
    mes                 DATE,
    amortizacao         NUMERIC,
    juros               NUMERIC,
    encargos            NUMERIC,
    parcela             NUMERIC,
    saldo_remanescente  NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH b AS (
        SELECT * FROM public.vw_debt_open_installments v
         WHERE p_organization_id IS NULL OR v.organization_id = p_organization_id
    ),
    total AS (SELECT COALESCE(SUM(b.amortization), 0) AS saldo FROM b),
    meses AS (
        SELECT generate_series(
                   date_trunc('month', p_from)::DATE,
                   (date_trunc('month', p_from) + make_interval(months => p_months - 1))::DATE,
                   '1 month'
               )::DATE AS mes
    ),
    por_mes AS (
        SELECT
            m.mes,
            COALESCE(SUM(b.amortization), 0) AS amortizacao,
            COALESCE(SUM(b.interest), 0)     AS juros,
            COALESCE(SUM(b.monetary_correction + b.iof + b.insurance + b.fees), 0) AS encargos,
            COALESCE(SUM(b.total), 0)        AS parcela
        FROM meses m
        LEFT JOIN b ON date_trunc('month', b.due_date)::DATE = m.mes
        GROUP BY m.mes
    )
    SELECT
        p.mes,
        p.amortizacao,
        p.juros,
        p.encargos,
        p.parcela,
        -- Saldo remanescente = total menos o que já amortizou ATÉ este mês.
        -- É a curva descendente que o PRD pede ("evolução do saldo devedor").
        (SELECT t.saldo FROM total t)
          - SUM(p.amortizacao) OVER (ORDER BY p.mes ROWS UNBOUNDED PRECEDING)
    FROM por_mes p
    ORDER BY p.mes;
$$;

COMMENT ON FUNCTION public.fn_debt_schedule_curve(UUID, DATE, INT) IS
    'Serie mensal de amortizacao/juros/encargos e a curva descendente do saldo '
    'devedor. Mes sem parcela vem com zero, nao some — senao o grafico mente '
    'sobre a continuidade da divida.';

REVOKE ALL ON FUNCTION public.fn_debt_schedule_curve(UUID, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_schedule_curve(UUID, DATE, INT) TO authenticated;

-- ==========================================================================
-- 5. vw_debt_by_target — dívida e custo financeiro por destino (PRD item 7)
-- ==========================================================================
-- É o que responde "qual dívida financia cada obra/empreendimento" e o que
-- torna o rateio útil: a linha do razão tem UMA coluna de obra, então com
-- rateio múltiplo o vínculo só existe aqui.

CREATE OR REPLACE VIEW public.vw_debt_by_target
WITH (security_invoker = on) AS
SELECT
    a.organization_id,
    a.target_kind,
    a.target_id,
    a.debt_contract_id,
    a.percent,
    ROUND(SUM(v.amortization) * a.percent / 100.0, 2) AS saldo_rateado,
    ROUND(SUM(v.interest + v.monetary_correction + v.iof + v.insurance + v.fees)
          * a.percent / 100.0, 2)                     AS encargos_rateados,
    ROUND(SUM(v.total) * a.percent / 100.0, 2)        AS servico_rateado,
    MIN(v.due_date)                                   AS proximo_vencimento,
    COUNT(*)                                          AS n_parcelas
FROM public.debt_allocations a
JOIN public.vw_debt_open_installments v ON v.debt_contract_id = a.debt_contract_id
GROUP BY a.organization_id, a.target_kind, a.target_id, a.debt_contract_id, a.percent;

COMMENT ON VIEW public.vw_debt_by_target IS
    'Divida e custo financeiro rateados por destino (obra, empreendimento, '
    'empresa, centro de custo, bem...). Uma linha por (destino, contrato) — '
    'somar por destino para o total. Ja exclui a perna CREDORA do mutuo.';

REVOKE ALL ON public.vw_debt_by_target FROM anon;
GRANT SELECT ON public.vw_debt_by_target TO authenticated;

-- ==========================================================================
-- 6. Conferência
-- ==========================================================================
-- 6.a. As views existem com security_invoker (senão rodariam como o dono e
--      furariam a RLS):
-- SELECT relname, reloptions FROM pg_class
--  WHERE relname IN ('vw_debt_open_installments','vw_debt_by_target');
--    -> esperado: {security_invoker=on} nas duas
--
-- 6.b. anon não lê:
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE grantee='anon' AND table_name IN ('vw_debt_open_installments','vw_debt_by_target');
--    -> esperado: vazio
--
-- 6.c. As 3 funções existem e estão fechadas para PUBLIC:
-- SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname LIKE 'fn_debt_%';
--    -> esperado: auth_ok = t, anon_pode = f nas três
--
-- 6.d. Fumaça (sem dívida cadastrada devolve zeros, não erro nem NULL):
-- SELECT * FROM public.fn_debt_position(NULL, CURRENT_DATE);
--    -> esperado: 1 linha, tudo 0
-- SELECT COUNT(*) FROM public.fn_debt_schedule_curve(NULL, CURRENT_DATE, 24);
--    -> esperado: 24 (mês sem parcela vem zerado, não some)
-- SELECT * FROM public.fn_debt_concentration(NULL, 'INSTITUICAO');
--    -> esperado: vazio, sem erro
--
-- 6.e. 🔴 O mútuo não conta duas vezes. Com um mútuo cadastrado:
-- SELECT (SELECT divida_total FROM public.fn_debt_position('<org>')) AS consolidado,
--        (SELECT COALESCE(SUM(i.amortization),0)
--           FROM public.debt_installments i
--           JOIN public.debt_schedules s ON s.id=i.debt_schedule_id AND s.kind='VIGENTE' AND s.is_active
--           JOIN public.debt_contracts c ON c.id=s.debt_contract_id
--          WHERE c.organization_id='<org>' AND i.status NOT IN ('PAGA','CANCELADA')) AS cru;
--    -> esperado: `cru` MAIOR que `consolidado` pelo valor do mútuo
--
-- 6.f. Soma da concentração fecha 100%:
-- SELECT ROUND(SUM(pct),2) FROM public.fn_debt_concentration('<org>','INSTITUICAO');
--    -> esperado: 100.00 (ou vazio, sem dívida)
-- ==========================================================================
-- FIM: aplicar_20270915000004_debt_kpis.sql
-- ==========================================================================
