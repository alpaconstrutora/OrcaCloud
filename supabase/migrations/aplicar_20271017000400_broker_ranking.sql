-- ============================================================
-- Portal do Corretor — Ranking com dado real
-- Plano: docs/planos/2026-10-17-portal-corretor-pendencias.md (F2)
-- Decisão do usuário (17/10/2026, P3): o corretor vê SÓ a própria posição
-- ("3º de 12"), as próprias vendas e volume, e as vendas do 1º como meta — sem
-- nomes de colegas. O gestor vê o ranking completo.
--
-- Fonte: broker_portal_proposals (a tabela `broker_portal_rankings` fica sem
-- uso — ranking é DERIVADO, não um cadastro que alguém precisaria manter).
--   venda   = proposta APROVADA, contada na data da aprovação
--             (reviewed_at; sem ela, updated_at)
--   volume  = soma de total_value das aprovadas
--   enviadas = propostas que saíram do rascunho, criadas no período
-- Universo: os corretores com proposta na organização (qualquer status, qualquer
-- época) + o próprio corretor. Ordem: vendas, depois volume. Quem não vendeu no
-- período fica sem posição (não é "último": é "ainda sem venda").
--
-- Período: 'MES' | 'TRIMESTRE' | 'ANO' (o atual, no fuso de São Paulo). A
-- posição anterior é a do período imediatamente antes, para "subiu/desceu".
--
-- REGRA #7: as três funções são SECURITY DEFINER com a autorização DENTRO.
--   _calc  → núcleo, sem EXECUTE para ninguém além do dono;
--   token  → anon + authenticated, autorização = token válido;
--   gestor → só authenticated, autorização = membro da organização.
-- ============================================================

SET lock_timeout = '5s';

