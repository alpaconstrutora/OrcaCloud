-- aplicar_20271118916000_bi_relatorio_email_so_membros.sql
--
-- BI Executivo › IA & Relatórios — o relatório por e-mail só vai para MEMBROS da
-- organização, com conteúdo montado no servidor (achados F11 e F55 da varredura
-- Claude Security de 15/11/2026; decisão do usuário em 18/11/2026: "só membros").
--
-- O QUE FECHA
--   A Edge `send-bi-report` aceitava qualquer destinatário que estivesse em
--   `bi_report_schedules.recipients` — tabela que QUALQUER membro grava (policy
--   bi_report_schedules_org, FOR ALL por minhas_orgs_membro) — e repassava à
--   Resend o assunto e o HTML que o cliente mandava. Qualquer conta cria a própria
--   organização; gravava um endereço de fora num agendamento e mandava phishing
--   pelo domínio verificado da empresa.
--   Esta migration dá ao servidor o que ele precisa para não depender do cliente:
--     1. `bi_narrativas` — a bi-narrative guarda o texto que gerou; a send-bi-report
--        recebe só o id e usa o texto guardado, literalmente (sem regenerar);
--     2. `_bi_relatorio_destinatarios(org)` — quem pode receber: os membros da
--        organização, AGORA, pelo mesmo critério de `is_org_member` (conta por
--        user_id; na linha legada sem user_id, pelo e-mail) e só conta com e-mail
--        CONFIRMADO (convite não aceito não recebe);
--     3. `_bi_relatorio_envio_cota(user, org)` — teto diário de envios
--        (20 por usuário, 50 por organização; dia civil de São Paulo).
--   `bi_report_schedules.recipients` continua existindo, mas vira só PREFERÊNCIA
--   de quem recebe: gravar nela não dá poder de envio (comentário na coluna).
--
-- LIMITE CONHECIDO (fica registrado, não é esquecimento)
--   O cadastro é auto-confirmado (Auth › "Confirm email" desligado): quem se
--   cadastra sozinho já nasce com email_confirmed_at preenchido, sem provar que é
--   dono da caixa. Fecha quando a confirmação de e-mail for ligada (depende do
--   SMTP próprio) — a regra daqui não muda, passa a valer de verdade.
--
-- ORDEM
--   1. Esta migration.
--   2. Publicar `bi-narrative` (passa a guardar o texto) e `send-bi-report`
--      (passa a usar tudo isto). A send-bi-report nova sem esta migration
--      responde 500 "Falha ao conferir os destinatários".
--   3. Merge do PR (o app passa a mandar período + id da narrativa, não HTML).
--   A send-bi-report nova recusa o app antigo com 400 (sem período) — hoje há 0
--   agendamentos em produção, então a janela entre 2 e 3 não pega ninguém.
--
-- COMO CONFERIR (depois de aplicar)
--   SELECT has_table_privilege('authenticated','public.bi_narrativas','SELECT'),
--          has_function_privilege('authenticated','public._bi_relatorio_destinatarios(uuid)','EXECUTE'),
--          has_function_privilege('authenticated','public._bi_relatorio_envio_cota(uuid,uuid)','EXECUTE');
--   → f, f, f. O bloco de verificação no fim falha a migration se algum der t.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- Idempotente: pode rodar de novo.

SET lock_timeout = '5s';

