-- ==========================================================================
-- Rotinas automáticas — limpeza do histórico de execuções do pg_cron
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 2)
-- Prova: scripts/teste-rotinas-limpar-historico.sql
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "Corrigir os pontos citados" — ponto 1, o histórico de
-- execuções (`cron.job_run_details`) guardava ~475 mil linhas (329 MB) e nunca era limpo.
--
-- O QUE CRIA
-- 1. `fn_rotinas_limpar_historico(p_dias integer DEFAULT 60) RETURNS bigint` — apaga as
--    execuções com mais de `p_dias` dias e devolve quantas apagou.
--    - `cron.job_run_details` só tem índice na chave `runid`; filtrar pela data varreria a
--      tabela. O corte sai da mesma busca binária de `fn_rotinas_automaticas_listar` (o horário
--      cresce com o runid; ~20 leituras pela chave; a sonda pula linha sem horário). Apaga
--      `runid < corte`: leva junto as órfãs de reinício, que não têm data.
--    - Recusa menos de 40 dias (22023): a tela Configurações › Rotinas automáticas mostra a
--      última execução dos últimos 40 dias — a rotina mensal precisa caber.
--    - SECURITY INVOKER: quem roda é o job, como postgres (pode apagar do cron). EXECUTE fica
--      só com postgres e service_role (sem PUBLIC, anon nem authenticated).
-- 2. Job `limpar-historico-rotinas`, todo dia às 06:30 GMT (03:30 de Brasília), 60 dias.
--    Aparece na tela no grupo "Técnicas" (utils/rotinasAutomaticas.ts). Só cria se não existir:
--    reaplicar não religa um job desligado na tela.
--
-- O espaço apagado volta para a tabela (autovacuum); o arquivo não encolhe.
--
-- ROLLBACK
--   SELECT cron.unschedule('limpar-historico-rotinas');
--   DROP FUNCTION public.fn_rotinas_limpar_historico(integer);
--   (o que foi apagado não volta — é histórico de execução, não dado de negócio)
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_rotinas_limpar_historico(p_dias integer DEFAULT 60)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_desde  timestamptz;
    v_lo     bigint;
    v_hi     bigint;
    v_meio   bigint;
    v_runid  bigint;
    v_inicio timestamptz;
    v_apagou bigint;
BEGIN
    IF p_dias IS NULL OR p_dias < 40 THEN
        RAISE EXCEPTION 'guardar pelo menos 40 dias (a tela olha 40); veio %', p_dias
            USING ERRCODE = '22023';
    END IF;
    v_desde := now() - make_interval(days => p_dias);

    -- Corte: o menor runid que começou (ou, sem início, terminou) depois de v_desde.
    SELECT min(d.runid), max(d.runid) INTO v_lo, v_hi FROM cron.job_run_details d;
    IF v_lo IS NULL THEN
        RETURN 0;
    END IF;
    WHILE v_lo < v_hi LOOP
        v_meio := v_lo + (v_hi - v_lo) / 2;
        SELECT d.runid, coalesce(d.start_time, d.end_time) INTO v_runid, v_inicio
          FROM cron.job_run_details d
         WHERE d.runid >= v_meio
           AND coalesce(d.start_time, d.end_time) IS NOT NULL
         ORDER BY d.runid
         LIMIT 1;
        IF v_inicio IS NOT NULL AND v_inicio < v_desde THEN
            v_lo := least(v_runid + 1, v_hi);
        ELSE
            v_hi := v_meio;
        END IF;
    END LOOP;

    -- A última linha nunca sai: se tudo for antigo, o corte para nela.
    DELETE FROM cron.job_run_details d WHERE d.runid < v_lo;
    GET DIAGNOSTICS v_apagou = ROW_COUNT;
    RETURN v_apagou;
END $$;

COMMENT ON FUNCTION public.fn_rotinas_limpar_historico(integer) IS
    'Apaga de cron.job_run_details as execuções com mais de p_dias dias (mínimo 40), pela chave '
    'runid. Job limpar-historico-rotinas. Plano docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md.';

REVOKE ALL ON FUNCTION public.fn_rotinas_limpar_historico(integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-historico-rotinas') THEN
        PERFORM cron.schedule(
            'limpar-historico-rotinas',
            '30 6 * * *',
            $cmd$SELECT public.fn_rotinas_limpar_historico(60);$cmd$
        );
    END IF;
END $$;

COMMIT;
