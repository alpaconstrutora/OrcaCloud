-- ==========================================================================
-- Gestão de Dívidas · MVP 2 F2b — Covenants e conflito de garantias
-- Date: 2026-08-30
-- Cria: debt_covenants, debt_covenant_measurements,
--       fn_debt_covenant_evaluate, vw_debt_guarantee_conflicts
-- Plano: docs/planos/2026-08-30-dividas-mvp2-simulador.md
-- ==========================================================================
-- CONTEXTO
-- Decisão do usuário (2026-08-30): apuração **híbrida** — automática onde o
-- sistema sabe calcular, manual com evidência no resto.
--
-- 🔴 O QUE A MEDIÇÃO MOSTROU (30/08, contra o banco real):
--   lançamentos no razão ................ 2.300
--   com payment_account_id .............. 1
--   payment_accounts com opening_balance . 0 (de 4 contas)
--
-- Ou seja: **não há como derivar saldo de caixa**. Isso decide o desenho:
-- "Dívida LÍQUIDA/EBITDA" — o covenant mais cobrado por banco — não pode ser
-- automático, porque dívida líquida = dívida bruta − caixa. Fingir que dá
-- produziria um número que o banco calcula de outro jeito, que é exatamente o
-- risco que a opção "tudo automático" carregava.
--
-- O corte honesto, então:
--   AUTOMÁTICO  — só o que sai de fn_debt_position + fn_dre_summary:
--                 dívida BRUTA/EBITDA, DSCR, limite de endividamento,
--                 e validade de avaliação das garantias.
--   SEMIAUTOMÁTICO — dívida LÍQUIDA/EBITDA: o sistema calcula assim que o
--                 usuário informar o caixa do período (parâmetro p_caixa).
--   MANUAL      — o resto, com evidência anexada e responsável.
--
-- `comparator` diz se a meta é TETO ('MAX', ex.: dívida/EBITDA ≤ 3,0) ou PISO
-- ('MIN', ex.: DSCR ≥ 1,2). Sem isso não dá para saber o que é violação, e um
-- covenant invertido é pior que covenant nenhum.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_debt_position') THEN
        RAISE EXCEPTION 'ABORTADO: fn_debt_position nao existe (rode aplicar_20270915000004 antes).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_dre_summary') THEN
        RAISE EXCEPTION 'ABORTADO: fn_dre_summary nao existe.';
    END IF;
END $$;

