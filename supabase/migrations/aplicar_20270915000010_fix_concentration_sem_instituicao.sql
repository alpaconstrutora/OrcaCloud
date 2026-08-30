-- ==========================================================================
-- Correção · fn_debt_concentration quebra com contrato SEM instituição
-- Date: 2026-08-30
-- Altera: fn_debt_concentration
-- Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
-- ==========================================================================
-- 🔴 O DEFEITO, achado no passeio do mútuo intercompany em 30/08:
--
--   22P02: invalid input syntax for type uuid: "SEM_INSTITUICAO"
--
-- A versão da `aplicar_20270915000004` usava uma sentinela de TEXTO como chave
-- e depois convertia para uuid no JOIN, protegida por um guarda:
--
--   LEFT JOIN public.suppliers sup
--          ON p_dimension = 'INSTITUICAO'
--         AND a.k <> 'SEM_INSTITUICAO'
--         AND sup.id = a.k::UUID          -- <— estoura mesmo com o guarda
--
-- **O Postgres não garante a ordem de avaliação das condições de um JOIN.** O
-- cast pode rodar antes do guarda, e aí a sentinela vai para `::uuid` e a
-- consulta inteira morre.
--
-- Só aparece quando existe contrato SEM instituição financeira — ou seja,
-- exatamente um MÚTUO entre empresas do grupo. Passou por todos os passeios
-- anteriores porque nenhum tinha mútuo.
--
-- A correção não conserta o cast: **elimina o cast**. A chave textual continua
-- sendo a chave de agrupamento, e o uuid vira uma coluna própria, já uuid,
-- nula quando não existe.
--
-- ⚠️ EFEITO COLATERAL QUE ISTO CAUSAVA NA TELA: a "Posição consolidada"
-- carrega posição, curva, concentração e destinos num `Promise.all`. Com a
-- concentração estourando, o conjunto todo rejeitava e os KPIs ficavam no
-- default zerado — a tela mostrava "Dívida total R$ 0,00" tendo R$ 100.000 de
-- dívida real. Zero que parece dado é pior que erro. O lado do front foi
-- corrigido junto, em `DebtDashboard.tsx`.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_debt_concentration') THEN
        RAISE EXCEPTION 'ABORTADO: fn_debt_concentration nao existe (rode aplicar_20270915000004 antes).';
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_debt_concentration(UUID, TEXT);

CREATE FUNCTION public.fn_debt_concentration(
    p_organization_id UUID  DEFAULT NULL,
    p_dimension       TEXT  DEFAULT 'INSTITUICAO'
)
RETURNS TABLE (
    chave       TEXT,
    rotulo      TEXT,
    saldo       NUMERIC,
    encargos    NUMERIC,
    pct         NUMERIC,
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
            -- Chave de AGRUPAMENTO: texto, com sentinela legível.
            CASE p_dimension
                WHEN 'INSTITUICAO' THEN COALESCE(b.institution_supplier_id::TEXT, 'SEM_INSTITUICAO')
                WHEN 'INDEXADOR'   THEN COALESCE(b.index_name, 'PREFIXADO')
                WHEN 'MODALIDADE'  THEN b.modality
                WHEN 'EMPRESA'     THEN COALESCE(b.company_id::TEXT, 'SEM_EMPRESA')
                WHEN 'TAXA'        THEN b.rate_type
                ELSE 'TODOS'
            END AS k,
            -- Chave de JOIN: já uuid, NULL quando não há. Sem cast de texto,
            -- não há como a sentinela chegar em `::uuid`.
            CASE p_dimension
                WHEN 'INSTITUICAO' THEN b.institution_supplier_id
                WHEN 'EMPRESA'     THEN b.company_id
                ELSE NULL::uuid
            END AS k_uuid
        FROM b
    ),
    agrupado AS (
        SELECT
            m.k,
            m.k_uuid,
            SUM(m.amortization) AS saldo,
            SUM(m.interest + m.monetary_correction + m.iof + m.insurance + m.fees) AS encargos,
            COUNT(DISTINCT m.debt_contract_id) AS n_contratos
        FROM marcado m
        GROUP BY m.k, m.k_uuid
    )
    SELECT
        a.k,
        COALESCE(
            CASE p_dimension
                WHEN 'INSTITUICAO' THEN sup.name
                WHEN 'EMPRESA'     THEN COALESCE(comp.nome_fantasia, comp.razao_social)
                ELSE a.k
            END,
            -- Rótulo legível para as sentinelas: "SEM_INSTITUICAO" na tela seria
            -- ruído. Mútuo e contrato sem banco caem aqui.
            CASE a.k
                WHEN 'SEM_INSTITUICAO' THEN 'Sem instituição (mútuo / parte relacionada)'
                WHEN 'SEM_EMPRESA'     THEN 'Sem empresa'
                ELSE a.k
            END
        ),
        a.saldo,
        a.encargos,
        ROUND(a.saldo / NULLIF(SUM(a.saldo) OVER (), 0) * 100, 2),
        a.n_contratos
    FROM agrupado a
    LEFT JOIN public.suppliers sup  ON sup.id  = a.k_uuid AND p_dimension = 'INSTITUICAO'
    LEFT JOIN public.companies comp ON comp.id = a.k_uuid AND p_dimension = 'EMPRESA'
    ORDER BY a.saldo DESC;
$$;

COMMENT ON FUNCTION public.fn_debt_concentration(UUID, TEXT) IS
    'Concentracao da divida por INSTITUICAO | INDEXADOR | MODALIDADE | EMPRESA '
    '| TAXA. A chave de agrupamento e texto (com sentinela) e a de join e uuid '
    'separada — converter a sentinela para uuid quebrava a funcao inteira '
    'quando havia contrato sem instituicao, isto e, num mutuo (22P02, 30/08).';

REVOKE ALL ON FUNCTION public.fn_debt_concentration(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_debt_concentration(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_concentration(UUID, TEXT) TO authenticated;

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. 🔴 O caso que quebrava: contrato SEM instituição (mútuo).
--    Com um mútuo cadastrado e cronograma gerado:
-- SELECT chave, rotulo, saldo, pct FROM public.fn_debt_concentration('<org>','INSTITUICAO');
--    -> esperado: roda SEM erro, e a linha do mútuo aparece como
--       'Sem instituição (mútuo / parte relacionada)'
--
-- b. As outras dimensões seguem funcionando:
-- SELECT COUNT(*) FROM public.fn_debt_concentration('<org>','MODALIDADE');
-- SELECT COUNT(*) FROM public.fn_debt_concentration('<org>','EMPRESA');
-- SELECT COUNT(*) FROM public.fn_debt_concentration('<org>','INDEXADOR');
-- SELECT COUNT(*) FROM public.fn_debt_concentration('<org>','TAXA');
--    -> esperado: todas rodam sem erro
--
-- c. A soma continua fechando 100%:
-- SELECT ROUND(SUM(pct),2) FROM public.fn_debt_concentration('<org>','INSTITUICAO');
--    -> esperado: 100.00 (ou vazio, sem dívida)
--
-- d. Continua fechada para anon:
-- SELECT has_function_privilege('anon','public.fn_debt_concentration(uuid,text)','EXECUTE');
--    -> esperado: f
-- ==========================================================================
-- FIM: aplicar_20270915000010_fix_concentration_sem_instituicao.sql
-- ==========================================================================
