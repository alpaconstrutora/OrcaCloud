-- scripts/teste-diretoria-ceo.sql
-- Prova: painel da Diretoria (ÒPURA CEO, 1ª entrega).
--   • Só quem tem a permissão "Diretoria (CEO)" na organização (canViewDiretoria / canEditDiretoria
--     em organization_members.permissions), ou superadmin, lê o painel e grava; em "Todas" o painel
--     traz só as organizações em que a pessoa tem a permissão.
--   • Exceções agrupadas por tipo · org · conta · responsáveis · gravidade, com a MESMA regra da tela
--     de origem (contagem confere com vw_payables / vw_receivables / bank_transactions) e faixas de
--     gravidade certas; responsável = o do dado, senão o da área, senão "nenhum".
--   • fn_approval_action_queue devolve exatamente o mesmo depois de virar casca de
--     _fila_aprovacao_itens (comparação antes × depois para 3 usuários reais).
--   • Cobrar e determinar criam tarefa na agenda do responsável; concluir fecha a tarefa; o
--     responsável enxerga a própria determinação; hierarquia sem ciclo; tabelas só por RPC.
-- Migration: supabase/migrations/aplicar_20271117980000_diretoria_ceo.sql
-- Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 1)
--
-- Personagens (usuários reais, não superadmins): d — membro da org A com a permissão (ver e editar)
-- e membro da org B sem ela; m — membro de A sem a permissão; r — membro de A, responsável;
-- x — fora de A, membro de B.
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …'; sucesso = 'TUDO OK'.
-- Sem a migration, falha logo no 1º caso (fn_diretoria_painel não existe) — é o RED.
--
-- Ensaio (migration ainda não aplicada):
--   bash scripts/montar-ensaio.sh -o /tmp/e.sql scripts/teste-diretoria-ceo.sql \
--        supabase/migrations/aplicar_20271117980000_diretoria_ceo.sql
--   npx supabase db query --linked -f /tmp/e.sql
-- Depois de aplicada:
--   npx supabase db query --linked -f scripts/teste-diretoria-ceo.sql

BEGIN;

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

