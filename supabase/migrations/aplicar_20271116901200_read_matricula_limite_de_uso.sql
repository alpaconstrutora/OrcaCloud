-- aplicar_20271116901200_read_matricula_limite_de_uso.sql
--
-- Leitura de matrícula por IA (Edge read-matricula) — limite diário de uso.
--
-- Por quê: a Edge manda o arquivo do cliente para a API da Anthropic com a chave
-- da PLATAFORMA (modelo caro, max_tokens 8000). Antes só conferia que havia um
-- usuário logado — sem organização e sem teto, qualquer conta (cadastro aberto
-- ou de portal) chamava em laço e gastava a chave de todos os tenants. A Edge
-- agora exige ser membro da organização (exigirMembro) e, antes da chamada
-- paga, conta o uso aqui:
--   * por USUÁRIO, somando todas as organizações dele → 200 por dia;
--   * por ORGANIZAÇÃO, somando todos os usuários dela → 500 por dia.
-- "Dia" = data em America/Sao_Paulo. Os tetos ficam bem acima do uso real (a
-- tela lê uma matrícula por vez, e cada leitura leva dezenas de segundos):
-- existem para conter abuso, não para racionar quem trabalha. A conta por
-- usuário é a que segura quem cria várias organizações só para multiplicar a cota.
-- Estouro → ERRCODE 54000; a Edge devolve 429 com a mensagem.
-- A contagem entra na transação da chamada: a recusa (o próprio estouro) desfaz
-- os dois incrementos — só conta o que passou para a IA.
--
-- REGRA #7: read_matricula_uso com RLS e ZERO policy e sem privilégio de tabela
-- para os papéis da API; _read_matricula_cota executável SÓ por service_role
-- (a Edge, depois de exigirMembro). Nenhum papel da API conta nem lê a cota.
--
-- ⚠️ Aplicar à mão ANTES de publicar a Edge: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).

SET lock_timeout = '5s';

-- ── Contagem de uso ──────────────────────────────────────────────────────────
-- Uma linha por (escopo, usuário-ou-org, dia). Linhas com mais de 2 dias somem
-- na chamada seguinte do mesmo usuário/org (_read_matricula_cota).
CREATE TABLE IF NOT EXISTS public.read_matricula_uso (
    escopo TEXT NOT NULL CHECK (escopo IN ('usuario', 'organizacao')),
    chave  UUID NOT NULL,
    dia    DATE NOT NULL,
    n      INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (escopo, chave, dia)
);

COMMENT ON TABLE public.read_matricula_uso IS
    'Leitura de matrícula por IA: uso por usuário e por organização, por dia — o limite de uso da Edge read-matricula. '
    'RLS sem policy: escrita só por _read_matricula_cota (SECURITY DEFINER).';

-- Privilégio de tabela tirado já na criação: sem janela com os default privileges.
REVOKE ALL ON TABLE public.read_matricula_uso FROM PUBLIC, anon, authenticated;

ALTER TABLE public.read_matricula_uso ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito.

-- ── Cota (interno) ──────────────────────────────────────────────────────────
-- Conta mais uma leitura para o usuário e para a organização, no dia corrente,
-- e recusa com 54000 acima do teto. Quem chama (a Edge, como service_role) já
-- validou o JWT e o vínculo com a organização. O INSERT … ON CONFLICT trava a
-- linha: chamadas simultâneas não se perdem; a ordem fixa (usuário, depois org)
-- evita deadlock entre elas.
CREATE OR REPLACE FUNCTION public._read_matricula_cota(p_user UUID, p_org UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dia DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_n   INT;
BEGIN
    IF p_user IS NULL OR p_org IS NULL THEN
        RAISE EXCEPTION 'usuário e organização são obrigatórios' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.read_matricula_uso AS u (escopo, chave, dia, n)
    VALUES ('usuario', p_user, v_dia, 1)
    ON CONFLICT (escopo, chave, dia) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > 200 THEN
        RAISE EXCEPTION 'Limite diário de leituras de matrícula por IA atingido — tente de novo amanhã.' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.read_matricula_uso AS u (escopo, chave, dia, n)
    VALUES ('organizacao', p_org, v_dia, 1)
    ON CONFLICT (escopo, chave, dia) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > 500 THEN
        RAISE EXCEPTION 'Limite diário de leituras de matrícula por IA desta organização atingido — tente de novo amanhã.' USING ERRCODE = '54000';
    END IF;

    -- Faxina barata: só as linhas velhas deste usuário e desta org (pela chave primária).
    DELETE FROM public.read_matricula_uso u
     WHERE ((u.escopo = 'usuario' AND u.chave = p_user) OR (u.escopo = 'organizacao' AND u.chave = p_org))
       AND u.dia < v_dia - 2;
END;
$$;

-- Interno: nenhum papel da API executa; só a Edge, como service_role.
-- Logo após o CREATE: sem janela com o EXECUTE padrão.
REVOKE ALL ON FUNCTION public._read_matricula_cota(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._read_matricula_cota(UUID, UUID) TO service_role;
