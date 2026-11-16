-- ============================================================================
-- Planta Inteligente › IA (Edge Function `planta-ia`) — quem pode usar e quanto
-- (15/11/2026)
--
-- Por quê: cada chamada da `planta-ia` é paga na ANTHROPIC_API_KEY do servidor
-- (pedido: Sonnet; rastrear: Opus com imagem de até ~5 MB e 16 000 tokens de
-- saída). O único portão era o token: qualquer conta do Supabase — portal
-- externo, cadastro novo — gastava a chave sem limite, e o teto de gasto da
-- chave derrubava a IA para todos os tenants.
--
-- A Edge passa a exigir `study_id`, lê `blueprint_studies.organization_id` com o
-- token do PRÓPRIO usuário (RLS) e, imediatamente antes de CADA chamada paga,
-- chama a função abaixo com a service_role.
--
-- 1. planta_ia_uso — contador diário (fuso America/Sao_Paulo) por tipo de uso,
--    um por usuário e um por organização. RLS ligada e SEM policy; nenhum
--    privilégio para anon/authenticated: só a função abaixo (DEFINER) lê e grava.
--
-- 2. _planta_ia_cota(p_user, p_org, p_tipo)
--    · p_user tem de ser membro de p_org em organization_members com a MESMA
--      regra de minhas_orgs_membro() (aplicar_20271111940000): user_id quando a
--      linha tem user_id; na linha legada sem user_id, o e-mail sem diferenciar
--      maiúsculas (o e-mail vem de auth.users, como em is_org_member_de). SEM a
--      perna de broker_profiles: conta de corretor não usa a IA da planta.
--      Não é membro → SQLSTATE 42501 (a Edge devolve 403).
--    · soma 1 no contador do usuário e no da organização; passou do limite →
--      SQLSTATE 54000 (a Edge devolve 429). O RAISE desfaz a transação inteira,
--      então a chamada recusada não conta.
--    · limites por dia:
--        'pedido'   (planta e massa) — 300 por usuário · 1 000 por organização
--        'rastrear' (imagem)         —  60 por usuário ·   200 por organização
--      O de usuário vale somando todas as organizações dele.
--
-- REGRA #7
--   Pergunta 1: não há policy (a tabela fica fechada).
--   Pergunta 2: DEFINER com search_path fixo; REVOKE de PUBLIC, anon e
--   authenticated; EXECUTE só para service_role. A autorização (ser membro) está
--   dentro da função, não só no GRANT.
--
-- ORDEM DE PUBLICAÇÃO: esta migration → frontend (manda `study_id`) → Edge
-- `planta-ia`. Edge nova sem esta função devolve 500 e não chama a IA.
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
--
-- VOLTA (se precisar):
--   DROP FUNCTION IF EXISTS public._planta_ia_cota(UUID, UUID, TEXT);
--   DROP TABLE IF EXISTS public.planta_ia_uso;
-- ============================================================================

-- ── 1. Contador ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planta_ia_uso (
    dia     DATE    NOT NULL,
    tipo    TEXT    NOT NULL CHECK (tipo IN ('pedido', 'rastrear')),
    escopo  TEXT    NOT NULL CHECK (escopo IN ('usuario', 'organizacao')),
    chave   UUID    NOT NULL,
    usos    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, tipo, escopo, chave)
);

COMMENT ON TABLE public.planta_ia_uso IS
    'Uso diário da Edge Function planta-ia (chamadas pagas à Anthropic), por usuário e por organização. '
    'RLS sem policy: acesso só pela função _planta_ia_cota (service_role).';

ALTER TABLE public.planta_ia_uso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planta_ia_uso FROM PUBLIC, anon, authenticated;

-- ── 2. Membro + cota, antes de cada chamada paga ────────────────────────────
CREATE OR REPLACE FUNCTION public._planta_ia_cota(p_user UUID, p_org UUID, p_tipo TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_email          TEXT;
    v_dia            DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_limite_usuario INTEGER;
    v_limite_org     INTEGER;
    v_usos           INTEGER;
BEGIN
    IF p_user IS NULL OR p_org IS NULL THEN
        RAISE EXCEPTION 'Usuário e organização são obrigatórios.' USING ERRCODE = '22023';
    END IF;

    IF p_tipo = 'pedido' THEN
        v_limite_usuario := 300;
        v_limite_org     := 1000;
    ELSIF p_tipo = 'rastrear' THEN
        v_limite_usuario := 60;
        v_limite_org     := 200;
    ELSE
        RAISE EXCEPTION 'Tipo de uso desconhecido.' USING ERRCODE = '22023';
    END IF;

    -- Mesma regra da perna organization_members de minhas_orgs_membro().
    SELECT au.email INTO v_email FROM auth.users au WHERE au.id = p_user;

    IF NOT EXISTS (
        SELECT 1
          FROM public.organization_members m
         WHERE m.organization_id = p_org
           AND (
                 (m.user_id IS NOT NULL AND m.user_id = p_user)
              OR (m.user_id IS NULL AND lower(m.email) = lower(v_email))
           )
    ) THEN
        RAISE EXCEPTION 'Sem acesso à IA desta organização.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.planta_ia_uso AS pu (dia, tipo, escopo, chave, usos)
    VALUES (v_dia, p_tipo, 'usuario', p_user, 1)
    ON CONFLICT (dia, tipo, escopo, chave) DO UPDATE SET usos = pu.usos + 1
    RETURNING pu.usos INTO v_usos;

    IF v_usos > v_limite_usuario THEN
        RAISE EXCEPTION 'Limite diário da IA atingido (% chamadas por usuário). Tente de novo amanhã.', v_limite_usuario
            USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.planta_ia_uso AS pu (dia, tipo, escopo, chave, usos)
    VALUES (v_dia, p_tipo, 'organizacao', p_org, 1)
    ON CONFLICT (dia, tipo, escopo, chave) DO UPDATE SET usos = pu.usos + 1
    RETURNING pu.usos INTO v_usos;

    IF v_usos > v_limite_org THEN
        RAISE EXCEPTION 'Limite diário da IA da organização atingido (% chamadas). Tente de novo amanhã.', v_limite_org
            USING ERRCODE = '54000';
    END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public._planta_ia_cota(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._planta_ia_cota(UUID, UUID, TEXT) TO service_role;
