-- scripts/teste-tarefas-pagamento.sql
-- Prova: rotina `daily-payment-tasks` → generate_payment_tasks(3) cria a tarefa "Pagar: …" para
-- cada membro da organização, para conta a pagar que VENCE (due_date) entre hoje e daqui a 3
-- dias — uma por pessoa e vencimento, mesmo depois de concluída; e a tarefa acompanha a conta
-- (paga/cancelada → fecha; adiada → muda a data).
-- Migrations: supabase/migrations/aplicar_20271116916400_tarefas_pagamento_corrige.sql
--             supabase/migrations/aplicar_20271116916500_tarefas_pagamento_acompanha_conta.sql
-- Plano:      docs/planos/2026-11-16-rotinas-automaticas-pontos-abertos.md (Tarefa 1 e revisão)
--
-- Contas montadas na transação, na organização com mais membros (todas DEBIT/PENDING/APROVADO,
-- salvo o que a linha diz):
--   A  vence em +2, lançada há 20 dias        → cria (1 por membro)
--   B  lançada amanhã, vence em +30           → não cria (lançamento ≠ vencimento)
--   C  vence em +2, business_status CANCELADO → não cria
--   D  CREDIT vencendo em +2                  → não cria (é a receber)
--   E  vencida ontem (−1)                     → não cria (janela começa hoje)
--   F  business_status NULL, vence em +1      → cria
--   G  status CONCILIATED, vence em +2        → não cria
--   H  vence em +4                            → não cria (fora da janela)
--   I  vence hoje                             → cria
--   J  vence em +3                            → cria (borda da janela)
-- Ciclo de vida: F conciliada → as tarefas de F fecham; J adiada para +10 → as tarefas abertas
-- de J passam a vencer em +10; I concluída e adiada para +2 → nasce tarefa nova para I.
-- Membro órfão (user_id fora de auth.users) na organização: a rotina NÃO quebra e o pula.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …' (ou o erro do banco);
-- sucesso = a linha final 'TUDO OK'. Sem a 916400, a primeira chamada quebra com 42883; sem a
-- 916500, falha em "membro órfão" (23503) — é o RED.
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-tarefas-pagamento.sql \
--        supabase/migrations/aplicar_20271116916500_tarefas_pagamento_acompanha_conta.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-tarefas-pagamento.sql

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

-- Tarefas `financeiro` de um lançamento (abertas, concluídas ou todas).
CREATE FUNCTION pg_temp.tarefas(p_tx uuid, p_status text DEFAULT NULL) RETURNS bigint LANGUAGE sql AS $$
    SELECT count(*) FROM public.tasks t
     WHERE t.source_module = 'financeiro'
       AND t.source_ref->>'type' = 'internal_transaction'
       AND t.source_ref->>'id' = p_tx::text
       AND (p_status IS NULL OR t.status = p_status)
$$;

CREATE FUNCTION pg_temp.conta(p_org uuid, p_desc text, p_lanc date, p_venc date,
                              p_dir text DEFAULT 'DEBIT', p_status text DEFAULT 'PENDING',
                              p_bs text DEFAULT 'APROVADO', p_valor numeric DEFAULT 10)
RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO public.internal_transactions
        (organization_id, source_system, transaction_date, due_date, amount, direction, status,
         business_status, description)
    VALUES (p_org, 'MANUAL', p_lanc, p_venc, p_valor, p_dir, p_status, p_bs, p_desc)
    RETURNING id
$$;

DO $$
DECLARE
    d         date := current_date;
    v_org     uuid;
    v_membros int;
    a uuid; b uuid; c uuid; dd uuid; e uuid; f uuid; g uuid; h uuid; i uuid; j uuid;
