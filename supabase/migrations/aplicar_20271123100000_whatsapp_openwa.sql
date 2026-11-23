-- WhatsApp pelo OpenWA — fila, conexão, uso por organização e campainha
--
-- Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Design §2; Task 2).
-- Prova: scripts/teste-whatsapp-openwa.sql (BEGIN … ROLLBACK; última linha TUDO OK).
--
-- ── O que cria (só adiciona — nada existente é alterado ou apagado) ────────────
--   • wa_conexoes          — o número da PLATAFORMA (sem organization_id). Uma linha
--                            inicial: ÒPURA / sessão "opura" / maquina_fora. Escreve só
--                            a Edge Function (service_role); o cliente lê só pela
--                            wa_situacao() — sem leitura direta.
--   • wa_uso_por_org       — quais organizações usam o número e se o pedido sai
--                            sozinho ao virar Enviado. Grava só wa_definir_uso().
--   • wa_mensagens         — fila de saída + histórico de entrada, por organização.
--                            organization_id NULL só em ENTRADA (resposta ainda sem
--                            pedido; o superadmin atribui depois).
--   • wa_eventos_recebidos — deduplicação do webhook do OpenWA; expurgo a 30 dias pelo
--                            job wa-limpar-eventos (diário, 04h30 de Brasília).
--   • order_chats.canal    — 'app' | 'whatsapp', para a bolha mostrar de onde veio.
--   • wa_pode_usar · wa_pegar_pendentes · wa_situacao · wa_definir_uso · gatilho
--     wa_tocar_campainha (realtime.send com payload vazio no tópico wa-campainha).
--
-- ── REGRA #7 ───────────────────────────────────────────────────────────────────
--   Pergunta 1 (policy) — "esta perna do OR sozinha basta para liberar a linha?":
--     • wa_mensagens_select e wa_uso_por_org_select: FOR SELECT TO authenticated,
--       USING (organization_id IN (SELECT minhas_orgs_membro())). Sem OR. Linha de
--       entrada com organization_id NULL não casa com IN → invisível ao cliente.
--     • wa_conexoes e wa_eventos_recebidos: NENHUMA policy (RLS ligada = só
--       service_role). Nenhuma policy de escrita em nenhuma das 4; além disso os
--       grants de INSERT/UPDATE/DELETE/TRUNCATE do cliente são revogados.
--   Pergunta 2 (função) — "quem mais pode executar esta função?":
--     • wa_pode_usar(p_user, p_org) e wa_pegar_pendentes(p_limite): SECURITY DEFINER,
--       REVOKE de PUBLIC/anon/authenticated, GRANT só service_role, e o corpo recusa
--       quem não é service_role (auth.role()). wa_pode_usar recebe o usuário por
--       parâmetro: aberta ao cliente, viraria oráculo de permissão de qualquer pessoa.
--     • wa_situacao(): SECURITY DEFINER (⚠️ o brief dizia INVOKER — ver abaixo),
--       REVOKE PUBLIC/anon, GRANT authenticated. Recorta por minhas_orgs_membro()
--       (auth.uid() do chamador) e devolve só estado, número exibido, visto_em e o
--       uso da organização — nada de sessão, erro bruto ou estado bruto.
--       Por que DEFINER: wa_conexoes não tem policy de leitura (o Design manda ler só
--       pela RPC); uma função INVOKER enxergaria 0 linhas dela.
--     • wa_definir_uso(p_org, …): SECURITY DEFINER, REVOKE PUBLIC/anon, GRANT
--       authenticated; dentro exige auth.uid() e p_org ∈ minhas_orgs_gestor() (owner/
--       admin) ou is_superadmin() — senão 42501.
--     • fn_wa_tocar_campainha (gatilho): SECURITY DEFINER para o realtime.send gravar
--       em realtime.messages qualquer que seja o papel do INSERT; payload '{}' (o
--       realtime.send só acrescenta um id aleatório) — não vaza id, texto nem telefone.
--       REVOKE de todos.
--     • fn_wa_atualizado_em (gatilho, INVOKER): só carimba atualizado_em. REVOKE de todos.
--   Pergunta 3 (Edge Function): nenhuma nesta migration (Tasks 3–5).
--
-- ── Aplicar ────────────────────────────────────────────────────────────────────
--   npx supabase db query --linked -f supabase/migrations/aplicar_20271123100000_whatsapp_openwa.sql
--   (NUNCA db push). Não muda nada para o usuário: tabelas nascem vazias (menos a
--   conexão inicial) e o front de hoje ignora order_chats.canal.
--   O bloco "Provas" no fim aborta a transação se algo não bater. De fora:
--     SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename LIKE 'wa_%';
--   Esperado: só wa_mensagens_select e wa_uso_por_org_select, ambas SELECT.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ─── 0. atualizado_em carimbado no UPDATE ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_wa_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_wa_atualizado_em() FROM PUBLIC, anon, authenticated;

