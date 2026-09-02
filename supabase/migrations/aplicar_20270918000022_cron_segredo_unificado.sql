-- ============================================================
-- Migration: aplicar_20270918000022_cron_segredo_unificado.sql
-- C4-02 (continuação) — os quatro crons pediam o segredo em quatro lugares,
-- e três deles não existiam.
--
-- O QUE O DIAGNÓSTICO DE 2026-09-02 ACHOU
-- Depois de corrigir o `verify_jwt` das funções, sobraram 401 e falhas. A causa
-- não era uma: cada job buscava a credencial de um jeito diferente.
--
--   job                       de onde lia                      existia?
--   daily-billing-ruler       vault 'billing_cron_token'       sim, mas é o texto
--                                                              literal '<cole_aqui…>'
--   task-alert-notifier       vault 'billing_cron_token'       idem
--   dunning-notifier-hourly   vault 'service_role_key'         NÃO → header NULL
--                                                              → UNAUTHORIZED_NO_AUTH_HEADER
--   fiscal-fallback-polling   GUC  'app.service_role_key'      NÃO → ERRO de SQL,
--                                                              90 falhas / 0 sucessos em 3 h
--
-- O `fiscal-fallback-polling` é o mais grave dos quatro: ele nem chegava a fazer
-- HTTP. Morria em `unrecognized configuration parameter "app.supabase_url"`,
-- a cada 2 minutos, desde sempre. É o fallback que o CLAUDE.md descreve como a
-- rede de segurança da ingestão de NF-e — a rede não estava lá.
--
-- O QUE MUDA
-- Um nome só (`service_role_key`), lido por uma função só, que FALA quando o
-- segredo falta. Segredo ausente vira exceção legível em `cron.job_run_details`,
-- não header NULL nem `current_setting` estourando.
--
-- REGRA OBRIGATÓRIA #7, pergunta 2 — "quem mais pode executar esta função?"
-- Esta devolve a service_role_key em texto puro. É o caso em que a resposta
-- certa é "ninguém além do dono do cron": o REVOKE inclui `authenticated`, não
-- só PUBLIC e anon. Um `GRANT ... TO authenticated` aqui entregaria a chave que
-- ignora toda a RLS a qualquer usuário logado.
-- ============================================================

-- ── 1. Aproveitar o valor já existente, se for real ─────────────────────────
-- Se alguém já colou a chave em `billing_cron_token`, ela é migrada e o nome
-- antigo some. Se ainda for o placeholder, nada é copiado — copiar placeholder
-- só trocaria um erro silencioso de lugar.
DO $$
DECLARE
    v_antigo text;
    v_ja_tem boolean;
BEGIN
    SELECT decrypted_secret INTO v_antigo
      FROM vault.decrypted_secrets WHERE name = 'billing_cron_token';

    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      INTO v_ja_tem;

    IF v_antigo IS NOT NULL AND v_antigo NOT LIKE '<%' AND length(v_antigo) > 40 THEN
        IF v_ja_tem THEN
            RAISE NOTICE 'service_role_key ja existe; billing_cron_token mantido para conferencia manual.';
        ELSE
            PERFORM vault.create_secret(v_antigo, 'service_role_key',
                'Service role key usada pelos jobs de cron (pg_net -> Edge Functions).');
            RAISE NOTICE 'valor de billing_cron_token migrado para service_role_key.';
        END IF;
    ELSE
        RAISE NOTICE 'billing_cron_token nao tem chave real (placeholder ou ausente) — nada migrado.';
    END IF;
END $$;

