-- ==========================================================================
-- Rotinas automáticas — pendências da revisão do #513
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md (item 1)
-- Prova: scripts/teste-rotinas-automaticas.sql
-- Base:  aplicar_20271116907000_rotinas_automaticas_ligar_desligar.sql (já aplicada)
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "resolva as Pendências menores".
--
-- O QUE MUDA
-- 1. listar devolve o ÚLTIMO ERRO da janela (`ultimo_erro_em`, `ultimo_erro_mensagem`), não só
--    a mensagem da última execução: rotina que falhou e depois passou mostra o erro; rotina
--    rodando agora não é dada como "terminou sem erro".
-- 2. A janela do histórico passa a ser POR TEMPO — execuções dos últimos 40 dias — e não as
--    últimas 150 mil (~36 dias hoje, menos se o volume crescer). `start_time` não tem índice
--    em cron.job_run_details; o corte sai de uma busca binária sobre `runid` (a chave), cada
--    passo uma leitura pontual: ~20 passos para 500 mil linhas.
-- 3. "Última execução" ignora a linha ainda sem `start_time` (status `starting`).
-- 4. Rotina SEM NOME (`jobname` NULL) liga/desliga: `p_jobid` novo, usado só quando não há nome
--    (com nome, o nome manda — sobrevive a unschedule + schedule). O registro grava `#<jobid>`.
--
-- O tipo de retorno muda → DROP + CREATE das duas funções (CREATE OR REPLACE não troca o
-- retorno). Compatível com o front já publicado: colunas a mais são ignoradas e `p_jobid` tem
-- default, então `rpc(definir, {p_jobname, p_ativo})` resolve para a assinatura nova. A antiga
-- (text, boolean) é removida para não haver sobrecarga ambígua.
--
-- ROLLBACK
--   Rodar de novo as duas funções da migration base (aplicar_20271116907000_…, seção
--   "Listar" e "Ligar / desligar") depois de:
--     DROP FUNCTION public.fn_rotina_automatica_definir(text, boolean, bigint);
--     DROP FUNCTION public.fn_rotinas_automaticas_listar();
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.fn_rotina_automatica_definir(text, boolean);
DROP FUNCTION IF EXISTS public.fn_rotinas_automaticas_listar();

