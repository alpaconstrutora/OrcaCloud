-- scripts/teste-rotinas-limpar-historico.sql
-- Prova: a rotina `limpar-historico-rotinas` apaga do `cron.job_run_details` as execuções mais
-- antigas que N dias (padrão 60), pela chave `runid`, levando junto as órfãs de reinício (sem
-- data); recusa menos de 40 dias (a tela olha 40); só o job (postgres) executa.
-- Migration: supabase/migrations/aplicar_20271116916300_rotinas_limpar_historico.sql
-- Plano:     docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 2)
--
-- Histórico montado na transação (postgres pode inserir em cron.job_run_details informando o
-- runid; não pode usar a sequência): três linhas de runid NEGATIVO há 11 anos — uma delas órfã,
-- sem início nem fim — e uma recente acima do maior runid real. Com N = 3650 (10 anos), o corte
-- cai entre as sintéticas antigas e as reais: apaga as 3 e nada mais.
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
    VALUES (0, -3, 'succeeded', 'PROVA antiga', now() - interval '11 years', now() - interval '11 years'),
           (0, -2, 'connecting', 'PROVA órfã',  NULL, NULL),
           (0, -1, 'failed',    'PROVA antiga', now() - interval '11 years', now() - interval '11 years'),
           (0, v_max + 1000000, 'succeeded', 'PROVA recente', now(), now());

    v_apagou := public.fn_rotinas_limpar_historico(3650);

    PERFORM pg_temp.confere(v_apagou = 3, format('apagou as 3 sintéticas antigas (veio %s)', v_apagou));
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM cron.job_run_details d WHERE d.runid < 0),
        'nenhuma sintética antiga sobrou (inclusive a órfã sem data)');
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

    -- Só o job executa
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
