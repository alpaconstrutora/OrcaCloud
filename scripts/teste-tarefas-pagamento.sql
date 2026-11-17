-- scripts/teste-tarefas-pagamento.sql
-- Prova: rotina `daily-payment-tasks` → generate_payment_tasks(3) cria a tarefa "Pagar: …" para
-- cada membro da organização, para conta a pagar que VENCE (due_date) nos próximos 3 dias —
-- uma vez só por pessoa e conta, mesmo depois de concluída.
-- Migration: supabase/migrations/aplicar_20271116916400_tarefas_pagamento_corrige.sql
-- Plano:     docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 1)
--
-- Contas montadas na transação, na organização do primeiro membro com user_id:
--   A — vence em 2 dias, lançada há 20 dias              → cria (1 por membro)
--   B — lançada amanhã, vence em 30 dias                 → não cria (lançamento ≠ vencimento)
--   C — vence em 2 dias, business_status CANCELADO       → não cria
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …' (ou o erro do banco);
-- sucesso = a linha final 'TUDO OK'. Sem a migration, a primeira chamada quebra com 42883
-- `create_task(… p_priority => integer …) does not exist` — é o RED.
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-tarefas-pagamento.sql \
--        supabase/migrations/aplicar_20271116916400_tarefas_pagamento_corrige.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-tarefas-pagamento.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

CREATE TEMP TABLE prova_conta (papel text PRIMARY KEY, id uuid) ON COMMIT DROP;

DO $$
DECLARE
    v_org     uuid;
    v_membros int;
    v_a       uuid;
    v_b       uuid;
    v_c       uuid;
BEGIN
    SELECT m.organization_id INTO v_org
      FROM public.organization_members m
     WHERE m.user_id IS NOT NULL
     GROUP BY m.organization_id
     ORDER BY count(*) DESC
     LIMIT 1;

    INSERT INTO public.internal_transactions
        (organization_id, source_system, transaction_date, due_date, amount, direction, status,
         business_status, description)
    VALUES (v_org, 'MANUAL', current_date - 20, current_date + 2, 1234.5, 'DEBIT', 'PENDING',
            'APROVADO', 'PROVA tarefa pagamento A')
    RETURNING id INTO v_a;
    INSERT INTO public.internal_transactions
        (organization_id, source_system, transaction_date, due_date, amount, direction, status,
         business_status, description)
    VALUES (v_org, 'MANUAL', current_date + 1, current_date + 30, 10, 'DEBIT', 'PENDING',
            'APROVADO', 'PROVA tarefa pagamento B')
    RETURNING id INTO v_b;
    INSERT INTO public.internal_transactions
        (organization_id, source_system, transaction_date, due_date, amount, direction, status,
         business_status, description)
    VALUES (v_org, 'MANUAL', current_date, current_date + 2, 10, 'DEBIT', 'PENDING',
            'CANCELADO', 'PROVA tarefa pagamento C')
    RETURNING id INTO v_c;
    INSERT INTO prova_conta VALUES ('A', v_a), ('B', v_b), ('C', v_c), ('org', v_org);

    SELECT count(DISTINCT m.user_id) INTO v_membros
      FROM public.organization_members m
     WHERE m.organization_id = v_org AND m.user_id IS NOT NULL;
    PERFORM pg_temp.confere(v_membros > 0, 'a organização da prova tem membros');

    -- 1ª execução
    PERFORM public.generate_payment_tasks(3);

    PERFORM pg_temp.confere(
        (SELECT count(*) FROM public.tasks t
          WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text) = v_membros,
        format('conta A (vence em 2 dias): 1 tarefa por membro (%s)', v_membros));
    PERFORM pg_temp.confere(
        (SELECT bool_and(t.priority = 1
                         AND t.source_ref->>'type' = 'internal_transaction'
                         AND t.source_ref->>'route' = '/contas-a-pagar?tx=' || v_a::text
                         AND t.title = 'Pagar: PROVA tarefa pagamento A'
                         AND t.description = 'Vencimento em ' || to_char(current_date + 2, 'DD/MM/YYYY')
                                              || ' • ' || public.fn_brl(1234.5)
                         AND t.due_date = ((current_date + 2) || 'T12:00:00Z')::timestamptz
                         AND t.org_id = v_org)
           FROM public.tasks t
          WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text),
        'conta A: prioridade 1, link /contas-a-pagar?tx=, título, descrição dd/mm/aaaa • R$, vencimento');
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM public.tasks t
                     WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_b::text),
        'conta B (lançada amanhã, vence em 30 dias): nenhuma tarefa');
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM public.tasks t
                     WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_c::text),
        'conta C (CANCELADO): nenhuma tarefa');

    -- 2ª execução no mesmo dia: não duplica
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM public.tasks t
          WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text) = v_membros,
        'rodar de novo não duplica');

    -- Concluídas: a execução do dia seguinte NÃO recria (o índice único só cobre tarefa aberta)
    UPDATE public.tasks t SET status = 'done'
     WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text;
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(
        (SELECT count(*) FROM public.tasks t
          WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text) = v_membros
        AND NOT EXISTS (SELECT 1 FROM public.tasks t
                         WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = v_a::text
                           AND t.status = 'open'),
        'concluída não volta na execução seguinte');

    -- Mesma assinatura e privilégio de antes (o job roda como postgres)
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public.generate_payment_tasks(integer)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.generate_payment_tasks(integer)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'public.generate_payment_tasks(integer)'::regprocedure
                           AND a.grantee = 0),
        'generate_payment_tasks: só o job — sem PUBLIC, anon nem authenticated');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
