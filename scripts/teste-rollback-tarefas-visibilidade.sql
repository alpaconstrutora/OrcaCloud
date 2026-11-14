-- scripts/teste-rollback-tarefas-visibilidade.sql
-- Prova: a VOLTA (scripts/rollback-tarefas-visibilidade.sql) aplicada depois da migration
-- aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql devolve o banco ao estado
-- de antes — policies de tasks e task_collaborators, gatilhos de tasks, e corpo, papel,
-- volatilidade, search_path e privilégios das funções que a migration mexe; e as duas
-- funções novas (minhas_orgs_gestor, is_org_gestor_de) somem.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md
--        (Ajustes — visibilidade pelo responsável).
--
-- Fotografa o banco ANTES (linha MIGRATION ainda não rodou), roda a migration, confere
-- que ela mudou algo, roda a volta, confere que a fotografia bate. Corpo das funções
-- comparado sem CR: em produção os corpos vindos do arquivo 995000 (CRLF) têm \r; a volta
-- os recria com LF — mesmo código.
--
-- BEGIN … ROLLBACK: não grava nada. Monta com as duas trocas:
--   bash scripts/montar-ensaio.sh -o /tmp/r.sql scripts/teste-rollback-tarefas-visibilidade.sql \
--        supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql \
--        VOLTA=scripts/rollback-tarefas-visibilidade.sql
--   npx supabase db query --linked -f /tmp/r.sql        # última linha: TUDO OK
-- Rodado como está (sem as trocas), falha em "a migration mudou as policies" — de propósito.

BEGIN;

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Fotografia: uma linha de texto por objeto.
CREATE FUNCTION pg_temp.foto() RETURNS TABLE (obj TEXT, def TEXT) LANGUAGE sql AS $$
    SELECT 'policy ' || tablename || '.' || policyname,
           concat_ws(' | ', cmd, permissive, roles::text, qual, with_check)
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('tasks', 'task_collaborators')
    UNION ALL
    SELECT 'trigger ' || tgname,
           concat_ws(' | ', tgenabled::text, pg_get_triggerdef(t.oid))
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.tasks'::regclass AND NOT t.tgisinternal
    UNION ALL
    SELECT 'function ' || p.oid::regprocedure::text,
           concat_ws(' | ', p.prosecdef::text, p.provolatile::text, p.proconfig::text,
                     (SELECT string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' ORDER BY 1)
                        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a),
                     md5(replace(p.prosrc, E'\r', '')))
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('_tasks_responsavel_so_conteudo', 'pode_gerir_envolvidos_da_tarefa',
                         '_celular_tarefa_visivel', 'celular_tarefa_atualizar',
                         '_celular_tarefas_listar', 'celular_tarefas_listar', 'celular_espacos_listar',
                         'minhas_orgs_gestor', 'is_org_gestor_de')
$$;

CREATE TEMP TABLE foto_antes ON COMMIT DROP AS SELECT * FROM pg_temp.foto();

SELECT pg_temp.confere((SELECT count(*) FROM foto_antes WHERE obj LIKE 'policy tasks.%') = 9
                       AND NOT EXISTS (SELECT 1 FROM foto_antes WHERE obj LIKE 'function public.minhas_orgs_gestor%'
                                                                   OR obj LIKE 'function public.is_org_gestor_de%'),
    'fixture: banco de hoje (9 policies em tasks, sem minhas_orgs_gestor/is_org_gestor_de) — a 998000 já foi aplicada?');

-- MIGRATION

SELECT pg_temp.confere(EXISTS (SELECT * FROM pg_temp.foto() EXCEPT SELECT * FROM foto_antes),
    'a migration mudou as policies/funções (senão o ensaio não prova nada — faltou a troca MIGRATION?)');
SELECT pg_temp.confere(to_regprocedure('public.minhas_orgs_gestor()') IS NOT NULL,
    'a migration criou minhas_orgs_gestor()');

-- VOLTA

-- Diferença simétrica entre antes e depois, para a mensagem.
CREATE TEMP TABLE foto_diff ON COMMIT DROP AS
    (SELECT 'sobrou:  ' || obj AS d FROM (SELECT * FROM pg_temp.foto() EXCEPT SELECT * FROM foto_antes) x)
    UNION ALL
    (SELECT 'faltou:  ' || obj FROM (SELECT * FROM foto_antes EXCEPT SELECT * FROM pg_temp.foto()) y);

SELECT pg_temp.confere(NOT EXISTS (SELECT 1 FROM foto_diff),
    'a volta devolveu tudo como antes — diferenças: '
    || coalesce((SELECT string_agg(d, '; ' ORDER BY d) FROM foto_diff), ''));
SELECT pg_temp.confere(to_regprocedure('public.minhas_orgs_gestor()') IS NULL
                       AND to_regprocedure('public.is_org_gestor_de(uuid,uuid)') IS NULL,
    'a volta apagou minhas_orgs_gestor e is_org_gestor_de');
SELECT pg_temp.confere(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                                     AND p.prosrc ~ 'minhas_orgs_gestor|is_org_gestor_de'),
    'nenhuma função do public chama mais minhas_orgs_gestor / is_org_gestor_de');

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