-- ==========================================================================
-- 1. debt_covenants — a definição
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_covenants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- NULL = covenant do GRUPO (vale para toda a organização). Preenchido =
    -- cláusula de um contrato específico. Os dois casos existem de verdade.
    debt_contract_id    uuid REFERENCES public.debt_contracts(id) ON DELETE CASCADE,
    company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,

    name                text NOT NULL,
    kind                text NOT NULL CHECK (kind IN (
        'DIVIDA_BRUTA_EBITDA', 'DIVIDA_LIQUIDA_EBITDA', 'DSCR',
        'LIMITE_ENDIVIDAMENTO', 'VALIDADE_GARANTIAS',
        'PL_MINIMO', 'SALDO_BANCARIO_MINIMO', 'INDICE_LIQUIDEZ',
        'LIMITE_DIVIDENDOS', 'ENVIO_BALANCO', 'SEGURO_OBRIGATORIO',
        'RESTRICAO_NOVAS_DIVIDAS', 'OUTRO'
    )),
    -- Fórmula em texto: é a cláusula como o CONTRATO a escreve. O sistema
    -- calcula pelo `kind`; este campo existe para conferir se a definição do
    -- banco bate com a que o sistema usa — e elas divergem com frequência.
    formula             text,
    apuracao            text NOT NULL DEFAULT 'MANUAL'
                        CHECK (apuracao IN ('AUTOMATICA', 'SEMIAUTOMATICA', 'MANUAL')),
    periodicity         text NOT NULL DEFAULT 'TRIMESTRAL'
                        CHECK (periodicity IN ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
    -- 'MAX' = teto (não pode passar). 'MIN' = piso (não pode ficar abaixo).
    comparator          text NOT NULL DEFAULT 'MAX' CHECK (comparator IN ('MAX', 'MIN')),
    threshold           numeric(18,4) NOT NULL,
    -- Faixa de ATENÇÃO antes de violar: 10 = acende amarelo a 10% da meta.
    warning_margin_pct  numeric(6,2) NOT NULL DEFAULT 10 CHECK (warning_margin_pct >= 0),
    unit                text,
    responsible         text,
    is_active           boolean NOT NULL DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.debt_covenants IS
    'Covenants e obrigacoes contratuais (PRD item 9). debt_contract_id NULL = '
    'covenant do grupo. A apuracao e hibrida: AUTOMATICA sai de '
    'fn_debt_position + fn_dre_summary; SEMIAUTOMATICA precisa do caixa '
    'informado; MANUAL e lancada com evidencia.';
COMMENT ON COLUMN public.debt_covenants.comparator IS
    'MAX = teto (divida/EBITDA <= 3). MIN = piso (DSCR >= 1,2). Covenant com '
    'comparador invertido e pior que covenant nenhum: acusa violacao onde esta '
    'regular e cala onde estourou.';
COMMENT ON COLUMN public.debt_covenants.formula IS
    'A clausula COMO O CONTRATO ESCREVE. O sistema calcula pelo kind; este '
    'campo existe para conferir se a definicao do banco (qual EBITDA? 12 meses '
    'moveis?) bate com a que o sistema usa.';

CREATE INDEX IF NOT EXISTS idx_debt_covenants_org
    ON public.debt_covenants (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_debt_covenants_contrato
    ON public.debt_covenants (debt_contract_id) WHERE debt_contract_id IS NOT NULL;

-- ==========================================================================
-- 2. debt_covenant_measurements — a apuração de cada período
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.debt_covenant_measurements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    covenant_id         uuid NOT NULL REFERENCES public.debt_covenants(id) ON DELETE CASCADE,
    reference_date      date NOT NULL,
    apurado             numeric(18,4),
    situacao            text NOT NULL DEFAULT 'REGULAR'
                        CHECK (situacao IN ('REGULAR', 'ATENCAO', 'VIOLADO', 'NAO_APURADO')),
    -- Distância até a meta, em % — é o que responde "quanto falta estourar".
    margem_pct          numeric(10,2),
    -- Insumos usados no cálculo, para a apuração ser reproduzível meses depois.
    inputs              jsonb,
    evidence_url        text,
    notes               text,
    measured_by         uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Uma apuração por covenant por data: duas linhas para o mesmo período
    -- fariam o painel mostrar a situação que a consulta pegou primeiro.
    CONSTRAINT debt_covenant_measurements_unica UNIQUE (covenant_id, reference_date)
);

COMMENT ON TABLE public.debt_covenant_measurements IS
    'Apuracao de um covenant num periodo. `inputs` guarda os numeros usados '
    '(divida, EBITDA, servico, caixa) para a conta ser reproduzivel depois — '
    'sem isso, um covenant violado vira discussao sem prova.';

CREATE INDEX IF NOT EXISTS idx_debt_covenant_measurements_cov
    ON public.debt_covenant_measurements (covenant_id, reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_debt_covenant_measurements_risco
    ON public.debt_covenant_measurements (organization_id, situacao, reference_date DESC)
    WHERE situacao IN ('ATENCAO', 'VIOLADO');

-- ==========================================================================
-- 3. RLS e updated_at
-- ==========================================================================

DROP TRIGGER IF EXISTS trg_debt_covenants_touch ON public.debt_covenants;
CREATE TRIGGER trg_debt_covenants_touch
    BEFORE UPDATE ON public.debt_covenants
    FOR EACH ROW EXECUTE FUNCTION public.fn_debt_touch();

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['debt_covenants', 'debt_covenant_measurements']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_org_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
            'USING (public.is_org_member(organization_id)) '
            'WITH CHECK (public.is_org_member(organization_id));', t || '_org_all', t);
        -- REVOKE de anon explícito: ALTER DEFAULT PRIVILEGES do Supabase concede
        -- a `anon`, e revogar de PUBLIC não remove grant de papel nomeado.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    END LOOP;
END $$;

-- ==========================================================================
-- 4. fn_debt_covenant_evaluate — a apuração automática
-- ==========================================================================
-- Devolve o valor apurado, a situação e os insumos. NÃO grava: quem grava é o
-- serviço, depois de o usuário conferir. Apuração que se grava sozinha vira
-- número que ninguém revisou.
--
-- `p_caixa` é o que torna DIVIDA_LIQUIDA_EBITDA calculável — ver contexto.

DROP FUNCTION IF EXISTS public.fn_debt_covenant_evaluate(UUID, DATE, NUMERIC);

CREATE FUNCTION public.fn_debt_covenant_evaluate(
    p_covenant_id UUID,
    p_ref_date    DATE    DEFAULT CURRENT_DATE,
    p_caixa       NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    apurado     NUMERIC,
    situacao    TEXT,
    margem_pct  NUMERIC,
    inputs      JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cov            public.debt_covenants%ROWTYPE;
    v_divida_bruta   NUMERIC := 0;
    v_servico_12m    NUMERIC := 0;
    v_ebitda_12m     NUMERIC := 0;
    v_garantias_venc INT     := 0;
    v_apurado        NUMERIC;
    v_situacao       TEXT;
    v_margem         NUMERIC;
    v_inputs         JSONB;
BEGIN
    SELECT * INTO v_cov FROM public.debt_covenants WHERE id = p_covenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Covenant % nao encontrado.', p_covenant_id USING ERRCODE = 'P0002';
    END IF;

    -- Insumos comuns. A RLS de fn_debt_position/fn_dre_summary recorta a org.
    SELECT d.divida_total, d.servico_365
      INTO v_divida_bruta, v_servico_12m
      FROM public.fn_debt_position(v_cov.organization_id, p_ref_date) d;

    SELECT s.valor_realizado INTO v_ebitda_12m
      FROM public.fn_dre_summary(v_cov.organization_id,
                                 (p_ref_date - INTERVAL '12 months')::date,
                                 p_ref_date, NULL, 'CAIXA') s
     WHERE s.linha = '= EBITDA';
    v_ebitda_12m := COALESCE(v_ebitda_12m, 0);

    v_apurado := CASE v_cov.kind
        WHEN 'DIVIDA_BRUTA_EBITDA' THEN
            CASE WHEN v_ebitda_12m > 0 THEN v_divida_bruta / v_ebitda_12m END
        WHEN 'DIVIDA_LIQUIDA_EBITDA' THEN
            -- Só calcula com o caixa informado. NULL aqui vira NAO_APURADO
            -- adiante — melhor "não sei" do que um numero inventado.
            CASE WHEN p_caixa IS NOT NULL AND v_ebitda_12m > 0
                 THEN (v_divida_bruta - p_caixa) / v_ebitda_12m END
        WHEN 'DSCR' THEN
            CASE WHEN v_servico_12m > 0 THEN v_ebitda_12m / v_servico_12m END
        WHEN 'LIMITE_ENDIVIDAMENTO' THEN v_divida_bruta
        WHEN 'VALIDADE_GARANTIAS' THEN NULL   -- preenchido abaixo
        ELSE NULL                              -- MANUAL: o serviço informa
    END;

    IF v_cov.kind = 'VALIDADE_GARANTIAS' THEN
        SELECT COUNT(*) INTO v_garantias_venc
          FROM public.contract_guarantees g
         WHERE g.organization_id = v_cov.organization_id
           AND g.debt_contract_id IS NOT NULL
           AND g.released_at IS NULL
           AND g.valuation_valid_until IS NOT NULL
           AND g.valuation_valid_until < p_ref_date;
        v_apurado := v_garantias_venc;
    END IF;

    v_inputs := jsonb_build_object(
        'divida_bruta',    v_divida_bruta,
        'servico_12m',     v_servico_12m,
        'ebitda_12m',      v_ebitda_12m,
        'caixa_informado', p_caixa,
        'ref_date',        p_ref_date,
        'kind',            v_cov.kind,
        'comparator',      v_cov.comparator,
        'threshold',       v_cov.threshold
    );

    IF v_apurado IS NULL THEN
        RETURN QUERY SELECT NULL::NUMERIC, 'NAO_APURADO'::TEXT, NULL::NUMERIC, v_inputs;
        RETURN;
    END IF;

    -- Margem: quanto o apurado está DENTRO da meta, em %. Negativa = violado.
    v_margem := CASE
        WHEN v_cov.threshold = 0 THEN NULL
        WHEN v_cov.comparator = 'MAX' THEN (v_cov.threshold - v_apurado) / ABS(v_cov.threshold) * 100
        ELSE (v_apurado - v_cov.threshold) / ABS(v_cov.threshold) * 100
    END;

    v_situacao := CASE
        WHEN v_margem IS NULL THEN 'NAO_APURADO'
        WHEN v_margem < 0 THEN 'VIOLADO'
        WHEN v_margem <= v_cov.warning_margin_pct THEN 'ATENCAO'
        ELSE 'REGULAR'
    END;

    RETURN QUERY SELECT round(v_apurado, 4), v_situacao, round(v_margem, 2), v_inputs;
END;
$$;

COMMENT ON FUNCTION public.fn_debt_covenant_evaluate(UUID, DATE, NUMERIC) IS
    'Apura um covenant e devolve valor, situacao, margem e os insumos usados. '
    'NAO grava — quem grava e o servico, depois de o usuario conferir. '
    'DIVIDA_LIQUIDA_EBITDA exige p_caixa: nao ha saldo de caixa derivavel no '
    'sistema (medido em 30/08: 1 de 2.300 lancamentos tem conta).';

REVOKE ALL ON FUNCTION public.fn_debt_covenant_evaluate(UUID, DATE, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.fn_debt_covenant_evaluate(UUID, DATE, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_debt_covenant_evaluate(UUID, DATE, NUMERIC) TO authenticated;

-- ==========================================================================
-- 5. vw_debt_guarantee_conflicts — o alerta do PRD item 8
-- ==========================================================================
-- "Deve haver alerta para um mesmo ativo oferecido em mais de uma operação
-- incompatível." Aqui: mesmo `asset_id` vivo (não liberado) em dois ou mais
-- contratos de dívida.

CREATE OR REPLACE VIEW public.vw_debt_guarantee_conflicts
WITH (security_invoker = on) AS
SELECT
    g.organization_id,
    g.asset_id,
    a.name                                   AS asset_name,
    a.code                                   AS asset_code,
    COUNT(DISTINCT g.debt_contract_id)       AS n_operacoes,
    SUM(COALESCE(g.accepted_value, 0))       AS valor_aceito_somado,
    MAX(COALESCE(a.purchase_value, 0))       AS valor_do_bem,
    array_agg(DISTINCT g.debt_contract_id)   AS contratos
FROM public.contract_guarantees g
JOIN public.opura_assets a ON a.id = g.asset_id
WHERE g.asset_id IS NOT NULL
  AND g.debt_contract_id IS NOT NULL
  AND g.released_at IS NULL
  AND g.is_active
GROUP BY g.organization_id, g.asset_id, a.name, a.code
HAVING COUNT(DISTINCT g.debt_contract_id) > 1;

COMMENT ON VIEW public.vw_debt_guarantee_conflicts IS
    'Mesmo bem dado em garantia em MAIS DE UMA operacao de divida viva (PRD '
    'item 8). Nao julga se e incompativel — mostra o fato para quem decide.';

REVOKE ALL ON public.vw_debt_guarantee_conflicts FROM anon;
GRANT SELECT ON public.vw_debt_guarantee_conflicts TO authenticated;

-- ==========================================================================
-- 6. Conferência
-- ==========================================================================
-- 6.a. Tabelas com RLS e sem anon:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('debt_covenants','debt_covenant_measurements');
--    -> esperado: t nas duas
-- SELECT COUNT(*) FROM information_schema.role_table_grants
--  WHERE grantee='anon' AND table_name LIKE 'debt_covenant%';
--    -> esperado: 0
--
-- 6.b. A função está fechada para anon:
-- SELECT has_function_privilege('anon','public.fn_debt_covenant_evaluate(uuid,date,numeric)','EXECUTE') AS anon_pode,
--        has_function_privilege('authenticated','public.fn_debt_covenant_evaluate(uuid,date,numeric)','EXECUTE') AS auth_ok;
--    -> esperado: f / t
--
-- 6.c. 🔴 O comparador funciona nos DOIS sentidos. Crie dois covenants na mesma
--      org e apure:
--   TETO   — kind='LIMITE_ENDIVIDAMENTO', comparator='MAX', threshold=1000000
--            -> com dívida 0, margem ~100% e situacao REGULAR
--   PISO   — kind='DSCR', comparator='MIN', threshold=1.2
--            -> sem EBITDA nem serviço, apurado NULL e situacao NAO_APURADO
-- SELECT * FROM public.fn_debt_covenant_evaluate('<covenant>', CURRENT_DATE);
--
-- 6.d. DIVIDA_LIQUIDA_EBITDA sem caixa NÃO inventa número:
-- SELECT situacao FROM public.fn_debt_covenant_evaluate('<covenant-dl>', CURRENT_DATE, NULL);
--    -> esperado: NAO_APURADO
-- SELECT apurado  FROM public.fn_debt_covenant_evaluate('<covenant-dl>', CURRENT_DATE, 500000);
--    -> esperado: número (ou NAO_APURADO se o EBITDA do período for <= 0)
--
-- 6.e. Conflito de garantias (sem garantia de dívida cadastrada, vazio):
-- SELECT * FROM public.vw_debt_guarantee_conflicts;
--    -> esperado: 0 linhas, sem erro
-- ==========================================================================
-- FIM: aplicar_20270915000008_debt_covenants.sql
-- ==========================================================================