-- ─── 1. wa_conexoes — o número da plataforma ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_conexoes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome             text NOT NULL,
    sessao_remota    text NOT NULL UNIQUE,
    estado           text NOT NULL DEFAULT 'maquina_fora'
                          CHECK (estado IN ('maquina_fora', 'desconectado', 'aguardando_qr', 'conectado', 'erro')),
    estado_bruto     text,
    numero_exibicao  text,
    ultimo_erro      text,
    visto_em         timestamptz,
    criado_em        timestamptz NOT NULL DEFAULT now(),
    atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.wa_conexoes IS
    'Número de WhatsApp da PLATAFORMA (OpenWA na máquina local). Sem organização. Escrita só pelas Edge Functions '
    '(service_role); o cliente lê estado e número só pela RPC wa_situacao(). Segredos (WA_WORKER_SECRET, '
    'OPENWA_WEBHOOK_SECRET) ficam nos secrets das Edge Functions, nunca aqui.';
COMMENT ON COLUMN public.wa_conexoes.estado IS
    'Normalizado: maquina_fora | desconectado | aguardando_qr | conectado | erro. Sem sinal do worker há 3 min '
    '(visto_em) = máquina fora, conferido na tela.';
COMMENT ON COLUMN public.wa_conexoes.visto_em IS 'Último "estou vivo" do worker.';

DROP TRIGGER IF EXISTS trg_wa_conexoes_atualizado_em ON public.wa_conexoes;
CREATE TRIGGER trg_wa_conexoes_atualizado_em
    BEFORE UPDATE ON public.wa_conexoes
    FOR EACH ROW EXECUTE FUNCTION public.fn_wa_atualizado_em();

ALTER TABLE public.wa_conexoes ENABLE ROW LEVEL SECURITY;
-- Sem policy: só service_role (e postgres). O cliente não tem nem o grant.
REVOKE ALL ON public.wa_conexoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_conexoes TO service_role;

INSERT INTO public.wa_conexoes (nome, sessao_remota, estado)
VALUES ('ÒPURA', 'opura', 'maquina_fora')
ON CONFLICT (sessao_remota) DO NOTHING;