-- ── 1. Narrativas guardadas ─────────────────────────────────────────────────
-- Uma linha por narrativa gerada. Só a service_role (as Edges) lê e grava; o
-- cliente conhece o id porque a bi-narrative o devolve. A Edge apaga as do
-- usuário com mais de 30 dias a cada narrativa nova.
CREATE TABLE IF NOT EXISTS public.bi_narrativas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL = gerada em "Todas as organizações" (não vai por e-mail: o envio é de uma org).
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date_from       DATE,
    date_to         DATE,
    texto           TEXT NOT NULL CHECK (char_length(texto) <= 10000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bi_narrativas_usuario
    ON public.bi_narrativas (user_id, created_at);

COMMENT ON TABLE public.bi_narrativas IS
    'BI Executivo: texto de cada resumo de IA gerado pela Edge bi-narrative. A send-bi-report usa o texto '
    'guardado (pelo id, do mesmo usuário, organização e período), nunca um texto vindo do cliente. '
    'RLS sem policy: só a service_role lê e grava.';

-- Privilégio tirado já na criação: sem janela com os default privileges.
REVOKE ALL ON TABLE public.bi_narrativas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.bi_narrativas TO service_role;

ALTER TABLE public.bi_narrativas ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito.

-- ── 2. Quem pode receber ────────────────────────────────────────────────────
-- Os e-mails (minúsculos) dos membros de p_org que podem receber o relatório:
--   * o critério de membro é o de is_org_member: linha com user_id → a conta
--     dele, e o endereço é o da CONTA (auth.users), não o da linha; linha legada
--     sem user_id → a conta com aquele e-mail;
--   * só conta com e-mail confirmado (convite não aceito fica de fora), não
--     apagada, não anônima, não banida.
-- Corretor (broker_profiles) não entra: o relatório é da organização, e corretor
-- externo não é membro dela.
-- SECURITY DEFINER porque lê auth.users; só a service_role (a Edge) executa.
CREATE OR REPLACE FUNCTION public._bi_relatorio_destinatarios(p_org UUID)
RETURNS TABLE (email TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT DISTINCT lower(u.email::text) AS email
      FROM public.organization_members m
      JOIN auth.users u
        ON (m.user_id IS NOT NULL AND u.id = m.user_id)
        OR (m.user_id IS NULL AND lower(u.email::text) = lower(m.email))
     WHERE m.organization_id = p_org
       AND u.email IS NOT NULL
       AND u.email_confirmed_at IS NOT NULL
       AND u.deleted_at IS NULL
       AND NOT coalesce(u.is_anonymous, false)
       AND (u.banned_until IS NULL OR u.banned_until <= now());
$$;

-- Interno: nenhum papel da API além da service_role executa.
-- Logo após o CREATE: sem janela com o EXECUTE padrão.
REVOKE ALL ON FUNCTION public._bi_relatorio_destinatarios(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._bi_relatorio_destinatarios(UUID) TO service_role;

-- ── 3. Teto diário de envios ────────────────────────────────────────────────
-- Mesmo desenho do teto da bi-narrative (aplicar_20271116906100): uma linha por
-- (escopo, alvo, dia); o estouro levanta 54000 e desfaz o próprio incremento.
CREATE TABLE IF NOT EXISTS public.bi_relatorio_envio_uso (
    escopo TEXT NOT NULL CHECK (escopo IN ('usuario', 'organizacao')),
    alvo   UUID NOT NULL,
    dia    DATE NOT NULL,
    n      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (escopo, alvo, dia)
);

COMMENT ON TABLE public.bi_relatorio_envio_uso IS
    'BI Executivo: envios diários do relatório por e-mail (Edge send-bi-report), por usuário e por organização. '
    'RLS sem policy: escrita só por _bi_relatorio_envio_cota (SECURITY DEFINER).';

REVOKE ALL ON TABLE public.bi_relatorio_envio_uso FROM PUBLIC, anon, authenticated;

ALTER TABLE public.bi_relatorio_envio_uso ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito.

CREATE OR REPLACE FUNCTION public._bi_relatorio_envio_cota(p_user UUID, p_org UUID)
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
        RAISE EXCEPTION 'usuário e organização obrigatórios' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.bi_relatorio_envio_uso AS u (escopo, alvo, dia, n)
    VALUES ('usuario', p_user, v_dia, 1)
    ON CONFLICT (escopo, alvo, dia) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > 20 THEN
        RAISE EXCEPTION 'Limite diário de envios do relatório atingido — tente de novo amanhã.' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.bi_relatorio_envio_uso AS u (escopo, alvo, dia, n)
    VALUES ('organizacao', p_org, v_dia, 1)
    ON CONFLICT (escopo, alvo, dia) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > 50 THEN
        RAISE EXCEPTION 'Limite diário de envios do relatório da organização atingido — tente de novo amanhã.' USING ERRCODE = '54000';
    END IF;

    -- Faxina barata: só as linhas velhas destes dois alvos (pela chave primária).
    DELETE FROM public.bi_relatorio_envio_uso u
     WHERE ((u.escopo = 'usuario' AND u.alvo = p_user) OR (u.escopo = 'organizacao' AND u.alvo = p_org))
       AND u.dia < v_dia - 2;
END;
$$;

REVOKE ALL ON FUNCTION public._bi_relatorio_envio_cota(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._bi_relatorio_envio_cota(UUID, UUID) TO service_role;

-- ── 4. A lista do agendamento é só preferência ──────────────────────────────
COMMENT ON COLUMN public.bi_report_schedules.recipients IS
    'Quem recebe este agendamento (preferência salva). NÃO dá poder de envio: a Edge send-bi-report '
    'confere, na hora, cada endereço contra os membros da organização (_bi_relatorio_destinatarios) '
    'e recusa o envio inteiro se algum não for membro com e-mail confirmado.';

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_papel TEXT;
BEGIN
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_papel, 'public.bi_narrativas', 'SELECT')
           OR has_table_privilege(v_papel, 'public.bi_narrativas', 'INSERT')
           OR has_table_privilege(v_papel, 'public.bi_relatorio_envio_uso', 'SELECT')
           OR has_table_privilege(v_papel, 'public.bi_relatorio_envio_uso', 'INSERT') THEN
            RAISE EXCEPTION 'tabela nova do relatório de BI acessível por %', v_papel;
        END IF;
        IF has_function_privilege(v_papel, 'public._bi_relatorio_destinatarios(uuid)', 'EXECUTE')
           OR has_function_privilege(v_papel, 'public._bi_relatorio_envio_cota(uuid,uuid)', 'EXECUTE') THEN
            RAISE EXCEPTION 'função interna do relatório de BI executável por %', v_papel;
        END IF;
    END LOOP;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bi_narrativas'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bi_relatorio_envio_uso'::regclass) THEN
        RAISE EXCEPTION 'tabela nova do relatório de BI sem RLS';
    END IF;

    RAISE NOTICE 'OK: bi_narrativas e bi_relatorio_envio_uso só para a service_role; destinatários e teto fora do alcance da API.';
END $$;