-- ── 2. A função que centraliza a leitura ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cron_service_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_chave text;
BEGIN
    SELECT decrypted_secret INTO v_chave
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    -- Falta = exceção, nunca NULL. NULL concatenado vira header ausente, e
    -- header ausente vira 401 no gateway sem nenhuma pista de onde veio: foi
    -- exatamente assim que o `dunning-notifier-hourly` ficou quebrado sem
    -- aparecer em lugar nenhum.
    IF v_chave IS NULL THEN
        RAISE EXCEPTION 'vault: segredo "service_role_key" nao existe. '
            'Crie em Dashboard > Project Settings > Vault com o valor de '
            'Settings > API > service_role.';
    END IF;

    IF v_chave LIKE '<%' OR length(v_chave) < 40 THEN
        RAISE EXCEPTION 'vault: segredo "service_role_key" ainda e placeholder (% caracteres).',
            length(v_chave);
    END IF;

    RETURN v_chave;
END $$;

-- Devolve a chave que ignora toda a RLS. `authenticated` entra no REVOKE.
REVOKE EXECUTE ON FUNCTION public.fn_cron_service_key() FROM PUBLIC, anon, authenticated;

-- ── 3. Reagendar os quatro jobs na mesma fonte ──────────────────────────────
-- URL literal: `app.supabase_url` não existe neste banco (foi o que derrubou o
-- fiscal). GUC que ninguém definiu não é configuração, é bug adiado.
DO $$
DECLARE
    v_url text := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/';
    j record;
BEGIN
    FOR j IN
        SELECT * FROM (VALUES
            ('daily-billing-ruler',     '0 5 * * *',   'process-billing-ruler', '{}'),
            ('dunning-notifier-hourly', '0 * * * *',   'dunning-notifier',      '{}'),
            ('task-alert-notifier',     '* * * * *',   'task-alert-notifier',   '{}'),
            ('fiscal-fallback-polling', '*/2 * * * *', 'fiscal-nfe-processor',  '{"fallback_polling": true}')
        ) AS t(jobname, agenda, funcao, corpo)
    LOOP
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j.jobname) THEN
            PERFORM cron.unschedule(j.jobname);
        END IF;

        PERFORM cron.schedule(j.jobname, j.agenda, format(
            $cmd$SELECT net.http_post(
                url     := %L,
                headers := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'Authorization', 'Bearer ' || public.fn_cron_service_key()
                ),
                body    := %L::jsonb
            );$cmd$,
            v_url || j.funcao,
            j.corpo
        ));
    END LOOP;
END $$;

-- ── 4. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_fora int;
    v_pode boolean;
    v_tem_chave boolean;
BEGIN
    -- Nenhum dos quatro pode ter sobrado lendo GUC ou nome antigo de segredo.
    SELECT count(*) INTO v_fora
      FROM cron.job
     WHERE jobname IN ('daily-billing-ruler','dunning-notifier-hourly',
                       'task-alert-notifier','fiscal-fallback-polling')
       AND command NOT LIKE '%fn_cron_service_key%';
    IF v_fora > 0 THEN
        RAISE EXCEPTION '% job(s) ainda nao usam fn_cron_service_key', v_fora;
    END IF;

    SELECT count(*) INTO v_fora
      FROM cron.job WHERE command LIKE '%current_setting(''app.%';
    IF v_fora > 0 THEN
        RAISE EXCEPTION '% job(s) ainda leem GUC app.* inexistente', v_fora;
    END IF;

    SELECT bool_or(has_function_privilege(r, 'public.fn_cron_service_key()', 'EXECUTE'))
      INTO v_pode
      FROM unnest(ARRAY['anon','authenticated']) r;
    IF v_pode THEN
        RAISE EXCEPTION 'fn_cron_service_key continua executavel por anon/authenticated';
    END IF;

    SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets
                    WHERE name = 'service_role_key'
                      AND decrypted_secret NOT LIKE '<%'
                      AND length(decrypted_secret) >= 40)
      INTO v_tem_chave;

    IF v_tem_chave THEN
        RAISE NOTICE 'OK: 4 jobs unificados e segredo presente — os crons devem voltar a 200.';
    ELSE
        RAISE NOTICE 'OK: 4 jobs unificados. FALTA a acao manual: criar o segredo '
            '"service_role_key" no Vault. Ate la os jobs falham com mensagem legivel '
            '(era esse o objetivo — antes falhavam em silencio).';
    END IF;
END $$;