-- ─── 2. wa_uso_por_org — quem usa o número e como ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_uso_por_org (
    organization_id          uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    conexao_id               uuid NOT NULL REFERENCES public.wa_conexoes(id) ON DELETE RESTRICT,
    envio_automatico_pedido  boolean NOT NULL DEFAULT true,
    atualizado_por           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_em                timestamptz NOT NULL DEFAULT now(),
    atualizado_em            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.wa_uso_por_org IS
    'Organizações que usam o WhatsApp da plataforma (OpenWA). Linha existe = usa. Escrita só por wa_definir_uso() '
    '(owner/admin da organização ou superadmin).';

DROP TRIGGER IF EXISTS trg_wa_uso_por_org_atualizado_em ON public.wa_uso_por_org;
CREATE TRIGGER trg_wa_uso_por_org_atualizado_em
    BEFORE UPDATE ON public.wa_uso_por_org
    FOR EACH ROW EXECUTE FUNCTION public.fn_wa_atualizado_em();

ALTER TABLE public.wa_uso_por_org ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_uso_por_org_select ON public.wa_uso_por_org;
CREATE POLICY wa_uso_por_org_select ON public.wa_uso_por_org
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
REVOKE ALL ON public.wa_uso_por_org FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wa_uso_por_org TO authenticated;
GRANT ALL ON public.wa_uso_por_org TO service_role;

-- ─── 3. wa_mensagens — fila de saída e histórico de entrada ───────────────────
CREATE TABLE IF NOT EXISTS public.wa_mensagens (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    direcao               text NOT NULL CHECK (direcao IN ('saida', 'entrada')),
    telefone              text,
    chat_id_remoto        text NOT NULL,
    texto                 text,
    midia                 jsonb,
    status                text NOT NULL DEFAULT 'pendente',
    provider_message_id   text,
    comando_id            text CHECK (comando_id IS NULL OR length(comando_id) BETWEEN 1 AND 200),
    tentativas            integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
    proxima_tentativa_em  timestamptz NOT NULL DEFAULT now(),
    trava_ate             timestamptz,
    erro                  text,
    entidade_tipo         text CHECK (entidade_tipo IS NULL OR entidade_tipo IN ('purchase_order')),
    entidade_id           uuid,
    criado_por            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_em             timestamptz NOT NULL DEFAULT now(),
    atualizado_em         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wa_mensagens_org_so_falta_na_entrada
        CHECK (organization_id IS NOT NULL OR direcao = 'entrada'),
    CONSTRAINT wa_mensagens_status_por_direcao
        CHECK ((direcao = 'saida' AND status IN ('pendente', 'enviando', 'aceita', 'entregue', 'lida',
                                                  'falhou', 'incerta', 'cancelada'))
            OR (direcao = 'entrada' AND status = 'recebida')),
    -- comando_id é a chave de idempotência do envio: toda saída tem a sua.
    CONSTRAINT wa_mensagens_saida_tem_comando
        CHECK (direcao = 'entrada' OR comando_id IS NOT NULL),
    CONSTRAINT wa_mensagens_comando_unico UNIQUE (organization_id, comando_id)
);
COMMENT ON TABLE public.wa_mensagens IS
    'WhatsApp pelo OpenWA: fila de saída e histórico de entrada, por organização. organization_id NULL só em '
    'entrada ainda sem pedido. Leitura: membro da organização. Escrita: só service_role (Edge Functions).';
COMMENT ON COLUMN public.wa_mensagens.comando_id IS
    'Chave de idempotência, única por organização: um por clique (gerado na tela) ou pedido:<id>:enviado:<updated_at>.';
COMMENT ON COLUMN public.wa_mensagens.trava_ate IS
    'Lease do worker: wa_pegar_pendentes() marca enviando e trava por 2 minutos.';
COMMENT ON COLUMN public.wa_mensagens.status IS
    'Saída: pendente | enviando | aceita | entregue | lida | falhou | incerta | cancelada (aceita → entregue → lida '
    'só avança). Entrada: recebida.';

CREATE UNIQUE INDEX IF NOT EXISTS wa_mensagens_provider_unico
    ON public.wa_mensagens (chat_id_remoto, provider_message_id)
    WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensagens_fila
    ON public.wa_mensagens (proxima_tentativa_em, criado_em)
    WHERE direcao = 'saida' AND status = 'pendente';
CREATE INDEX IF NOT EXISTS wa_mensagens_org_criado
    ON public.wa_mensagens (organization_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS wa_mensagens_entidade
    ON public.wa_mensagens (entidade_tipo, entidade_id)
    WHERE entidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensagens_provider
    ON public.wa_mensagens (provider_message_id)
    WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_mensagens_telefone_saida
    ON public.wa_mensagens (telefone, criado_em DESC)
    WHERE direcao = 'saida';

DROP TRIGGER IF EXISTS trg_wa_mensagens_atualizado_em ON public.wa_mensagens;
CREATE TRIGGER trg_wa_mensagens_atualizado_em
    BEFORE UPDATE ON public.wa_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.fn_wa_atualizado_em();

ALTER TABLE public.wa_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_mensagens_select ON public.wa_mensagens;
CREATE POLICY wa_mensagens_select ON public.wa_mensagens
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public.minhas_orgs_membro()));
REVOKE ALL ON public.wa_mensagens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wa_mensagens TO authenticated;
GRANT ALL ON public.wa_mensagens TO service_role;

