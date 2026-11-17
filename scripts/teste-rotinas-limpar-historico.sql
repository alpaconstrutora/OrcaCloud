-- scripts/teste-rotinas-limpar-historico.sql
-- Prova: a rotina `limpar-historico-rotinas` apaga do `cron.job_run_details` as execuções mais
-- antigas que N dias (padrão 60), pela chave `runid`, levando junto as órfãs de reinício (sem
-- data); recusa menos de 40 dias (a tela olha 40); só postgres (o job) e service_role executam.
-- Migration: supabase/migrations/aplicar_20271116916300_rotinas_limpar_historico.sql
-- Plano:     docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 2)
--
-- Histórico montado na transação (postgres pode inserir em cron.job_run_details informando o
-- runid; não pode usar a sequência), encostado na fronteira do corte, com N = 3650 (10 anos):
--   −10 há 11 anos · −9 órfã (sem início nem fim) · −8 há 11 anos   → saem (3)
--   −7 órfã · −6 e −5 há 9 anos                                    → ficam
--   uma recente acima do maior runid real                          → fica
-- O corte cai em −7: `runid < corte` tira exatamente as 3; `<=` tiraria a −7 também, e um corte
-- deslocado uma linha tiraria a −6 ou deixaria a −8 (revisão de 16/11).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …' (ou o erro do banco);
-- sucesso = a linha final 'TUDO OK'. Sem a migration, quebra em 42883
-- `fn_rotinas_limpar_historico(integer) does not exist` — é o RED.
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-rotinas-limpar-historico.sql \
--        supabase/migrations/aplicar_20271116916300_rotinas_limpar_historico.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-rotinas-limpar-historico.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

DO $$
DECLARE
    v_max     bigint;
    v_reais   bigint;
    v_apagou  bigint;
    v_ok      boolean := false;
BEGIN
    -- Menos de 40 dias: recusa
    BEGIN
        PERFORM public.fn_rotinas_limpar_historico(39);
    EXCEPTION WHEN invalid_parameter_value THEN
        v_ok := true;
    END;
    PERFORM pg_temp.confere(v_ok, '39 dias é recusado (22023): a tela olha 40');

    SELECT max(d.runid) INTO v_max FROM cron.job_run_details d;
    SELECT count(*) INTO v_reais FROM cron.job_run_details d WHERE d.runid > 0;

    INSERT INTO cron.job_run_details (jobid, runid, status, return_message, start_time, end_time)
    VALUES (0, -10, 'succeeded',  'PROVA antiga', now() - interval '11 years', now() - interval '11 years'),
           (0,  -9, 'connecting', 'PROVA órfã antiga', NULL, NULL),
           (0,  -8, 'failed',     'PROVA antiga', now() - interval '11 years', now() - interval '11 years'),
           (0,  -7, 'connecting', 'PROVA órfã na fronteira', NULL, NULL),
           (0,  -6, 'succeeded',  'PROVA 9 anos', now() - interval '9 years', now() - interval '9 years'),
           (0,  -5, 'succeeded',  'PROVA 9 anos', now() - interval '9 years', now() - interval '9 years'),
           (0, v_max + 1000000, 'succeeded', 'PROVA recente', now(), now());

    v_apagou := public.fn_rotinas_limpar_historico(3650);

    PERFORM pg_temp.confere(v_apagou = 3, format('apagou as 3 sintéticas antigas (veio %s)', v_apagou));
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.runid IN (-10, -9, -8)),
        'as antigas saíram (inclusive a órfã sem data entre elas)');
    PERFORM pg_temp.confere(
        (SELECT array_agg(d.runid ORDER BY d.runid) FROM cron.job_run_details d WHERE d.runid < 0)
            = ARRAY[-7, -6, -5]::bigint[],
        'a órfã da fronteira e as de 9 anos ficaram (corte exato, runid < corte)');
    PERFORM pg_temp.confere(
        EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.runid = v_max + 1000000),
        'a recente ficou');
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM cron.job_run_details d WHERE d.runid > 0 AND d.runid <= v_max) = v_reais,
        'nenhuma execução real apagada');

    -- Sem nada antigo: apaga 0
    PERFORM pg_temp.confere(public.fn_rotinas_limpar_historico(3650) = 0, 'rodar de novo apaga 0');

    -- O job
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM cron.job j
          WHERE j.jobname  = 'limpar-historico-rotinas'
            AND j.schedule = '30 6 * * *'
            AND j.active
            AND j.command ILIKE '%public.fn_rotinas_limpar_historico(60)%') = 1,
        'job limpar-historico-rotinas: ligado, 06:30 GMT, 60 dias');

    -- Só postgres (o job) e service_role executam
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public.fn_rotinas_limpar_historico(integer)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.fn_rotinas_limpar_historico(integer)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'public.fn_rotinas_limpar_historico(integer)'::regprocedure
                           AND a.grantee = 0),
        'fn_rotinas_limpar_historico: sem PUBLIC, anon nem authenticated');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