CREATE FUNCTION pg_temp.da(p_veio TEXT, p_esperado TEXT, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_esperado LIKE '%\%' THEN
        IF p_veio LIKE p_esperado THEN RETURN; END IF;
    ELSIF p_veio = p_esperado THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'FALHOU: % (veio %, esperava %)', p_msg, left(p_veio, 300), p_esperado;
END $$;

CREATE FUNCTION pg_temp.claims(p_user UUID, p_papel TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT CASE WHEN p_user IS NULL THEN json_build_object('role', p_papel)::text
                ELSE json_build_object('sub', p_user,
                                       'email', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
                                       'role', p_papel)::text END
$$;

CREATE FUNCTION pg_temp.como(p_user UUID, p_papel TEXT, p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    PERFORM set_config('request.jwt.claims', pg_temp.claims(p_user, p_papel), true);
    BEGIN
        EXECUTE format('SET LOCAL ROLE %I', p_papel);
        EXECUTE p_sql INTO v;
        v := 'ok:' || coalesce(v, '<null>');
    EXCEPTION WHEN OTHERS THEN
        v := SQLSTATE || ':' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v;
END $$;

CREATE FUNCTION pg_temp.au(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT pg_temp.como(p_user, 'authenticated', p_sql)
$$;

-- jsonb do painel lido como p_user (falha a prova se a chamada falhar).
CREATE FUNCTION pg_temp.painel(p_user UUID, p_org UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    v := pg_temp.au(p_user, format('SELECT public.fn_diretoria_painel(%L)::text', p_org));
    IF v NOT LIKE 'ok:%' THEN RAISE EXCEPTION 'FALHOU: painel como % na org %: %', p_user, p_org, left(v, 300); END IF;
    RETURN substr(v, 4)::jsonb;
END $$;

-- Fila de aprovação ANTES da migration (impressão digital por usuário), para provar que a casca
-- nova devolve exatamente o mesmo. Depois de aplicada, compara a função com ela mesma.
CREATE TABLE pg_temp.fila_antes (u UUID PRIMARY KEY, h TEXT);
INSERT INTO pg_temp.fila_antes (u, h)
SELECT x.user_id,
       pg_temp.au(x.user_id, 'SELECT md5(coalesce(string_agg(q::text, ''|'' ORDER BY q::text), '''')) FROM public.fn_approval_action_queue(NULL) q')
  FROM (SELECT DISTINCT m.user_id FROM public.organization_members m
         WHERE m.user_id IN (SELECT id FROM auth.users) ORDER BY m.user_id LIMIT 3) x;

-- MIGRATION

DO $$
DECLARE
    org_a UUID; org_b UUID; d UUID; m UUID; r UUID; x UUID; emp UUID; v TEXT; j JSONB; j2 JSONB;
    hoje DATE; n_fonte BIGINT; n_painel BIGINT; det UUID; t UUID; f RECORD;
    sem_perm CONSTANT TEXT := '42501:sem acesso:%';
BEGIN
    -- ── fixtures ─────────────────────────────────────────────────────────────
    SELECT organization_id INTO org_a FROM public.vw_payables WHERE effective_status = 'VENCIDO'
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
    SELECT o.id INTO org_b FROM public.organizations o WHERE o.id <> org_a ORDER BY o.id LIMIT 1;
    PERFORM pg_temp.confere(org_a IS NOT NULL AND org_b IS NOT NULL, 'fixture: orgs A (com contas vencidas) e B');

    SELECT id INTO d FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    SELECT id INTO m FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.id <> d
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    SELECT id INTO r FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.id NOT IN (d, m)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    SELECT id INTO x FROM auth.users au WHERE nullif(btrim(au.email), '') IS NOT NULL AND au.id NOT IN (d, m, r)
       AND NOT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.email = lower(au.email)) ORDER BY au.id LIMIT 1;
    PERFORM pg_temp.confere(x IS NOT NULL, 'fixture: quatro usuários que não são superadmin');

    -- d, m, r membros de A; d e x membros de B; x fora de A; ninguém com a permissão, salvo d em A
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    SELECT o, u, (SELECT email FROM auth.users WHERE id = u), 'member'
      FROM (VALUES (org_a, d), (org_a, m), (org_a, r), (org_b, d), (org_b, x)) p(o, u)
     WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = p.o AND om.user_id = p.u);
    DELETE FROM public.organization_members WHERE organization_id = org_a AND user_id = x;
    UPDATE public.organization_members
       SET permissions = coalesce(permissions, '{}'::jsonb) - 'canViewDiretoria' - 'canEditDiretoria'
     WHERE user_id IN (d, m, r, x);
    UPDATE public.organization_members
       SET permissions = coalesce(permissions, '{}'::jsonb) || '{"canViewDiretoria": true, "canEditDiretoria": true}'::jsonb
     WHERE organization_id = org_a AND user_id = d;

    -- ── 1. permissão para ler o painel ───────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_painel(%L)::text', org_a)), sem_perm,
        'm (sem a permissão) lê o painel da org A');
    PERFORM pg_temp.da(pg_temp.au(x, format('SELECT public.fn_diretoria_painel(%L)::text', org_a)), sem_perm,
        'x (fora da org A) lê o painel da org A');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_painel(%L)::text', org_b)), sem_perm,
        'd lê o painel da org B, onde é membro sem a permissão');
    j := pg_temp.painel(m, NULL);
    PERFORM pg_temp.confere(jsonb_array_length(j->'orgs') = 0, 'm em "Todas" não recebe organização nenhuma');
    PERFORM pg_temp.confere(jsonb_array_length(j->'excecoes') = 0, 'm em "Todas" não recebe exceção nenhuma');
    j := pg_temp.painel(d, NULL);
    PERFORM pg_temp.confere(jsonb_array_length(j->'orgs') = 1 AND (j->'orgs'->0->>'id')::uuid = org_a
        AND (j->'orgs'->0->>'pode_editar')::boolean, 'd em "Todas" recebe só a org A, com edição');
    hoje := (j->>'hoje')::date;
    PERFORM pg_temp.confere(hoje = (now() AT TIME ZONE 'America/Sao_Paulo')::date, '"hoje" é a data de Brasília');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'excecoes') e WHERE (e->>'org_id')::uuid <> org_a),
        'nenhuma exceção de fora da org A');

    -- ── 2. fila de aprovação idêntica antes e depois ────────────────────────
    FOR f IN SELECT * FROM pg_temp.fila_antes LOOP
        PERFORM pg_temp.da(pg_temp.au(f.u, 'SELECT md5(coalesce(string_agg(q::text, ''|'' ORDER BY q::text), '''')) FROM public.fn_approval_action_queue(NULL) q'),
            f.h, format('fila de aprovação de %s igual antes e depois', f.u));
    END LOOP;
    PERFORM pg_temp.confere((SELECT count(*) FROM pg_temp.fila_antes) = 3, 'fixture: 3 usuários na comparação da fila');

    -- ── 3. contas a pagar vencidas: a regra da tela, faixas e responsável ───
    SELECT count(*) INTO n_fonte FROM public.vw_payables WHERE organization_id = org_a AND effective_status = 'VENCIDO';
    SELECT coalesce(sum((e->>'quantidade')::bigint), 0) INTO n_painel
      FROM jsonb_array_elements(j->'excecoes') e WHERE e->>'tipo' = 'conta_vencida';
    PERFORM pg_temp.confere(n_fonte > 0 AND n_painel = n_fonte,
        format('contas vencidas da org A: painel %s, Contas a pagar %s', n_painel, n_fonte));
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j->'excecoes') e
         WHERE e->>'tipo' IN ('conta_vencida', 'parcela_cliente', 'documento_vencido', 'tarefa_vencida', 'entrega_atrasada')
           AND e->>'severidade' <> CASE WHEN (e->>'dias')::int > 30 THEN 'critico'
                                        WHEN (e->>'dias')::int >= 8 THEN 'atencao' ELSE 'acompanhar' END),
        'faixas de atraso: > 30 pede decisão, 8–30 atenção, até 7 acompanhar');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j->'excecoes') e
         WHERE e->>'tipo' = 'conta_vencida' AND (e->>'origem_responsavel' <> 'nenhum' OR jsonb_array_length(e->'responsaveis') <> 0)),
        'conta vencida sem responsável da área cadastrado fica "nenhum"');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j->'excecoes') e
         WHERE jsonb_array_length(e->'itens') > 20 OR jsonb_array_length(e->'itens') > (e->>'quantidade')::int),
        'cada grupo traz no máximo 20 itens');
    PERFORM pg_temp.confere((SELECT count(DISTINCT e->>'chave') = count(*) FROM jsonb_array_elements(j->'excecoes') e),
        'a chave de cada grupo é única');

    SELECT count(*) INTO n_fonte FROM public.vw_receivables WHERE organization_id = org_a AND effective_status = 'VENCIDO';
    SELECT coalesce(sum((e->>'quantidade')::bigint), 0) INTO n_painel FROM jsonb_array_elements(j->'excecoes') e WHERE e->>'tipo' = 'parcela_cliente';
    PERFORM pg_temp.confere(n_painel = n_fonte, format('parcelas vencidas da org A: painel %s, Contas a receber %s', n_painel, n_fonte));

    SELECT count(*) INTO n_fonte FROM public.bank_transactions
     WHERE organization_id = org_a AND public.fn_bank_tx_pendente(status) AND transaction_date < hoje - 7;
    SELECT coalesce(sum((e->>'quantidade')::bigint), 0) INTO n_painel FROM jsonb_array_elements(j->'excecoes') e WHERE e->>'tipo' = 'extrato_sem_conciliar';
    PERFORM pg_temp.confere(n_painel = n_fonte, format('extrato sem conciliar há mais de 7 dias na org A: painel %s, banco %s', n_painel, n_fonte));
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'excecoes') e
         WHERE e->>'tipo' = 'extrato_sem_conciliar' AND (e->>'dias')::int <= 7), 'extrato: só linha com mais de 7 dias');
    -- O histórico da conta (até payment_accounts.reconciliation_historic_until) só se classifica,
    -- não se concilia (fn_reconciliation_progress): fica fora, como na tela de Conciliação.
    UPDATE public.payment_accounts pa SET reconciliation_historic_until = hoje - 30
     WHERE pa.id = (SELECT t.bank_account_id FROM public.bank_transactions t
                     WHERE t.organization_id = org_a AND public.fn_bank_tx_pendente(t.status) AND t.transaction_date < hoje - 30
                     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1);
    j2 := pg_temp.painel(d, org_a);
    SELECT count(*) INTO n_fonte FROM public.bank_transactions t LEFT JOIN public.payment_accounts pa ON pa.id = t.bank_account_id
     WHERE t.organization_id = org_a AND public.fn_bank_tx_pendente(t.status) AND t.transaction_date < hoje - 7
       AND (pa.reconciliation_historic_until IS NULL OR t.transaction_date > pa.reconciliation_historic_until);
    SELECT coalesce(sum((e->>'quantidade')::bigint), 0) INTO n_painel FROM jsonb_array_elements(j2->'excecoes') e WHERE e->>'tipo' = 'extrato_sem_conciliar';
    PERFORM pg_temp.confere(n_painel = n_fonte, format('extrato: o histórico da conta fica fora (painel %s, só o corrente %s)', n_painel, n_fonte));
    PERFORM pg_temp.confere(jsonb_typeof(j->'erros') = 'object' AND j->'erros' = '{}'::jsonb,
        format('nenhum tipo caiu: %s', j->'erros'));

    -- responsável da área: d cadastra r no Financeiro
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_definir_area(%L, %L, %L)::text', org_a, 'financeiro', r)),
        sem_perm, 'm cadastra responsável da área');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_area(%L, %L, %L)::text', org_a, 'financeiro', x)),
        '22023:%membro%', 'd cadastra no Financeiro alguém de fora da org A');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_area(%L, %L, %L)::text', org_a, 'marketing', r)),
        '22023:%', 'd cadastra uma área que não existe');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_area(%L, %L, %L)::text', org_a, 'financeiro', r)),
        'ok:%', 'd cadastra r como responsável do Financeiro');
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(j->'excecoes') e
         WHERE e->>'tipo' IN ('conta_vencida', 'extrato_sem_conciliar')
           AND (e->>'origem_responsavel' <> 'area' OR e->'responsaveis' <> jsonb_build_array(r))),
        'conta vencida e extrato caem no responsável do Financeiro');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM jsonb_array_elements(j->'areas') a
         WHERE a->>'area' = 'financeiro' AND (a->>'user_id')::uuid = r), 'o painel devolve a área cadastrada');

    -- ── 4. tarefa vencida: responsável do dado, faixas, agenda pessoal fora ─
    INSERT INTO public.employees (org_id, name, status, user_id) VALUES (org_a, 'TDIR colaborador', 'ATIVO', r) RETURNING id INTO emp;
    INSERT INTO public.tasks (user_id, org_id, title, due_date, status, assignee_employee_id, source_module) VALUES
        (d, org_a, 'TDIR tarefa 3d',  now() - interval '3 days',  'open', emp, 'manual'),
        (d, org_a, 'TDIR tarefa 15d', now() - interval '15 days', 'open', emp, 'manual'),
        (d, org_a, 'TDIR tarefa 45d', now() - interval '45 days', 'open', emp, 'manual'),
        (r, org_a, 'TDIR pessoal',    now() - interval '5 days',  'open', NULL, 'manual');
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere((SELECT count(*) FROM jsonb_array_elements(j->'excecoes') e, jsonb_array_elements(e->'itens') i
         WHERE e->>'tipo' = 'tarefa_vencida' AND i->>'titulo' LIKE 'TDIR tarefa %'
           AND e->'responsaveis' = jsonb_build_array(r) AND e->>'origem_responsavel' = 'dado'
           AND e->>'severidade' = CASE i->>'titulo' WHEN 'TDIR tarefa 3d' THEN 'acompanhar'
                                                    WHEN 'TDIR tarefa 15d' THEN 'atencao' ELSE 'critico' END) = 3,
        'as 3 tarefas de equipe vencidas caem em r, cada uma na sua faixa');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'excecoes') e, jsonb_array_elements(e->'itens') i
         WHERE i->>'titulo' = 'TDIR pessoal'), 'tarefa da agenda pessoal não entra');
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM jsonb_array_elements(j->'pessoas') p WHERE (p->>'user_id')::uuid = r),
        'r está na lista de pessoas');

    -- ── 5. cobrar ───────────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_cobrar(%L, %L, %L, %L, %L, %L)::text',
        org_a, 'tdir-chave', 'tarefa_vencida', 'TDIR cobrança', ARRAY[r], 'tarefas')), sem_perm, 'm cobra');
    v := pg_temp.au(d, format('SELECT public.fn_diretoria_cobrar(%L, %L, %L, %L, %L, %L)::text',
        org_a, 'tdir-chave', 'tarefa_vencida', 'TDIR cobrança', ARRAY[r], 'tarefas'));
    PERFORM pg_temp.da(v, 'ok:%', 'd cobra r');
    PERFORM pg_temp.confere((substr(v, 4)::jsonb->>'criadas')::int = 1, format('1ª cobrança cria 1 tarefa: %s', v));
    PERFORM pg_temp.confere((SELECT count(*) FROM public.tasks WHERE user_id = r AND source_module = 'diretoria'
         AND source_ref->>'type' = 'cobranca' AND source_ref->>'id' = 'tdir-chave' AND status = 'open') = 1,
        'a tarefa de cobrança está na agenda de r');
    v := pg_temp.au(d, format('SELECT public.fn_diretoria_cobrar(%L, %L, %L, %L, %L, %L)::text',
        org_a, 'tdir-chave', 'tarefa_vencida', 'TDIR cobrança', ARRAY[r], 'tarefas'));
    PERFORM pg_temp.confere((substr(v, 4)::jsonb->>'criadas')::int = 0 AND (substr(v, 4)::jsonb->>'ja_abertas')::int = 1,
        format('2ª cobrança com a tarefa aberta não duplica: %s', v));
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM jsonb_array_elements(j->'cobrancas') c
         WHERE c->>'excecao_chave' = 'tdir-chave' AND (c->>'responsavel_user_id')::uuid = r), 'o painel devolve a cobrança');

    -- ── 6. determinação ─────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_determinar(%L, %L, %L, %L, %L, NULL)::text',
        org_a, 'TDIR decisão', r, hoje + 7, 'teste')), sem_perm, 'm determina');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_determinar(%L, %L, %L, %L, %L, NULL)::text',
        org_a, 'TDIR decisão', x, hoje + 7, 'teste')), '22023:%membro%', 'd determina para alguém de fora da org A');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_determinar(%L, %L, %L, %L, %L, NULL)::text',
        org_a, '   ', r, hoje + 7, 'teste')), '22023:%', 'd determina sem título');
    v := pg_temp.au(d, format('SELECT public.fn_diretoria_determinar(%L, %L, %L, %L, %L, %L)::text',
        org_a, 'TDIR decisão', r, hoje + 7, 'Reunião de teste', 'tdir-chave'));
    PERFORM pg_temp.da(v, 'ok:%', 'd determina para r');
    det := substr(v, 4)::uuid;
    SELECT tarefa_id INTO t FROM public.diretoria_determinacoes WHERE id = det;
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM public.tasks WHERE id = t AND user_id = r AND status = 'open'
         AND source_module = 'diretoria' AND source_ref->>'type' = 'determinacao' AND source_ref->>'id' = det::text),
        'a determinação pôs uma tarefa na agenda de r');
    PERFORM pg_temp.da(pg_temp.au(r, format('SELECT count(*)::text FROM public.diretoria_determinacoes WHERE id = %L', det)),
        'ok:1', 'r (responsável, sem a permissão) vê a determinação dele');
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT count(*)::text FROM public.diretoria_determinacoes WHERE id = %L', det)),
        'ok:0', 'm não vê a determinação');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT count(*)::text FROM public.diretoria_determinacoes WHERE id = %L', det)),
        'ok:1', 'd vê a determinação');
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_atualizar(%L, %L)::text', det, 'andou')), sem_perm, 'm atualiza');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_atualizar(%L, %L)::text', det, 'TDIR andou')), 'ok:%', 'd atualiza');
    PERFORM pg_temp.confere((SELECT status FROM public.diretoria_determinacoes WHERE id = det) = 'andamento',
        'atualizar uma determinação aberta põe em andamento');
    PERFORM pg_temp.da(pg_temp.au(r, format('SELECT count(*)::text FROM public.diretoria_determinacao_atualizacoes WHERE determinacao_id = %L', det)),
        'ok:1', 'r vê a atualização da determinação dele');
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere(EXISTS (SELECT 1 FROM jsonb_array_elements(j->'determinacoes') e
         WHERE (e->>'id')::uuid = det AND e->>'status' = 'andamento' AND e->'atualizacoes'->0->>'texto' = 'TDIR andou'),
        'o painel devolve a determinação com a atualização');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_concluir(%L)::text', det)), 'ok:%', 'd conclui');
    PERFORM pg_temp.confere((SELECT status FROM public.diretoria_determinacoes WHERE id = det) = 'concluida'
        AND (SELECT status FROM public.tasks WHERE id = t) = 'done', 'concluir fecha a determinação e a tarefa');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_atualizar(%L, %L)::text', det, 'depois')),
        '22023:%conclu%', 'atualizar determinação concluída');

    -- ── 7. hierarquia ───────────────────────────────────────────────────────
    PERFORM pg_temp.da(pg_temp.au(m, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, r, d)), sem_perm, 'm define chefe');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, r, d)), 'ok:%', 'r responde a d');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, m, r)), 'ok:%', 'm responde a r');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, d, m)),
        '22023:%ciclo%', 'd responder a m (que responde a r, que responde a d)');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, m, x)),
        '22023:%membro%', 'm responder a alguém de fora da org A');
    PERFORM pg_temp.da(pg_temp.au(d, format('SELECT public.fn_diretoria_definir_chefe(%L, %L, %L)::text', org_a, m, NULL)), 'ok:%', 'tirar o chefe de m');
    j := pg_temp.painel(d, org_a);
    PERFORM pg_temp.confere((SELECT count(*) FROM jsonb_array_elements(j->'hierarquia') h WHERE (h->>'organization_id')::uuid = org_a) = 1
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(j->'hierarquia') h WHERE (h->>'user_id')::uuid = r AND (h->>'chefe_user_id')::uuid = d),
        'o painel devolve a hierarquia (r responde a d)');

    -- ── 8. tabelas só por RPC, preferências, privilégios ────────────────────
    PERFORM pg_temp.da(pg_temp.au(d, format('INSERT INTO public.diretoria_determinacoes (organization_id, titulo, responsavel_user_id, prazo) VALUES (%L, %L, %L, %L) RETURNING 1::text',
        org_a, 'direto', r, hoje)), '42501:%', 'd grava determinação direto na tabela');
    PERFORM pg_temp.da(pg_temp.au(d, format('INSERT INTO public.diretoria_responsaveis_area (organization_id, area, user_id) VALUES (%L, %L, %L) RETURNING 1::text',
        org_a, 'rh', r)), '42501:%', 'd grava área direto na tabela');
    PERFORM pg_temp.da(pg_temp.au(d, format('INSERT INTO public.preferencias (escopo, user_id, chave, valor) VALUES (%L, %L, %L, %L) RETURNING 1::text',
        'USUARIO', d, 'diretoria.visao', '"reuniao"')), 'ok:1', 'preferência diretoria.visao é aceita');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.fn_diretoria_painel(uuid)', 'EXECUTE'), 'anon não executa o painel');
    PERFORM pg_temp.confere(NOT has_function_privilege('anon', 'public.fn_diretoria_cobrar(uuid,text,text,text,uuid[],text)', 'EXECUTE'), 'anon não cobra');
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public._diretoria_excecoes(uuid[],date)', 'EXECUTE'),
        'authenticated não chama a função interna das exceções');
    PERFORM pg_temp.confere(NOT has_function_privilege('authenticated', 'public._diretoria_painel_montar(uuid[],date)', 'EXECUTE'),
        'authenticated não chama a montagem interna do painel');
    PERFORM pg_temp.confere(NOT has_table_privilege('authenticated', 'public.diretoria_cobrancas', 'TRUNCATE'), 'authenticated não trunca cobranças');

    RAISE NOTICE 'TUDO OK';
END $$;

SELECT 'TUDO OK' AS resultado;
ROLLBACK;