-- ─── 4. wa_eventos_recebidos — deduplicação do webhook ────────────────────────
-- NULLS NOT DISTINCT: o webhook deduplica antes de saber a organização (o número é
-- da plataforma); com NULL "distinto", o mesmo evento sem organização entraria N vezes.
CREATE TABLE IF NOT EXISTS public.wa_eventos_recebidos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    chave_evento     text NOT NULL CHECK (length(chave_evento) BETWEEN 1 AND 300),
    tipo             text NOT NULL,
    recebido_em      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wa_eventos_recebidos_chave_unica UNIQUE NULLS NOT DISTINCT (organization_id, chave_evento)
);
COMMENT ON TABLE public.wa_eventos_recebidos IS
    'Deduplicação dos eventos do webhook do OpenWA (idempotencyKey). Só service_role. Expurgo a 30 dias (job wa-limpar-eventos).';
CREATE INDEX IF NOT EXISTS wa_eventos_recebidos_recebido_em ON public.wa_eventos_recebidos (recebido_em);

ALTER TABLE public.wa_eventos_recebidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_eventos_recebidos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_eventos_recebidos TO service_role;

-- ─── 5. order_chats.canal ─────────────────────────────────────────────────────
ALTER TABLE public.order_chats
    ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'app';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.order_chats'::regclass AND conname = 'order_chats_canal_check') THEN
        ALTER TABLE public.order_chats
            ADD CONSTRAINT order_chats_canal_check CHECK (canal IN ('app', 'whatsapp'));
    END IF;
END $$;
COMMENT ON COLUMN public.order_chats.canal IS 'De onde veio a mensagem do chat do pedido: app | whatsapp.';