-- --------------------------------------------------------------------------
-- Listar
-- --------------------------------------------------------------------------
CREATE FUNCTION public.fn_rotinas_automaticas_listar()
RETURNS TABLE (
    jobid                 bigint,
    jobname               text,
    schedule              text,
    active                boolean,
    ultima_inicio         timestamptz,
    ultima_status         text,
    ultima_mensagem       text,
    execucoes_7d          integer,
    falhas_7d             integer,
    ultimo_erro_em        timestamptz,
    ultimo_erro_mensagem  text,
    alterado_em           timestamptz,
    alterado_por_email    text,
    alterado_ativo_depois boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
    v_desde  CONSTANT timestamptz := now() - interval '40 days';
    v_lo     bigint;
    v_hi     bigint;
    v_meio   bigint;
    v_runid  bigint;
    v_inicio timestamptz;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'apenas superadmin' USING ERRCODE = '42501';
    END IF;

    -- Corte da janela: o menor runid que começou nos últimos 40 dias. `start_time` cresce com o
    -- runid; cada passo lê UMA linha pela chave. Linha sem início (starting) conta como recente.
    SELECT min(d.runid), max(d.runid) INTO v_lo, v_hi FROM cron.job_run_details d;
    WHILE v_lo < v_hi LOOP
        v_meio := v_lo + (v_hi - v_lo) / 2;
        SELECT d.runid, d.start_time INTO v_runid, v_inicio
          FROM cron.job_run_details d
         WHERE d.runid >= v_meio
         ORDER BY d.runid
         LIMIT 1;
        IF v_inicio IS NOT NULL AND v_inicio < v_desde THEN
            v_lo := least(v_runid + 1, v_hi);
        ELSE
            v_hi := v_meio;
        END IF;
    END LOOP;

    RETURN QUERY
    WITH janela AS (
        SELECT d.jobid, d.runid, d.status, d.start_time, d.end_time, d.return_message
          FROM cron.job_run_details d
         WHERE d.runid >= coalesce(v_lo, 0)
    ),
    ultima AS (
        SELECT DISTINCT ON (jn.jobid) jn.jobid, jn.start_time, jn.status, jn.return_message
          FROM janela jn
         WHERE jn.start_time IS NOT NULL
         ORDER BY jn.jobid, jn.runid DESC
    ),
    erro AS (
        SELECT DISTINCT ON (jn.jobid) jn.jobid,
               coalesce(jn.start_time, jn.end_time) AS em,
               jn.return_message
          FROM janela jn
         WHERE jn.status = 'failed'
         ORDER BY jn.jobid, jn.runid DESC
    ),
    semana AS (
        SELECT jn.jobid,
               count(*)::integer                                     AS execucoes,
               count(*) FILTER (WHERE jn.status = 'failed')::integer AS falhas
          FROM janela jn
         WHERE jn.start_time > now() - interval '7 days'
         GROUP BY jn.jobid
    ),
    alteracao AS (
        SELECT DISTINCT ON (r.jobname) r.jobname, r.alterado_em, r.alterado_por_email, r.ativo_depois
          FROM public.rotinas_automaticas_alteracoes r
         ORDER BY r.jobname, r.alterado_em DESC
    )
    SELECT j.jobid,
           j.jobname::text,
           j.schedule::text,
           j.active,
           u.start_time,
           u.status::text,
           left(u.return_message, 300),
           coalesce(s.execucoes, 0),
           coalesce(s.falhas, 0),
           e.em,
           left(coalesce(e.return_message, 'sem mensagem do pg_cron'), 300),
           a.alterado_em,
           a.alterado_por_email,
           a.ativo_depois
      FROM cron.job j
      LEFT JOIN ultima    u ON u.jobid = j.jobid
      LEFT JOIN semana    s ON s.jobid = j.jobid
      LEFT JOIN erro      e ON e.jobid = j.jobid
      LEFT JOIN alteracao a ON a.jobname = coalesce(j.jobname::text, '#' || j.jobid)
     ORDER BY j.jobname NULLS LAST, j.jobid;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_rotinas_automaticas_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotinas_automaticas_listar() TO authenticated;

-- --------------------------------------------------------------------------
-- Ligar / desligar
-- --------------------------------------------------------------------------
CREATE FUNCTION public.fn_rotina_automatica_definir(p_jobname text, p_ativo boolean, p_jobid bigint DEFAULT NULL)
RETURNS TABLE (
    jobid                 bigint,
    jobname               text,
    schedule              text,
    active                boolean,
    ultima_inicio         timestamptz,
    ultima_status         text,
    ultima_mensagem       text,
    execucoes_7d          integer,
    falhas_7d             integer,
    ultimo_erro_em        timestamptz,
    ultimo_erro_mensagem  text,
    alterado_em           timestamptz,
    alterado_por_email    text,
    alterado_ativo_depois boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
    v_jobid bigint;
    v_nome  text;
    v_chave text;
    v_ativo boolean;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'apenas superadmin' USING ERRCODE = '42501';
    END IF;
    IF p_ativo IS NULL THEN
        RAISE EXCEPTION 'informe se a rotina fica ligada ou desligada' USING ERRCODE = '22004';
    END IF;
    IF p_jobname IS NULL AND p_jobid IS NULL THEN
        RAISE EXCEPTION 'informe a rotina (nome, ou jobid se ela não tem nome)' USING ERRCODE = '22004';
    END IF;

    -- Com nome, o nome manda (sobrevive a unschedule + schedule); sem nome, o jobid.
    SELECT j.jobid, j.jobname::text INTO v_jobid, v_nome
      FROM cron.job j
     WHERE (p_jobname IS NOT NULL AND j.jobname = p_jobname)
        OR (p_jobname IS NULL AND j.jobid = p_jobid);
    IF v_jobid IS NULL THEN
        RAISE EXCEPTION 'rotina não encontrada: %', coalesce(p_jobname, '#' || p_jobid) USING ERRCODE = 'P0002';
    END IF;
    v_chave := coalesce(v_nome, '#' || v_jobid);

    -- Dois cliques ao mesmo tempo na mesma rotina: um espera o outro, e o registro guarda o
    -- "antes" certo. Não dá `FOR UPDATE` em cron.job: o postgres do Supabase só tem SELECT
    -- nela (medido em 16/11/2026, 42501). O estado é lido DEPOIS da trava.
    PERFORM pg_advisory_xact_lock(hashtext('rotina_automatica:' || v_chave));
    SELECT j.active INTO v_ativo FROM cron.job j WHERE j.jobid = v_jobid;
    IF v_ativo IS NULL THEN
        RAISE EXCEPTION 'rotina não encontrada: %', v_chave USING ERRCODE = 'P0002';
    END IF;

    IF v_ativo IS DISTINCT FROM p_ativo THEN
        PERFORM cron.alter_job(v_jobid, active := p_ativo);
        INSERT INTO public.rotinas_automaticas_alteracoes
               (jobname, ativo_antes, ativo_depois, alterado_por, alterado_por_email)
        VALUES (v_chave, v_ativo, p_ativo, auth.uid(), lower(auth.jwt() ->> 'email'));
    END IF;

    RETURN QUERY
    SELECT l.* FROM public.fn_rotinas_automaticas_listar() l WHERE l.jobid = v_jobid;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_rotina_automatica_definir(text, boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotina_automatica_definir(text, boolean, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
