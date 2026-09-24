-- ============================================================================
-- Central de Controle: uma chamada no lugar de seis
-- Plano: docs/planos/2026-09-24-rpcs-lentas-do-login.md (item C1)
--
-- ── O problema, medido ──────────────────────────────────────────────────────
-- A tela de entrada dispara SEIS RPCs de uma vez (`Promise.allSettled` em
-- `components/CentralControle.tsx`), por cima das ~17 requisições da casca do
-- app. Pico medido: 17 requisições em voo.
--
-- Nenhuma dessas funções é lenta. Medidas sozinhas, com a RLS ativa:
--
--   fn_reconciliation_divergences  1.511 ms     fn_process_bottlenecks    48 ms
--   fn_approval_pending_summary      880 ms     fn_project_scorecard      30 ms
--   fn_approval_action_queue          79 ms     fn_financial_alerts       55 ms
--
-- Em produção, correndo juntas (`pg_stat_statements`, ~350 chamadas), a média
-- vai a 687–3.744 ms e o pior caso a 7,8 s. `fn_process_bottlenecks` custa
-- 3 ms sozinha e 3.565 ms no pior caso — MIL vezes pior. Não é plano de
-- consulta nem índice faltando: é disputa por uma instância pequena
-- (224 MB de shared_buffers, 2 parallel workers).
--
-- Esta função executa as seis numa ÚNICA sessão, em sequência: uma conexão,
-- um round-trip, e o cache do Postgres aproveitado entre os blocos em vez de
-- seis sessões brigando pelo mesmo buffer pool.
--
-- ── SECURITY INVOKER, e é deliberado ────────────────────────────────────────
-- Sem `SECURITY DEFINER`: as seis funções originais são INVOKER, e a RLS é o
-- que recorta o que cada usuário vê. Marcar esta como DEFINER faria a
-- consolidação virar um furo de autorização — ela passaria a devolver, com os
-- privilégios do dono, dados que o chamador não pode ver. A autorização
-- continua onde estava: na RLS de cada tabela que as seis leem.
--
-- ── Um bloco por fonte, e o motivo ──────────────────────────────────────────
-- O código que isto substitui usa `Promise.allSettled` de propósito: uma RPC
-- fora do ar não pode apagar as outras cinco da tela. Um `SELECT` único
-- perderia essa propriedade — a primeira exceção mataria a resposta inteira.
-- Por isso cada fonte vive no seu `BEGIN … EXCEPTION`, e devolve
-- `{"ok": false, "erro": …}` em vez de derrubar as demais.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a função ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_central_controle_bootstrap(
    p_organization_id            uuid,
    p_divergence_as_of           date    DEFAULT CURRENT_DATE,
    p_divergence_aging_days      int     DEFAULT 5,
    p_divergence_value_tolerance numeric DEFAULT 50,
    p_divergence_limit           int     DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    saida jsonb := '{}'::jsonb;
    bloco jsonb;
BEGIN
    -- 1. Alertas financeiros
    BEGIN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO bloco
          FROM public.fn_financial_alerts(p_organization_id) t;
        saida := saida || jsonb_build_object('financial_alerts', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('financial_alerts', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    -- 2. Divergências de conciliação (esta devolve jsonb escalar, não conjunto)
    BEGIN
        SELECT public.fn_reconciliation_divergences(
                   p_organization_id, p_divergence_as_of, p_divergence_aging_days,
                   p_divergence_value_tolerance, p_divergence_limit)
          INTO bloco;
        saida := saida || jsonb_build_object('divergences', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('divergences', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    -- 3. Resumo de aprovações pendentes
    BEGIN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO bloco
          FROM public.fn_approval_pending_summary(p_organization_id) t;
        saida := saida || jsonb_build_object('approval_summary', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('approval_summary', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    -- 4. Gargalos de processo
    BEGIN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO bloco
          FROM public.fn_process_bottlenecks(p_organization_id) t;
        saida := saida || jsonb_build_object('bottlenecks', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('bottlenecks', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    -- 5. Fila acionável de aprovação
    BEGIN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO bloco
          FROM public.fn_approval_action_queue(p_organization_id) t;
        saida := saida || jsonb_build_object('action_queue', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('action_queue', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    -- 6. Scorecard por obra
    BEGIN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO bloco
          FROM public.fn_project_scorecard(p_organization_id) t;
        saida := saida || jsonb_build_object('scorecards', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('scorecards', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    RETURN saida;
END;
$fn$;

COMMENT ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) IS
  'Central de Controle: executa as 6 consultas do painel numa única sessão, '
  'em vez de 6 requisições concorrentes. Cada fonte devolve {ok, data} ou '
  '{ok:false, erro}, preservando o isolamento do Promise.allSettled que '
  'substitui. SECURITY INVOKER — a RLS continua sendo a autorização.';

-- REGRA #7: o PostgreSQL concede EXECUTE a PUBLIC por padrão, e `GRANT` não
-- revoga esse default. Sem o REVOKE, a chave `anon` — que vai no bundle do
-- frontend — poderia chamar esta função. Ela é INVOKER, então a RLS ainda
-- recortaria, mas expor a superfície de graça não tem por que.
REVOKE EXECUTE ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) TO authenticated;

-- ═══ BLOCO 2 — conferência ══════════════════════════════════════════════════
-- Rodar SOZINHO, por último. Esperado: as 6 chaves, todas com ok=true.
--
-- SELECT jsonb_object_keys(public.fn_central_controle_bootstrap(
--          (SELECT id FROM public.organizations LIMIT 1)));
--
-- SELECT key, value->>'ok' AS ok, left(coalesce(value->>'erro',''), 60) AS erro
--   FROM jsonb_each(public.fn_central_controle_bootstrap(
--          (SELECT id FROM public.organizations LIMIT 1)));
