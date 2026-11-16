-- ==========================================================================
-- Rotinas automáticas — listar e ligar/desligar os jobs do pg_cron pela tela
-- Date: 2026-11-16
-- Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 1)
-- Prova: scripts/teste-rotinas-automaticas.sql
--
-- ⚠️ JÁ APLICADA em 16/11/2026 com o nome antigo
--    `aplicar_20271116900000_rotinas_automaticas_ligar_desligar.sql`.
--    Renomeada para 20271116907000 porque outra frente chegou antes ao `main` com o
--    mesmo prefixo (aplicar_20271116900000_rls_portal_tokens_sem_leitura_anon.sql).
--    NÃO rodar de novo: a tabela e as duas funções já existem no banco.
-- ==========================================================================
-- Pedido do usuário (16/11/2026): "coloque todas com opcão para ativa-las e desativalas"
-- — as 23 rotinas do pg_cron, em Configurações › Rotinas automáticas.
--
-- O QUE ESTA MIGRATION FAZ
-- 1. `rotinas_automaticas_alteracoes`: registro só-acréscimo de quem ligou/desligou o quê.
--    RLS ligada e SEM policy; nenhum privilégio para anon/authenticated (os default
--    privileges do Supabase dariam até TRUNCATE). Só as funções abaixo escrevem/leem.
-- 2. `fn_rotinas_automaticas_listar()`: todos os jobs com o estado REAL (`cron.job.active`
--    — nunca um espelho), a última execução, execuções e falhas de 7 dias e a última
--    alteração registrada.
-- 3. `fn_rotina_automatica_definir(p_jobname, p_ativo)`: `cron.alter_job(active)` + uma
--    linha no registro, na mesma transação. Pedir o estado que já está não faz nada.
--
-- AUTORIZAÇÃO: SÓ SUPERADMIN (`is_superadmin()` = e-mail do JWT em `superadmins`), dentro
-- das duas funções (REGRA #7: GRANT é privilégio de chamada, não regra). Desligar vale para
-- TODAS as organizações: cada rotina é um job único do banco.
--
-- ⚠️ `cron.job_run_details` (474 mil linhas em 16/11) só tem índice em `runid`. A leitura
-- do histórico é por JANELA DE runid (as últimas 150 mil execuções ≈ 36 dias no ritmo de
-- hoje, ~29 mil/semana — cobre a rotina mensal do dia 1), nunca `WHERE start_time` sozinho,
-- que varreria a tabela inteira.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.fn_rotina_automatica_definir(text, boolean);
--   DROP FUNCTION IF EXISTS public.fn_rotinas_automaticas_listar();
--   DROP TABLE IF EXISTS public.rotinas_automaticas_alteracoes;
--   (os jobs ficam no estado em que estiverem; religar à mão com cron.alter_job)
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.rotinas_automaticas_alteracoes (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    jobname            text        NOT NULL,
    ativo_antes        boolean     NOT NULL,
    ativo_depois       boolean     NOT NULL,
    alterado_por       uuid,
    alterado_por_email text,
    alterado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rotinas_automaticas_alteracoes_job_em
    ON public.rotinas_automaticas_alteracoes (jobname, alterado_em DESC);

ALTER TABLE public.rotinas_automaticas_alteracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rotinas_automaticas_alteracoes FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.rotinas_automaticas_alteracoes IS
    'Quem ligou/desligou cada job do pg_cron pela tela Configurações › Rotinas automáticas. '
    'Só acréscimo; lida e escrita só por fn_rotinas_automaticas_listar/fn_rotina_automatica_definir.';

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
    v_max bigint;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'apenas superadmin' USING ERRCODE = '42501';
    END IF;

    -- max(runid) sai do índice da chave; a janela é uma varredura de faixa no mesmo índice.
    SELECT max(d.runid) INTO v_max FROM cron.job_run_details d;

    RETURN QUERY
    WITH janela AS (
        SELECT d.jobid, d.runid, d.status, d.start_time, d.return_message
          FROM cron.job_run_details d
         WHERE d.runid > coalesce(v_max, 0) - 150000
    ),
    ultima AS (
        SELECT DISTINCT ON (jn.jobid) jn.jobid, jn.start_time, jn.status, jn.return_message
          FROM janela jn
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
           a.alterado_em,
           a.alterado_por_email,
           a.ativo_depois
      FROM cron.job j
      LEFT JOIN ultima    u ON u.jobid = j.jobid
      LEFT JOIN semana    s ON s.jobid = j.jobid
      LEFT JOIN alteracao a ON a.jobname = j.jobname
     ORDER BY j.jobname;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_rotinas_automaticas_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotinas_automaticas_listar() TO authenticated;

-- --------------------------------------------------------------------------
-- Ligar / desligar
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rotina_automatica_definir(p_jobname text, p_ativo boolean)
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
    v_ativo boolean;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'apenas superadmin' USING ERRCODE = '42501';
    END IF;
    IF p_ativo IS NULL THEN
        RAISE EXCEPTION 'informe se a rotina fica ligada ou desligada' USING ERRCODE = '22004';
    END IF;

    -- Dois cliques ao mesmo tempo na mesma rotina: um espera o outro, e o registro guarda o
    -- "antes" certo. Não dá `FOR UPDATE` em cron.job: o postgres do Supabase só tem SELECT
    -- nela (a escrita é pelas funções do cron) — medido em 16/11/2026, 42501.
    PERFORM pg_advisory_xact_lock(hashtext('rotina_automatica:' || p_jobname));

    SELECT j.jobid, j.active INTO v_jobid, v_ativo
      FROM cron.job j
     WHERE j.jobname = p_jobname;
    IF v_jobid IS NULL THEN
        RAISE EXCEPTION 'rotina não encontrada: %', p_jobname USING ERRCODE = 'P0002';
    END IF;

    IF v_ativo IS DISTINCT FROM p_ativo THEN
        PERFORM cron.alter_job(v_jobid, active := p_ativo);
        INSERT INTO public.rotinas_automaticas_alteracoes
               (jobname, ativo_antes, ativo_depois, alterado_por, alterado_por_email)
        VALUES (p_jobname, v_ativo, p_ativo, auth.uid(), lower(auth.jwt() ->> 'email'));
    END IF;

    RETURN QUERY
    SELECT l.* FROM public.fn_rotinas_automaticas_listar() l WHERE l.jobname = p_jobname;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_rotina_automatica_definir(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rotina_automatica_definir(text, boolean) TO authenticated;

COMMIT;
