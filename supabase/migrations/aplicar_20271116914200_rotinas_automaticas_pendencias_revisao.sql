-- ==========================================================================
-- Rotinas automáticas — achados da revisão da frente rotinas-pendencias
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md (revisão)
-- Prova: scripts/teste-rotinas-automaticas.sql
-- Base:  aplicar_20271116913700_rotinas_automaticas_pendencias.sql (já aplicada)
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "resolva as Pendências menores" — estes são os achados
-- da revisão independente da própria correção, resolvidos no mesmo pedido.
--
-- O QUE MUDA (mesma assinatura e retorno → CREATE OR REPLACE)
-- 1. `ultimo_erro_mensagem` vinha "sem mensagem do pg_cron" em TODA rotina sem erro (o coalesce
--    rodava depois do LEFT JOIN — 22 de 23 em 16/11). Agora é NULL quando não há erro.
-- 2. Falha órfã de reinício (sem início nem fim) era escolhida como "último erro", com data
--    NULL — e escondia o erro anterior. Agora só conta falha com alguma data.
-- 3. A semana contava pelo início: falha que nem começou (só fim) ficava fora. Agora usa
--    início ou, sem ele, fim.
-- 4. A sonda da busca binária pula linhas sem horário (5 presas em `connecting` em 16/11).
-- 5. definir acha a rotina de novo DEPOIS da trava (reagendamento no meio do clique).
--
-- ROLLBACK
--   Rodar de novo as duas funções de aplicar_20271116913700_… trocando CREATE FUNCTION por
--   CREATE OR REPLACE FUNCTION (a assinatura é a mesma).
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- --------------------------------------------------------------------------
-- Listar
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rotinas_automaticas_listar()
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

    -- Corte da janela: o menor runid que começou nos últimos 40 dias. O horário cresce com o
    -- runid; cada passo lê UMA linha pela chave. A sonda pula linha sem horário nenhum (órfã de
    -- reinício, presa em `connecting`): contada como "recente", ela puxava o corte para trás e a
    -- janela crescia dezenas de milhares de linhas (revisão de 16/11).
    SELECT min(d.runid), max(d.runid) INTO v_lo, v_hi FROM cron.job_run_details d;
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
           AND coalesce(jn.start_time, jn.end_time) IS NOT NULL   -- órfã sem data não esconde o erro anterior
         ORDER BY jn.jobid, jn.runid DESC
    ),
    semana AS (
        SELECT jn.jobid,
               count(*)::integer                                     AS execucoes,
               count(*) FILTER (WHERE jn.status = 'failed')::integer AS falhas
          FROM janela jn
         WHERE coalesce(jn.start_time, jn.end_time) > now() - interval '7 days'   -- falha que nem começou também conta
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
           CASE WHEN e.jobid IS NOT NULL THEN left(coalesce(e.return_message, 'sem mensagem do pg_cron'), 300) END,
           a.alterado_em,
           a.alterado_por_email,
           a.ativo_depois
      FROM cron.job j
      LEFT JOIN ultima    u ON u.jobid = j.jobid
      LEFT JOIN semana    s ON s.jobid = j.jobid
      LEFT JOIN erro      e ON e.jobid = j.jobid
      -- Rotina sem nome fica no registro como '#<jobid>'. Um job com NOME literal '#<n>' colidiria
      -- com a rotina sem nome de jobid n — nenhum nome começa com '#' (16/11); aceito.
      LEFT JOIN alteracao a ON a.jobname = coalesce(j.jobname::text, '#' || j.jobid)
     ORDER BY j.jobname NULLS LAST, j.jobid;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_rotinas_automaticas_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotinas_automaticas_listar() TO authenticated;

-- --------------------------------------------------------------------------
-- Ligar / desligar
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rotina_automatica_definir(p_jobname text, p_ativo boolean, p_jobid bigint DEFAULT NULL)
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
    -- Acha de novo DEPOIS da trava, pelo mesmo critério: se uma migration reagendou a rotina
    -- (unschedule + schedule) entre a 1ª busca e a trava, o nome leva ao job novo.
    SELECT j.jobid, j.active INTO v_jobid, v_ativo
      FROM cron.job j
     WHERE (p_jobname IS NOT NULL AND j.jobname = p_jobname)
        OR (p_jobname IS NULL AND j.jobid = p_jobid);
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
