-- ============================================================================
-- fn_process_bottlenecks: gargalos de processo só da organização de quem chama
-- (18/11/2026)
--
-- O QUE FECHA
-- Em produção a função é LANGUAGE sql, SECURITY DEFINER, executável por
-- authenticated, e filtra só por `i.organization_id = p_organization_id` — sem
-- conferir quem chama. Qualquer conta do SaaS (um signUp basta) lia, pelo id de
-- outra organização, o nome de cada etapa dos processos dela, o tipo, o tempo
-- médio e quantas estão concluídas, em andamento e atrasadas.
--
-- Drift: o repositório JÁ tinha a versão com portão
-- (20270129000003_central_controle_todas_organizacoes.sql, item 7), mas ela
-- não está no banco — pg_get_functiondef em 18/11/2026 devolve a versão de
-- 20270105000000. As outras funções daquela migration (fn_financial_alerts,
-- fn_approval_action_queue…) estão com o portão.
--
-- O QUE MUDA
-- Mesmo portão das irmãs que a Central de Controle chama no mesmo bootstrap
-- (fn_fi_targets / fn_approval_action_queue):
--   · org informada: precisa estar em minhas_orgs_membro() — ou quem chama é
--     superadmin. Senão, 'Acesso negado…' (42501). Na Central, o bloco
--     `bottlenecks` do fn_central_controle_bootstrap já captura a exceção
--     ({ok:false}) sem derrubar os outros blocos.
--   · org nula ("Todas as organizações"): a UNIÃO das orgs de quem chama, como
--     nas irmãs. Antes, `organization_id = NULL` não casava com nada e o bloco
--     vinha sempre vazio em "Todas".
-- O cálculo é o mesmo, linha a linha. LANGUAGE passa de sql para plpgsql (o
-- portão precisa de RAISE); STABLE e SECURITY DEFINER ficam (process_instances
-- tem RLS por linha, e o agregado sobre ~2 mil etapas segue em poucos ms).
-- search_path ganha pg_temp.
--
-- QUEM CHAMA (conferido em 18/11/2026)
--   · services/processService.ts getBottlenecks (Processos › painel de
--     gargalos) — org do seletor do topo, ou null em "Todas";
--   · fn_central_controle_bootstrap (INVOKER, chamada pela Central de
--     Controle) — mesma org do topo.
-- Nenhuma Edge Function nem job de pg_cron. Os dois chamadores rodam como o
-- usuário logado, e auth.uid()/auth.jwt() continuam os dele dentro da função.
--
-- REGRA #7
-- Pergunta 1: não cria policy.
-- Pergunta 2: SECURITY DEFINER com a autorização DENTRO; REVOKE de PUBLIC/anon,
-- EXECUTE para authenticated e service_role (a ACL de hoje).
--
-- ORDEM: independente do front (nenhuma mudança de código). Pode ir a qualquer
-- momento.
--
-- COMO CONFERIR (leitura):
--   SELECT p.prosrc ILIKE '%minhas_orgs_membro%' AS tem_portao,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa
--     FROM pg_proc p WHERE p.oid = 'public.fn_process_bottlenecks(uuid)'::regprocedure;  -- true | false
-- No app: Processos › Gargalos e a Central com uma org selecionada mostram o
-- mesmo de antes; em "Todas", passam a mostrar a soma das suas orgs.
-- De fora (conta de teste SEM vínculo com a org X):
--   POST /rest/v1/rpc/fn_process_bottlenecks {"p_organization_id":"<X>"}
--   → 403/42501 "Acesso negado" (antes: 200 com as etapas de X).
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_process_bottlenecks(p_organization_id uuid)
 RETURNS TABLE(step_name text, step_type text, avg_hours numeric, completed_count bigint, active_count bigint, overdue_count bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_alvos uuid[];
BEGIN
    IF p_organization_id IS NULL THEN
        -- "Todas as organizações" = a união das orgs de quem chama.
        v_alvos := ARRAY(SELECT public.minhas_orgs_membro());
    ELSIF p_organization_id IN (SELECT public.minhas_orgs_membro()) OR public.is_superadmin() THEN
        v_alvos := ARRAY[p_organization_id];
    ELSE
        RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada'
            USING ERRCODE = '42501';
    END IF;

    -- Sem alias nas colunas e ORDER BY por posição: em plpgsql os nomes de
    -- RETURNS TABLE são variáveis, e `ORDER BY avg_hours` ficaria ambíguo.
    RETURN QUERY
    SELECT
        s.name,
        s.step_type,
        ROUND(
            AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600.0)
                FILTER (WHERE s.completed_at IS NOT NULL AND s.started_at IS NOT NULL),
        1),
        COUNT(*) FILTER (WHERE s.status = 'CONCLUIDO'),
        COUNT(*) FILTER (WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO')),
        COUNT(*) FILTER (
            WHERE s.status IN ('PENDENTE', 'EM_ANDAMENTO') AND s.due_at IS NOT NULL AND s.due_at < now()
        )
    FROM public.process_instance_steps s
    JOIN public.process_instances i ON i.id = s.process_instance_id
    WHERE i.organization_id = ANY (v_alvos)
    GROUP BY s.name, s.step_type
    ORDER BY 3 DESC NULLS LAST;
END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_process_bottlenecks(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_process_bottlenecks(uuid) TO authenticated, service_role;

-- ── Verificação embutida ─────────────────────────────────────────────────────
DO $pos$
DECLARE
    v_src text;
    v_def boolean;
BEGIN
    SELECT p.prosrc, p.prosecdef INTO v_src, v_def
      FROM pg_proc p WHERE p.oid = 'public.fn_process_bottlenecks(uuid)'::regprocedure;
    IF v_src NOT ILIKE '%minhas_orgs_membro%' OR v_src NOT ILIKE '%RAISE EXCEPTION%' THEN
        RAISE EXCEPTION 'fn_process_bottlenecks sem o portão de organização';
    END IF;
    IF has_function_privilege('anon', 'public.fn_process_bottlenecks(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_process_bottlenecks executável por anon';
    END IF;
    -- Sem usuário (postgres aplicando a migration), org informada = acesso negado.
    BEGIN
        PERFORM 1 FROM public.fn_process_bottlenecks('00000000-0000-0000-0000-000000000000'::uuid);
        RAISE EXCEPTION 'fn_process_bottlenecks respondeu para org de que o chamador não é membro';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;   -- esperado
    END;
    RAISE NOTICE 'fn_process_bottlenecks OK (SECURITY DEFINER=%): só a org de quem chama (ou superadmin); nula = união das orgs dele.', v_def;
END
$pos$;

COMMIT;