BEGIN
    SELECT m.organization_id INTO v_org
      FROM public.organization_members m
     WHERE m.user_id IS NOT NULL
     GROUP BY m.organization_id
     ORDER BY count(*) DESC
     LIMIT 1;
    SELECT count(DISTINCT m.user_id) INTO v_membros
      FROM public.organization_members m
     WHERE m.organization_id = v_org AND m.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);
    PERFORM pg_temp.confere(v_membros > 0, 'a organização da prova tem membros');

    a  := pg_temp.conta(v_org, 'PROVA tarefa pagamento A', d - 20, d + 2, p_valor => 1234.5);
    b  := pg_temp.conta(v_org, 'PROVA B', d + 1, d + 30);
    c  := pg_temp.conta(v_org, 'PROVA C', d, d + 2, p_bs => 'CANCELADO');
    dd := pg_temp.conta(v_org, 'PROVA D', d, d + 2, p_dir => 'CREDIT');
    e  := pg_temp.conta(v_org, 'PROVA E', d - 5, d - 1);
    f  := pg_temp.conta(v_org, 'PROVA F', d, d + 1, p_bs => NULL);
    g  := pg_temp.conta(v_org, 'PROVA G', d, d + 2, p_status => 'CONCILIATED');
    h  := pg_temp.conta(v_org, 'PROVA H', d, d + 4);
    i  := pg_temp.conta(v_org, 'PROVA I', d, d);
    j  := pg_temp.conta(v_org, 'PROVA J', d, d + 3);

    -- Membro órfão (organization_members.user_id não tem FK para auth.users; tasks.user_id tem).
    INSERT INTO public.organization_members (organization_id, user_id, email)
    VALUES (v_org, gen_random_uuid(), 'orfao-prova@prova.invalid');

    -- 1ª execução
    PERFORM public.generate_payment_tasks(3);

    PERFORM pg_temp.confere(pg_temp.tarefas(a) = v_membros,
        format('A (vence em +2): 1 tarefa por membro (%s) — veio %s', v_membros, pg_temp.tarefas(a)));
    PERFORM pg_temp.confere(
        (SELECT bool_and(t.priority = 1
                         AND t.status = 'open'
                         AND t.source_ref->>'route' = '/contas-a-pagar?tx=' || a::text
                         AND t.source_ref->>'due' = (d + 2)::text
                         AND t.title = 'Pagar: PROVA tarefa pagamento A'
                         AND t.description = 'Vencimento em ' || to_char(d + 2, 'DD/MM/YYYY')
                                              || ' • ' || public.fn_brl(1234.5)
                         AND t.due_date = ((d + 2) || 'T12:00:00Z')::timestamptz
                         AND t.org_id = v_org)
           FROM public.tasks t
          WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = a::text),
        'A: prioridade 1, aberta, link /contas-a-pagar?tx=, vencimento na chave, título, descrição, data');
    PERFORM pg_temp.confere(pg_temp.tarefas(b) = 0, 'B (lançada amanhã, vence em +30): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(c) = 0, 'C (CANCELADO): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(dd) = 0, 'D (CREDIT, a receber): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(e) = 0, 'E (vencida ontem): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(f) = v_membros, 'F (business_status NULL, +1): cria');
    PERFORM pg_temp.confere(pg_temp.tarefas(g) = 0, 'G (CONCILIATED): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(h) = 0, 'H (+4, fora da janela): nenhuma');
    PERFORM pg_temp.confere(pg_temp.tarefas(i) = v_membros, 'I (vence hoje): cria');
    PERFORM pg_temp.confere(pg_temp.tarefas(j) = v_membros, 'J (+3, borda): cria');
    PERFORM pg_temp.confere(
        NOT EXISTS (SELECT 1 FROM public.tasks t
                     WHERE t.source_module = 'financeiro'
                       AND t.source_ref->>'id' IN (a::text, f::text, i::text, j::text)
                       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)),
        'membro órfão: a rotina não quebra e não cria tarefa para ele');

    -- 2ª execução no mesmo dia: não duplica
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(pg_temp.tarefas(a) = v_membros AND pg_temp.tarefas(j) = v_membros,
        'rodar de novo não duplica');

    -- Concluídas: a execução seguinte NÃO recria (o índice único só cobre tarefa aberta)
    UPDATE public.tasks t SET status = 'done'
     WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = a::text;
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(pg_temp.tarefas(a) = v_membros AND pg_temp.tarefas(a, 'open') = 0,
        'concluída não volta na execução seguinte');

    -- Conta conciliada (paga): as tarefas abertas dela fecham
    UPDATE public.internal_transactions SET status = 'CONCILIATED' WHERE id = f;
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(pg_temp.tarefas(f, 'open') = 0 AND pg_temp.tarefas(f, 'done') = v_membros,
        format('F conciliada: as %s tarefas fecham (abertas %s)', v_membros, pg_temp.tarefas(f, 'open')));

    -- Conta adiada: as tarefas abertas passam a vencer na data nova, sem tarefa a mais
    UPDATE public.internal_transactions SET due_date = d + 10 WHERE id = j;
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(
        pg_temp.tarefas(j) = v_membros
        AND (SELECT bool_and(t.status = 'open'
                             AND t.due_date = ((d + 10) || 'T12:00:00Z')::timestamptz
                             AND t.source_ref->>'due' = (d + 10)::text
                             AND t.description LIKE 'Vencimento em ' || to_char(d + 10, 'DD/MM/YYYY') || ' • %')
               FROM public.tasks t
              WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = j::text),
        'J adiada para +10: as tarefas abertas mudam de data e descrição');

    -- Concluída e depois adiada para dentro da janela: nasce tarefa nova para o vencimento novo
    UPDATE public.tasks t SET status = 'done'
     WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = i::text;
    UPDATE public.internal_transactions SET due_date = d + 2 WHERE id = i;
    PERFORM public.generate_payment_tasks(3);
    PERFORM pg_temp.confere(
        pg_temp.tarefas(i, 'done') = v_membros AND pg_temp.tarefas(i, 'open') = v_membros
        AND (SELECT bool_and(t.source_ref->>'due' = (d + 2)::text)
               FROM public.tasks t
              WHERE t.source_module = 'financeiro' AND t.source_ref->>'id' = i::text AND t.status = 'open'),
        'I concluída e adiada para +2: tarefa nova para o vencimento novo');

    -- A concluída não é reaberta nem "fechada de novo" por estar fora do filtro
    PERFORM pg_temp.confere(pg_temp.tarefas(a, 'done') = v_membros, 'A segue concluída');

    -- Privilégio: só o job (postgres) e o service_role
    PERFORM pg_temp.confere(
        NOT has_function_privilege('anon', 'public.generate_payment_tasks(integer)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.generate_payment_tasks(integer)', 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.oid = 'public.generate_payment_tasks(integer)'::regprocedure
                           AND a.grantee = 0),
        'generate_payment_tasks: sem PUBLIC, anon nem authenticated');
END $$;

ROLLBACK;

SELECT 'TUDO OK' AS resultado;
