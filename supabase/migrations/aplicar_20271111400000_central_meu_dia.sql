-- ════════════════════════════════════════════════════════════════════════════
-- Central de Controle → "Bom dia": bloco `meu_dia` no bootstrap (11/11/2026)
-- Plano: docs/planos/2026-11-10-central-bom-dia.md (item 1)
--
-- A tela "Bom dia" responde "o que precisa de MIM hoje" e "como foi o meu dia".
-- Os seis blocos que já existiam (alertas, divergências, resumo e fila de
-- aprovação, gargalos, scorecard) continuam IGUAIS — copiados sem mudança de
-- aplicar_20270924000001 (conferido idêntico ao banco em 11/11/2026). O sétimo,
-- `meu_dia`, traz o que nenhum deles tinha:
--
--   • tarefas: as MINHAS (`user_id = auth.uid()`; a RLS também mostraria as de
--     espaços compartilhados, que são de outras pessoas) abertas com prazo até
--     hoje, e quantas eu concluí hoje;
--   • contas_hoje: títulos a pagar que vencem HOJE, e quantos foram pagos hoje;
--   • aprovacoes_hoje: passos APROVADO/REJEITADO gravados hoje com o MEU e-mail
--     (DARF conta uma vez, não uma por membro);
--   • contas_7_dias: a pagar por situação — atrasadas, vencem em até 2 dias,
--     vencem de 3 a 7 dias;
--   • conciliado: linhas de extrato dos últimos 30 dias (contas ativas) que
--     estão conciliadas, pela regra ÚNICA `fn_bank_tx_conciliado` /
--     `fn_bank_tx_pendente`, e o mesmo número dos 30 dias anteriores.
--
-- "Hoje" é o dia em São Paulo, não o do servidor (UTC): às 21h de Brasília o
-- CURRENT_DATE do Postgres já é amanhã.
--
-- As aprovações pendentes e os alertas de alta prioridade NÃO entram aqui: a
-- tela já os tem em `action_queue` (com `pode_aprovar`) e `financial_alerts`.
--
-- REGRA #7 (CLAUDE.md):
--   P1 sem policy nova.
--   P2 a função continua SECURITY INVOKER: tudo o que o bloco novo lê passa
--      pela RLS de quem chama (tasks, internal_transactions, bank_transactions,
--      payment_accounts e as 7 tabelas com approval_chain). Só `authenticated`
--      executa; REVOKE … FROM PUBLIC, anon mantido.
--   P3 não se aplica (sem Edge Function).
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `supabase db push`.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '5s';

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
    -- Bloco 7 (meu_dia)
    v_hoje   date        := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_inicio timestamptz := (v_hoje::timestamp AT TIME ZONE 'America/Sao_Paulo');
    v_fim    timestamptz := ((v_hoje + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
    v_email  text        := lower(COALESCE(auth.jwt() ->> 'email', ''));
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

    -- 7. Meu dia (11/11/2026). `p_organization_id` nulo = "Todas as
    --    organizações" no topo: sem filtro, a RLS recorta (REGRA #5).
    BEGIN
        WITH
        tarefas_abertas AS (
            SELECT t.id, t.org_id, t.title, t.due_date, t.priority, t.source_module, t.source_ref
              FROM public.tasks t
             WHERE t.user_id = auth.uid()
               AND t.status = 'open'
               AND t.parent_task_id IS NULL
               AND t.due_date < v_fim
               AND (p_organization_id IS NULL OR t.org_id = p_organization_id)
        ),
        titulos_a_pagar AS (
            SELECT t.id, t.organization_id, t.description, t.party_name, t.amount, t.due_date
              FROM public.internal_transactions t
             WHERE t.direction = 'DEBIT'
               AND t.status = 'PENDING'
               AND COALESCE(t.business_status, '') <> 'RETIDO'
               AND (p_organization_id IS NULL OR t.organization_id = p_organization_id)
        ),
        -- Passos de aprovação de todas as tabelas com cadeia. DARF grava o mesmo
        -- passo em cada título-membro: `chave` junta os membros num item só.
        passos AS (
            SELECT COALESCE(t.darf_id, t.id) AS chave, p.passo
              FROM public.internal_transactions t, jsonb_array_elements(t.approval_chain) p(passo)
             WHERE jsonb_typeof(t.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR t.organization_id = p_organization_id)
            UNION ALL
            SELECT c.id, p.passo FROM public.contracts c, jsonb_array_elements(c.approval_chain) p(passo)
             WHERE jsonb_typeof(c.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
            UNION ALL
            SELECT o.id, p.passo FROM public.purchase_orders o, jsonb_array_elements(o.approval_chain) p(passo)
             WHERE jsonb_typeof(o.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR o.organization_id = p_organization_id)
            UNION ALL
            SELECT r.id, p.passo FROM public.purchase_requests r, jsonb_array_elements(r.approval_chain) p(passo)
             WHERE jsonb_typeof(r.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
            UNION ALL
            SELECT b.id, p.passo FROM public.blueprint_snapshots b, jsonb_array_elements(b.approval_chain) p(passo)
             WHERE jsonb_typeof(b.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR b.organization_id = p_organization_id)
            UNION ALL
            SELECT d.id, p.passo FROM public.doc_gen_documentos d, jsonb_array_elements(d.approval_chain) p(passo)
             WHERE jsonb_typeof(d.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR d.organization_id = p_organization_id)
            UNION ALL
            -- Etapa de processo não tem organization_id: vem da instância.
            SELECT s.id, p.passo
              FROM public.process_instance_steps s
              JOIN public.process_instances i ON i.id = s.process_instance_id,
                   jsonb_array_elements(s.approval_chain) p(passo)
             WHERE jsonb_typeof(s.approval_chain) = 'array'
               AND (p_organization_id IS NULL OR i.organization_id = p_organization_id)
        ),
        extrato AS (
            SELECT bt.transaction_date, public.fn_bank_tx_conciliado(bt.status) AS conciliado,
                   public.fn_bank_tx_pendente(bt.status) AS pendente
              FROM public.bank_transactions bt
              JOIN public.payment_accounts pa ON pa.id = bt.bank_account_id AND pa.is_active
             WHERE bt.transaction_date > v_hoje - 60
               AND bt.transaction_date <= v_hoje
               AND (p_organization_id IS NULL OR bt.organization_id = p_organization_id)
        )
        SELECT jsonb_build_object(
            'hoje', v_hoje,
            'tarefas', jsonb_build_object(
                'pendentes', COALESCE((
                    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.due_date, x.priority)
                      FROM (SELECT * FROM tarefas_abertas ORDER BY due_date, priority LIMIT 20) x), '[]'::jsonb),
                'qtd_pendentes', (SELECT count(*) FROM tarefas_abertas),
                'concluidas_hoje', (
                    SELECT count(*) FROM public.tasks t
                     WHERE t.user_id = auth.uid()
                       AND t.status = 'done'
                       AND t.completed_at >= v_inicio AND t.completed_at < v_fim
                       AND (p_organization_id IS NULL OR t.org_id = p_organization_id))
            ),
            'contas_hoje', jsonb_build_object(
                'pendentes', COALESCE((
                    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC)
                      FROM (SELECT * FROM titulos_a_pagar WHERE due_date = v_hoje ORDER BY amount DESC LIMIT 20) x), '[]'::jsonb),
                'qtd_pendentes', (SELECT count(*) FROM titulos_a_pagar WHERE due_date = v_hoje),
                'pagas_hoje', (
                    SELECT count(*) FROM public.internal_transactions t
                     WHERE t.direction = 'DEBIT'
                       AND t.status <> 'CANCELLED'
                       AND t.payment_date = v_hoje
                       AND (p_organization_id IS NULL OR t.organization_id = p_organization_id))
            ),
            'aprovacoes_hoje', (
                SELECT count(DISTINCT p.chave) FROM passos p
                 WHERE v_email <> ''
                   AND lower(p.passo ->> 'approved_by') = v_email
                   AND p.passo ->> 'action' IN ('APROVADO', 'REJEITADO')
                   AND (p.passo ->> 'approved_at')::timestamptz >= v_inicio
                   AND (p.passo ->> 'approved_at')::timestamptz <  v_fim),
            'contas_7_dias', jsonb_build_object(
                'atrasadas', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(amount), 0))
                                FROM titulos_a_pagar WHERE due_date < v_hoje),
                'vencem_em_2_dias', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(amount), 0))
                                FROM titulos_a_pagar WHERE due_date BETWEEN v_hoje AND v_hoje + 2),
                'vencem_em_7_dias', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(amount), 0))
                                FROM titulos_a_pagar WHERE due_date BETWEEN v_hoje + 3 AND v_hoje + 7)
            ),
            'conciliado', jsonb_build_object(
                'conciliadas',          (SELECT count(*) FROM extrato WHERE conciliado AND transaction_date > v_hoje - 30),
                'pendentes',            (SELECT count(*) FROM extrato WHERE pendente   AND transaction_date > v_hoje - 30),
                'conciliadas_anterior', (SELECT count(*) FROM extrato WHERE conciliado AND transaction_date <= v_hoje - 30),
                'pendentes_anterior',   (SELECT count(*) FROM extrato WHERE pendente   AND transaction_date <= v_hoje - 30)
            )
        ) INTO bloco;
        saida := saida || jsonb_build_object('meu_dia', jsonb_build_object('ok', true, 'data', bloco));
    EXCEPTION WHEN OTHERS THEN
        saida := saida || jsonb_build_object('meu_dia', jsonb_build_object('ok', false, 'erro', SQLERRM));
    END;

    RETURN saida;
END;
$fn$;

COMMENT ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) IS
  'Central de Controle ("Bom dia"): as consultas do painel numa única sessão. '
  'Cada fonte devolve {ok, data} ou {ok:false, erro}. Bloco meu_dia (11/11/2026): '
  'tarefas, contas de hoje, aprovações dadas hoje, contas a pagar 7 dias e extrato '
  'conciliado. SECURITY INVOKER — a RLS continua sendo a autorização.';

REVOKE EXECUTE ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_central_controle_bootstrap(uuid, date, int, numeric, int) TO authenticated;

COMMIT;

-- Conferência (como usuário autenticado; como postgres, auth.uid() é nulo e o
-- bloco devolve zeros):
--   SELECT key, value->>'ok' FROM jsonb_each(public.fn_central_controle_bootstrap(NULL));
