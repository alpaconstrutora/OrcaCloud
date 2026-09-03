-- ============================================================
-- Migration: aplicar_20270918000023_cron_segredo_dedicado.sql
-- C4-02 (fim) — o cron para de usar a service_role key, e o fiscal ganha gate
--
-- O IMPASSE QUE FORÇOU ISTO
-- A `...000022` unificou os quatro jobs numa leitura só do Vault. Com a chave
-- certa lá dentro, metade passou a funcionar e a outra metade continuou em 401 —
-- e o motivo é estrutural, não de configuração:
--
--   • função com `verify_jwt: true` → o gateway exige um JWT. A service_role
--     LEGADA (`eyJ…`) serve; a NOVA (`sb_secret_…`) não é JWT e é recusada.
--   • gate interno comparando com `SUPABASE_SERVICE_ROLE_KEY` → o runtime injeta
--     a chave NOVA. A legada não bate.
--
-- Nenhum valor único satisfaz os dois ao mesmo tempo. Um segredo próprio do cron
-- não tem formato a respeitar e encerra o impasse — e de quebra tira a chave que
-- ignora toda a RLS de dentro de um header enviado a cada minuto.
--
-- O ACHADO QUE APARECEU NO CAMINHO
-- `fiscal-nfe-processor` não tinha gate NENHUM: dependia só do `verify_jwt` do
-- gateway. Isso não é autorização — o gateway confere que o token é uma chave
-- válida do projeto, e a chave **anon** é uma delas. Ela é pública, vai no bundle
-- do frontend. Sonda de 2026-09-02 com a publishable key: **HTTP 200**.
--
-- Como a função aceita `body.record` e processa com service_role, qualquer um
-- com o bundle na mão podia injetar job forjado no pipeline de NF-e. O gate
-- entrou no código da função; esta migration acerta os dois chamadores dela.
--
-- REGRA OBRIGATÓRIA #7, pergunta 2 — `fn_cron_secret()` devolve credencial.
-- REVOKE inclui `authenticated`, não só PUBLIC e anon.
--
-- PRÉ-REQUISITOS (já feitos quando esta migration foi aplicada)
--   1. `supabase secrets set CRON_SECRET=<64 hex>` nas Edge Functions
--   2. `vault.create_secret(<mesmo valor>, 'cron_secret', …)`
--   3. deploy das 4 funções com `--no-verify-jwt` E com o gate no bundle
-- O valor não aparece neste arquivo de propósito: migration é versionada.
-- ============================================================

-- ── 1. A função que entrega o segredo do cron ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cron_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_chave text;
BEGIN
    SELECT decrypted_secret INTO v_chave
      FROM vault.decrypted_secrets WHERE name = 'cron_secret';

    -- Falta = exceção, nunca NULL. NULL concatenado vira header ausente, e header
    -- ausente vira 401 sem pista de origem — foi assim que o `dunning-notifier`
    -- ficou quebrado sem aparecer em lugar nenhum.
    IF v_chave IS NULL THEN
        RAISE EXCEPTION 'vault: segredo "cron_secret" nao existe. '
            'Gere 64 hex, grave em vault.create_secret(...,''cron_secret'') e '
            'no mesmo valor em: supabase secrets set CRON_SECRET=...';
    END IF;

    -- O gate das functions recusa segredo com menos de 32 caracteres. A mesma
    -- régua dos dois lados: assim a falha aparece aqui, no banco, com nome —
    -- e não como um 401 anônimo lá na ponta.
    IF length(v_chave) < 32 THEN
        RAISE EXCEPTION 'vault: "cron_secret" tem % caracteres; o gate exige 32+.',
            length(v_chave);
    END IF;

    RETURN v_chave;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cron_secret() FROM PUBLIC, anon, authenticated;

-- ── 2. Os quatro jobs de cron ───────────────────────────────────────────────
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
                    'Authorization', 'Bearer ' || public.fn_cron_secret()
                ),
                body    := %L::jsonb
            );$cmd$,
            v_url || j.funcao,
            j.corpo
        ));
    END LOOP;
END $$;