-- ── 0. Núcleo: ranking de uma organização num intervalo ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_ranking_calc(p_org UUID, p_inicio TIMESTAMPTZ, p_fim TIMESTAMPTZ, p_incluir_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH universo AS (
        SELECT DISTINCT lower(p.broker_email) AS email
        FROM public.broker_portal_proposals p
        WHERE p.organization_id = p_org AND p.broker_email IS NOT NULL
        UNION
        SELECT lower(p_incluir_email) WHERE p_incluir_email IS NOT NULL
    ),
    numeros AS (
        SELECT u.email,
               COUNT(*) FILTER (WHERE p.status = 'APROVADA'
                                  AND COALESCE(p.reviewed_at, p.updated_at) >= p_inicio
                                  AND COALESCE(p.reviewed_at, p.updated_at) <  p_fim)            AS vendas,
               COALESCE(SUM(p.total_value) FILTER (WHERE p.status = 'APROVADA'
                                  AND COALESCE(p.reviewed_at, p.updated_at) >= p_inicio
                                  AND COALESCE(p.reviewed_at, p.updated_at) <  p_fim), 0)        AS volume,
               COUNT(*) FILTER (WHERE p.status <> 'RASCUNHO'
                                  AND p.created_at >= p_inicio AND p.created_at < p_fim)          AS enviadas
        FROM universo u
        LEFT JOIN public.broker_portal_proposals p
               ON lower(p.broker_email) = u.email AND p.organization_id = p_org
        GROUP BY u.email
    ),
    ordenado AS (
        SELECT n.*,
               CASE WHEN n.vendas > 0
                    THEN RANK() OVER (ORDER BY n.vendas DESC, n.volume DESC) END AS posicao
        FROM numeros n
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'email', o.email, 'vendas', o.vendas, 'volume', o.volume,
               'enviadas', o.enviadas, 'posicao', o.posicao)
             ORDER BY o.posicao NULLS LAST, o.email), '[]'::jsonb)
    FROM ordenado o;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_ranking_calc(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;

-- Intervalo do período atual e do anterior, no fuso de São Paulo.
CREATE OR REPLACE FUNCTION public.fn_broker_ranking_intervalo(p_periodo TEXT, p_deslocamento INT DEFAULT 0)
RETURNS TABLE (inicio TIMESTAMPTZ, fim TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE  -- usa now(): não pode ser IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unidade TEXT := CASE upper(COALESCE(p_periodo, 'MES'))
                        WHEN 'TRIMESTRE' THEN 'quarter' WHEN 'ANO' THEN 'year' ELSE 'month' END;
    v_passo INTERVAL := CASE v_unidade WHEN 'quarter' THEN INTERVAL '3 months'
                                       WHEN 'year' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    v_base TIMESTAMP := date_trunc(v_unidade, (now() AT TIME ZONE 'America/Sao_Paulo'));
BEGIN
    inicio := ((v_base + v_passo * p_deslocamento) AT TIME ZONE 'America/Sao_Paulo');
    fim    := ((v_base + v_passo * (p_deslocamento + 1)) AT TIME ZONE 'America/Sao_Paulo');
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_ranking_intervalo(TEXT, INT) FROM PUBLIC, anon, authenticated;

-- ── 1. Corretor pelo link: só a própria posição ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_portal_get_ranking(p_token TEXT, p_periodo TEXT DEFAULT 'MES')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tok   public.broker_portal_tokens;
    v_email TEXT;
    v_atual JSONB;
    v_ant   JSONB;
    v_eu    JSONB;
    v_eu_ant JSONB;
    v_ini TIMESTAMPTZ; v_fim TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_tok FROM public.broker_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT lower(email) INTO v_email FROM public.broker_profiles WHERE id = v_tok.broker_id;
    IF v_email IS NULL THEN RETURN '{"valid":false}'::jsonb; END IF;

    SELECT i.inicio, i.fim INTO v_ini, v_fim FROM public.fn_broker_ranking_intervalo(p_periodo, 0) i;
    v_atual := public.fn_broker_ranking_calc(v_tok.org_id, v_ini, v_fim, v_email);
    SELECT i.inicio, i.fim INTO v_ini, v_fim FROM public.fn_broker_ranking_intervalo(p_periodo, -1) i;
    v_ant := public.fn_broker_ranking_calc(v_tok.org_id, v_ini, v_fim, v_email);

    SELECT e INTO v_eu FROM jsonb_array_elements(v_atual) e WHERE e->>'email' = v_email;
    SELECT e INTO v_eu_ant FROM jsonb_array_elements(v_ant) e WHERE e->>'email' = v_email;

    -- Sem nomes nem e-mails de colegas: só números do próprio corretor + a meta.
    RETURN jsonb_build_object(
        'valid',            TRUE,
        'periodo',          upper(COALESCE(p_periodo, 'MES')),
        'posicao',          v_eu->'posicao',
        'posicao_anterior', v_eu_ant->'posicao',
        'total_corretores', jsonb_array_length(v_atual),
        'com_venda',        (SELECT COUNT(*) FROM jsonb_array_elements(v_atual) e WHERE (e->>'vendas')::int > 0),
        'vendas',           COALESCE((v_eu->>'vendas')::int, 0),
        'volume',           COALESCE((v_eu->>'volume')::numeric, 0),
        'enviadas',         COALESCE((v_eu->>'enviadas')::int, 0),
        'vendas_do_lider',  COALESCE((SELECT MAX((e->>'vendas')::int) FROM jsonb_array_elements(v_atual) e), 0)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_portal_get_ranking(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_broker_portal_get_ranking(TEXT, TEXT) TO anon, authenticated;

-- ── 2. Gestor: ranking completo da organização ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_broker_ranking_da_organizacao(p_org UUID, p_periodo TEXT DEFAULT 'MES')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_atual JSONB;
    v_ant   JSONB;
    v_ini TIMESTAMPTZ; v_fim TIMESTAMPTZ;
BEGIN
    IF NOT (public.is_org_member(p_org) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Sem acesso à organização' USING ERRCODE = '42501';
    END IF;

    SELECT i.inicio, i.fim INTO v_ini, v_fim FROM public.fn_broker_ranking_intervalo(p_periodo, 0) i;
    v_atual := public.fn_broker_ranking_calc(p_org, v_ini, v_fim, NULL);
    SELECT i.inicio, i.fim INTO v_ini, v_fim FROM public.fn_broker_ranking_intervalo(p_periodo, -1) i;
    v_ant := public.fn_broker_ranking_calc(p_org, v_ini, v_fim, NULL);

    RETURN COALESCE((
        SELECT jsonb_agg(e || jsonb_build_object(
                   'nome', (SELECT bp.name FROM public.broker_profiles bp WHERE lower(bp.email) = e->>'email' ORDER BY bp.is_active DESC NULLS LAST LIMIT 1),
                   'posicao_anterior', (SELECT a->'posicao' FROM jsonb_array_elements(v_ant) a WHERE a->>'email' = e->>'email'))
                 ORDER BY (e->>'posicao')::int NULLS LAST, e->>'email')
        FROM jsonb_array_elements(v_atual) e
    ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_broker_ranking_da_organizacao(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_broker_ranking_da_organizacao(UUID, TEXT) TO authenticated;