-- ─── 6. wa_pode_usar — permissão de usar o número (só Edge Functions) ─────────
-- Mesma regra de is_superadmin(), mas pelo e-mail da conta p_user (e não do JWT), OU
-- membro de p_org (por user_id, ou pelo e-mail no convite ainda sem user_id — a mesma
-- forma de minhas_orgs_membro) com permissions.canUseWhatsappEmpresa = true.
CREATE OR REPLACE FUNCTION public.wa_pode_usar(p_user uuid, p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_email text;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'wa_pode_usar: só as Edge Functions consultam a permissão' USING ERRCODE = '42501';
    END IF;
    IF p_user IS NULL OR p_org IS NULL THEN
        RETURN false;
    END IF;
    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user;
    IF v_email IS NULL THEN
        RETURN false;
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = v_email)
        OR EXISTS (SELECT 1 FROM public.organization_members m
                    WHERE m.organization_id = p_org
                      AND ((m.user_id IS NOT NULL AND m.user_id = p_user)
                        OR (m.user_id IS NULL AND lower(m.email) = v_email))
                      AND coalesce(m.permissions ->> 'canUseWhatsappEmpresa', 'false') = 'true');
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_pode_usar(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_pode_usar(uuid, uuid) TO service_role;

-- ─── 7. wa_pegar_pendentes — claim atômico da fila (só o worker, via Edge Function) ──
-- Pega saídas pendentes cuja hora chegou e sem trava valendo, trava por 2 min e marca
-- enviando. SKIP LOCKED: dois workers simultâneos nunca pegam a mesma linha.
-- Não incrementa `tentativas` (quem conta é o reportar do worker).
CREATE OR REPLACE FUNCTION public.wa_pegar_pendentes(p_limite integer)
RETURNS SETOF public.wa_mensagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'wa_pegar_pendentes: só o worker pega a fila' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH alvo AS (
        SELECT w.id
          FROM public.wa_mensagens w
         WHERE w.direcao = 'saida'
           AND w.status = 'pendente'
           AND w.proxima_tentativa_em <= now()
           AND (w.trava_ate IS NULL OR w.trava_ate < now())
         ORDER BY w.proxima_tentativa_em, w.criado_em
         LIMIT greatest(1, least(coalesce(p_limite, 10), 100))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.wa_mensagens w
       SET status = 'enviando',
           trava_ate = now() + interval '2 minutes'
      FROM alvo
     WHERE w.id = alvo.id
    RETURNING w.*;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_pegar_pendentes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_pegar_pendentes(integer) TO service_role;

-- ─── 8. wa_situacao — o que a tela precisa saber ──────────────────────────────
-- Uma linha por organização de que o chamador é membro: estado e número da conexão
-- (a da org, ou a da plataforma quando a org ainda não usa), se a org usa e se o
-- pedido sai sozinho. DEFINER porque wa_conexoes não tem policy de leitura; o recorte
-- é o mesmo das policies (minhas_orgs_membro). Sem usuário na requisição = vazio.
CREATE OR REPLACE FUNCTION public.wa_situacao()
RETURNS TABLE (
    estado                   text,
    numero_exibicao          text,
    visto_em                 timestamptz,
    usa_na_org               boolean,
    envio_automatico_pedido  boolean,
    organization_id          uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT c.estado,
           c.numero_exibicao,
           c.visto_em,
           (u.organization_id IS NOT NULL),
           coalesce(u.envio_automatico_pedido, false),
           m.org
      FROM (SELECT DISTINCT o AS org FROM public.minhas_orgs_membro() AS o) m
      LEFT JOIN public.wa_uso_por_org u ON u.organization_id = m.org
      LEFT JOIN LATERAL (
            SELECT k.estado, k.numero_exibicao, k.visto_em
              FROM public.wa_conexoes k
             WHERE k.id = coalesce(u.conexao_id,
                                   (SELECT k2.id FROM public.wa_conexoes k2 ORDER BY k2.criado_em, k2.id LIMIT 1))
      ) c ON true
     WHERE auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.wa_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_situacao() TO authenticated, service_role;

-- ─── 9. wa_definir_uso — owner/admin liga/desliga o uso na própria organização ──
-- p_usar false = tira a organização do uso (apaga a linha). p_envio_automatico NULL =
-- mantém o que estava (true na primeira vez).
CREATE OR REPLACE FUNCTION public.wa_definir_uso(p_org uuid, p_usar boolean, p_envio_automatico boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_uid uuid := auth.uid();
    v_con uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'wa_definir_uso: sessão sem usuário' USING ERRCODE = '42501';
    END IF;
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'informe a organização' USING ERRCODE = '22023';
    END IF;
    IF NOT (p_org IN (SELECT public.minhas_orgs_gestor()) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'só o proprietário ou um administrador da organização liga ou desliga o WhatsApp do ÒPURA'
            USING ERRCODE = '42501';
    END IF;

    IF NOT coalesce(p_usar, false) THEN
        DELETE FROM public.wa_uso_por_org WHERE organization_id = p_org;
        RETURN;
    END IF;

    SELECT k.id INTO v_con FROM public.wa_conexoes k ORDER BY k.criado_em, k.id LIMIT 1;
    IF v_con IS NULL THEN
        RAISE EXCEPTION 'nenhuma conexão de WhatsApp da plataforma cadastrada' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.wa_uso_por_org AS w (organization_id, conexao_id, envio_automatico_pedido, atualizado_por)
    VALUES (p_org, v_con, coalesce(p_envio_automatico, true), v_uid)
    ON CONFLICT (organization_id) DO UPDATE SET
        envio_automatico_pedido = coalesce(p_envio_automatico, w.envio_automatico_pedido),
        atualizado_por          = v_uid;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_definir_uso(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_definir_uso(uuid, boolean, boolean) TO authenticated, service_role;

-- ─── 10. campainha — avisa o worker que entrou algo na fila ───────────────────
-- Tópico público e fixo, payload vazio: quem ouvir só sabe que "entrou algo"; um
-- toque falso custa uma busca a mais. O worker continua varrendo a fila sozinho.
CREATE OR REPLACE FUNCTION public.fn_wa_tocar_campainha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    PERFORM realtime.send('{}'::jsonb, 'fila', 'wa-campainha', false);
    RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_wa_tocar_campainha() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_tocar_campainha ON public.wa_mensagens;
CREATE TRIGGER wa_tocar_campainha
    AFTER INSERT ON public.wa_mensagens
    FOR EACH ROW
    WHEN (NEW.direcao = 'saida' AND NEW.status = 'pendente')
    EXECUTE FUNCTION public.fn_wa_tocar_campainha();

-- ─── 11. job de limpeza (SQL puro, diário 07:30 GMT = 04h30 de Brasília) ──────
-- Só cria se não existe: reagendar com unschedule + schedule RELIGARIA um job que o
-- superadmin desligou em Configurações › Rotinas automáticas.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-limpar-eventos') THEN
        PERFORM cron.schedule(
            'wa-limpar-eventos',
            '30 7 * * *',
            $cron$DELETE FROM public.wa_eventos_recebidos WHERE recebido_em < now() - interval '30 days'$cron$
        );
    END IF;
END $$;

-- ─── Provas ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_acl text;
    v_fn  text;
    v_t   text;
BEGIN
    -- Só service_role (e o dono) executam.
    FOREACH v_fn IN ARRAY ARRAY['wa_pode_usar', 'wa_pegar_pendentes', 'fn_wa_tocar_campainha', 'fn_wa_atualizado_em'] LOOP
        SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;
        IF v_acl IS NULL OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
            RAISE EXCEPTION '% executável por quem não é service_role: %', v_fn, v_acl;
        END IF;
    END LOOP;
    -- authenticated sim, anon/PUBLIC não.
    FOREACH v_fn IN ARRAY ARRAY['wa_situacao', 'wa_definir_uso'] LOOP
        SELECT proacl::text INTO v_acl FROM pg_proc WHERE proname = v_fn AND pronamespace = 'public'::regnamespace;
        IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl LIKE '%anon=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
            RAISE EXCEPTION '% com ACL errada (quer authenticated, sem anon/PUBLIC): %', v_fn, v_acl;
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename IN ('wa_conexoes', 'wa_uso_por_org', 'wa_mensagens', 'wa_eventos_recebidos')
                 AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'tabela wa_* com policy de escrita';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename IN ('wa_conexoes', 'wa_eventos_recebidos')) THEN
        RAISE EXCEPTION 'wa_conexoes/wa_eventos_recebidos não podem ter policy (só service_role)';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename IN ('wa_uso_por_org', 'wa_mensagens')
                 AND coalesce(qual, '') NOT LIKE '%minhas_orgs_membro%') THEN
        RAISE EXCEPTION 'policy de leitura de wa_uso_por_org/wa_mensagens fora do recorte por conjunto';
    END IF;

    FOREACH v_t IN ARRAY ARRAY['wa_conexoes', 'wa_uso_por_org', 'wa_mensagens', 'wa_eventos_recebidos'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_t)::regclass) THEN
            RAISE EXCEPTION '% sem RLS', v_t;
        END IF;
        IF has_table_privilege('authenticated', 'public.' || v_t, 'INSERT')
           OR has_table_privilege('authenticated', 'public.' || v_t, 'UPDATE')
           OR has_table_privilege('authenticated', 'public.' || v_t, 'DELETE')
           OR has_table_privilege('authenticated', 'public.' || v_t, 'TRUNCATE')
           OR has_table_privilege('anon', 'public.' || v_t, 'SELECT') THEN
            RAISE EXCEPTION '% com privilégio de escrita para o cliente (ou leitura para anon)', v_t;
        END IF;
    END LOOP;
    IF has_table_privilege('authenticated', 'public.wa_conexoes', 'SELECT')
       OR has_table_privilege('authenticated', 'public.wa_eventos_recebidos', 'SELECT') THEN
        RAISE EXCEPTION 'wa_conexoes/wa_eventos_recebidos legíveis pelo cliente direto';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.wa_conexoes WHERE sessao_remota = 'opura') THEN
        RAISE EXCEPTION 'linha inicial de wa_conexoes não existe';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-limpar-eventos') THEN
        RAISE EXCEPTION 'job wa-limpar-eventos não agendado';
    END IF;

    RAISE NOTICE 'OK: WhatsApp pelo OpenWA — fila, conexão, uso por organização e campainha.';
END $$;

COMMIT;
