-- aplicar_20271116906100_bi_narrative_limite_de_uso.sql
--
-- BI Executivo › IA & Relatórios — limite diário de uso da Edge bi-narrative.
--
-- Por quê: a bi-narrative chama a API da Anthropic com a chave da PLATAFORMA
-- (ANTHROPIC_API_KEY). Sem teto, qualquer conta (inclusive autocadastrada, que
-- cria a própria organização) chamava a função sem fim e a conta da IA corria
-- por nossa conta. O teto é contado no banco — a Edge não guarda estado:
--   * por usuário      → 100 narrativas por dia;
--   * por organização  → 300 narrativas por dia (só quando a chamada é de uma
--     organização; em "Todas as organizações" conta só o usuário).
-- "Dia" = dia civil de America/Sao_Paulo.
-- Estouro → ERRCODE 54000 'Limite diário de narrativas de IA atingido — tente de
-- novo amanhã.'; a Edge devolve 429 com essa mensagem.
-- A contagem entra na transação da chamada RPC: o estouro desfaz o próprio
-- incremento (e o do usuário, se quem estourou foi a organização) — só conta o
-- que de fato passou.
--
-- REGRA #7: bi_narrative_uso com RLS e ZERO policy e sem privilégio de tabela
-- para os papéis da API; _bi_narrative_cota sem EXECUTE para PUBLIC, anon e
-- authenticated — só a service_role (a Edge) executa.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).

SET lock_timeout = '5s';

-- ── Contagem de uso ─────────────────────────────────────────────────────────
-- Uma linha por (escopo, alvo, dia). alvo = auth.users.id (escopo 'usuario') ou
-- organizations.id (escopo 'organizacao'). Linhas com mais de 2 dias somem na
-- chamada seguinte do mesmo alvo (_bi_narrative_cota).
CREATE TABLE IF NOT EXISTS public.bi_narrative_uso (
    escopo TEXT NOT NULL CHECK (escopo IN ('usuario', 'organizacao')),
    alvo   UUID NOT NULL,
    dia    DATE NOT NULL,
    n      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (escopo, alvo, dia)
);

COMMENT ON TABLE public.bi_narrative_uso IS
    'BI Executivo: uso diário da Edge bi-narrative por usuário e por organização — o limite de uso da IA. '
    'RLS sem policy: escrita só por _bi_narrative_cota (SECURITY DEFINER).';

-- Privilégio de tabela tirado já na criação: sem janela com os default privileges.
REVOKE ALL ON TABLE public.bi_narrative_uso FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bi_narrative_uso ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito.

-- ── Cota (interno) ──────────────────────────────────────────────────────────
-- Conta mais uma narrativa para o usuário (e para a organização, quando
-- informada) no dia corrente, e recusa com 54000 acima do teto. Quem chama (a
-- Edge) já validou o JWT e o vínculo com a organização. O INSERT … ON CONFLICT
-- trava a linha: chamadas simultâneas não se perdem.
CREATE OR REPLACE FUNCTION public._bi_narrative_cota(p_user UUID, p_org UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dia DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_n   INT;
BEGIN
    IF p_user IS NULL THEN
        RAISE EXCEPTION 'usuário obrigatório' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.bi_narrative_uso AS u (escopo, alvo, dia, n)
    VALUES ('usuario', p_user, v_dia, 1)
    ON CONFLICT (escopo, alvo, dia) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > 100 THEN
        RAISE EXCEPTION 'Limite diário de narrativas de IA atingido — tente de novo amanhã.' USING ERRCODE = '54000';
    END IF;

    IF p_org IS NOT NULL THEN
        INSERT INTO public.bi_narrative_uso AS u (escopo, alvo, dia, n)
        VALUES ('organizacao', p_org, v_dia, 1)
        ON CONFLICT (escopo, alvo, dia) DO UPDATE SET n = u.n + 1
        RETURNING u.n INTO v_n;

        IF v_n > 300 THEN
            RAISE EXCEPTION 'Limite diário de narrativas de IA da organização atingido — tente de novo amanhã.' USING ERRCODE = '54000';
        END IF;

        DELETE FROM public.bi_narrative_uso u
         WHERE u.escopo = 'organizacao' AND u.alvo = p_org AND u.dia < v_dia - 2;
    END IF;

    -- Faxina barata: só as linhas velhas deste alvo (pela chave primária).
    DELETE FROM public.bi_narrative_uso u
     WHERE u.escopo = 'usuario' AND u.alvo = p_user AND u.dia < v_dia - 2;
END;
$$;

-- Interno: nenhum papel da API além da service_role executa.
-- Logo após o CREATE: sem janela com o EXECUTE padrão.
REVOKE ALL ON FUNCTION public._bi_narrative_cota(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._bi_narrative_cota(UUID, UUID) TO service_role;