-- ── 3. O webhook de `processing_jobs` ───────────────────────────────────────
-- O `WebHookOrca` original foi criado pelo Dashboard, com
-- `supabase_functions.http_request(...)` e o token **literal dentro do argumento
-- do trigger** — legível em `pg_get_triggerdef` por qualquer um que leia o
-- catálogo. Trocar por uma trigger function própria tira a credencial do
-- catálogo: ela passa a ser buscada no Vault na hora da chamada.
CREATE OR REPLACE FUNCTION public.fn_dispara_fiscal_processor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
BEGIN
    -- ⚠️ O disparo NÃO pode derrubar o INSERT. Se o segredo sumir do Vault, a
    -- alternativa a engolir o erro aqui seria impedir o upload de NF-e — pior.
    -- Engolir só é aceitável porque existe rede embaixo: o
    -- `fiscal-fallback-polling` varre jobs órfãos a cada 2 min. Antes de
    -- 2026-09-02 essa rede não existia de fato (90 falhas / 0 sucessos em 3 h),
    -- e aí sim um erro engolido aqui sumiria para sempre.
    BEGIN
        PERFORM net.http_post(
            url     := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/fiscal-nfe-processor',
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || public.fn_cron_secret()
            ),
            body    := jsonb_build_object('record', to_jsonb(NEW))
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fiscal-nfe-processor nao foi disparado para o job %: % — o fallback de 2 min assume.',
            NEW.id, SQLERRM;
    END;

    RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_dispara_fiscal_processor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "WebHookOrca" ON public.processing_jobs;
DROP TRIGGER IF EXISTS trg_dispara_fiscal_processor ON public.processing_jobs;
CREATE TRIGGER trg_dispara_fiscal_processor
    AFTER INSERT ON public.processing_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fn_dispara_fiscal_processor();

-- ── 4. Limpeza: a service_role key sai do Vault ─────────────────────────────
-- Nada mais a lê. Credencial guardada "por via das dúvidas" é só superfície de
-- ataque parada — e esta ignora a RLS inteira.
DO $$
DECLARE v_id uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%fn_cron_service_key%') THEN
        RAISE EXCEPTION 'ABORTADO: ainda ha job usando fn_cron_service_key';
    END IF;

    SELECT id INTO v_id FROM vault.secrets WHERE name = 'service_role_key';
    IF v_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = v_id;
        RAISE NOTICE 'service_role_key removida do Vault (sem leitores).';
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_cron_service_key();

-- ── 5. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_fora int;
    v_pode boolean;
BEGIN
    SELECT count(*) INTO v_fora
      FROM cron.job
     WHERE jobname IN ('daily-billing-ruler','dunning-notifier-hourly',
                       'task-alert-notifier','fiscal-fallback-polling')
       AND command NOT LIKE '%fn_cron_secret%';
    IF v_fora > 0 THEN
        RAISE EXCEPTION '% job(s) fora do fn_cron_secret', v_fora;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_dispara_fiscal_processor' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'trigger de disparo do fiscal nao foi criada';
    END IF;

    -- Nenhuma credencial pode ter sobrado escrita dentro do catálogo.
    SELECT count(*) INTO v_fora
      FROM pg_trigger t
     WHERE NOT t.tgisinternal
       AND (pg_get_triggerdef(t.oid) LIKE '%Bearer eyJ%'
         OR pg_get_triggerdef(t.oid) LIKE '%Bearer sb_%');
    IF v_fora > 0 THEN
        RAISE EXCEPTION '% trigger(s) ainda com token literal no catalogo', v_fora;
    END IF;

    SELECT bool_or(has_function_privilege(r, 'public.fn_cron_secret()', 'EXECUTE'))
      INTO v_pode FROM unnest(ARRAY['anon','authenticated']) r;
    IF v_pode THEN
        RAISE EXCEPTION 'fn_cron_secret executavel por anon/authenticated';
    END IF;

    IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
        RAISE EXCEPTION 'service_role_key continua no Vault';
    END IF;

    RAISE NOTICE 'OK: 4 crons + webhook no segredo dedicado; service_role key fora do Vault e fora dos headers.';
END $$;
