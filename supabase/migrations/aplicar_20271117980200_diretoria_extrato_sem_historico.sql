-- aplicar_20271117980200_diretoria_extrato_sem_historico.sql
-- ÒPURA CEO — correção achada na conferência da tela (17/11). Plano: docs/planos/2026-11-17-opura-ceo.md
-- Prova: scripts/teste-diretoria-ceo.sql (caso "extrato: o histórico da conta fica fora").
--
-- "Extrato sem conciliar" contava também o HISTÓRICO da conta — as linhas até
-- payment_accounts.reconciliation_historic_until, que a Conciliação só classifica e NÃO conta como
-- pendente (fn_reconciliation_progress: pendente = NOT eh_historico). Hoje nenhuma conta tem o corte,
-- então o número não muda; no dia em que alguém marcar o histórico, o painel tem de acompanhar a tela.
-- Só muda o bloco do extrato; o resto de _diretoria_excecoes é o da migration …980000, sem mudança.
--
-- Aplicar: npx supabase db query --linked -f supabase/migrations/aplicar_20271117980200_diretoria_extrato_sem_historico.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._diretoria_excecoes(p_orgs uuid[], p_hoje date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_areas  jsonb;
    v_itens  jsonb;
    v_grupos jsonb := '[]'::jsonb;
    v_erros  jsonb := '{}'::jsonb;
BEGIN
    SELECT COALESCE(jsonb_object_agg(a.organization_id::text || ':' || a.area, a.user_id), '{}'::jsonb)
      INTO v_areas
      FROM public.diretoria_responsaveis_area a
     WHERE a.organization_id = ANY(p_orgs);

    -- Conta a pagar vencida: o "Vencido" de Contas a pagar. Área Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', v.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', v.id,
                   'titulo', COALESCE(NULLIF(btrim(v.party_name), ''), '(sem credor)')
                             || COALESCE(' — ' || NULLIF(btrim(v.description), ''), ''),
                   'valor', v.amount, 'dias', p_hoje - v.due_date, 'data', v.due_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - v.due_date)))
          INTO v_itens
          FROM public.vw_payables v
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (v.organization_id::text || ':financeiro'))::uuid) r
         WHERE v.organization_id = ANY(p_orgs)
           AND v.effective_status = 'VENCIDO';
        v_grupos := v_grupos || public._diretoria_agrupar('conta_vencida', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('conta_vencida', SQLERRM);
    END;

    -- Parcela de cliente vencida: o "Vencido" de Contas a receber. Área Comercial.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', v.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', v.id,
                   'titulo', COALESCE(NULLIF(btrim(v.party_name), ''), '(sem cliente)')
                             || COALESCE(' — ' || NULLIF(btrim(v.description), ''), ''),
                   'valor', v.amount, 'dias', p_hoje - v.due_date, 'data', v.due_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - v.due_date)))
          INTO v_itens
          FROM public.vw_receivables v
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (v.organization_id::text || ':comercial'))::uuid) r
         WHERE v.organization_id = ANY(p_orgs)
           AND v.effective_status = 'VENCIDO';
        v_grupos := v_grupos || public._diretoria_agrupar('parcela_cliente', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('parcela_cliente', SQLERRM);
    END;

    -- Extrato sem conciliar há mais de 7 dias (o "pendente" da Conciliação), por conta. Financeiro.
    -- O histórico da conta (até payment_accounts.reconciliation_historic_until) só se classifica,
    -- não se concilia — fica fora, como em fn_reconciliation_progress (migration …980200).
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', t.organization_id, 'grupo', COALESCE(NULLIF(btrim(pa.name), ''), 'Conta sem nome'),
                   'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', t.id,
                   'titulo', COALESCE(NULLIF(btrim(t.description_raw), ''), '(sem histórico)'),
                   'valor', abs(t.amount), 'dias', p_hoje - t.transaction_date, 'data', t.transaction_date,
                   'sev', CASE WHEN p_hoje - t.transaction_date > 30 THEN 'critico' ELSE 'atencao' END))
          INTO v_itens
          FROM public.bank_transactions t
          LEFT JOIN public.payment_accounts pa ON pa.id = t.bank_account_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (t.organization_id::text || ':financeiro'))::uuid) r
         WHERE t.organization_id = ANY(p_orgs)
           AND public.fn_bank_tx_pendente(t.status)
           AND t.transaction_date < p_hoje - 7
           AND (pa.reconciliation_historic_until IS NULL OR t.transaction_date > pa.reconciliation_historic_until);
        v_grupos := v_grupos || public._diretoria_agrupar('extrato_sem_conciliar', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('extrato_sem_conciliar', SQLERRM);
    END;

    -- Aprovação parada: item da fila de aprovação que vence em até 3 dias ou já venceu.
    -- Responsáveis = aprovadores do próximo nível (a mesma conta da fila); sem eles, Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', q.q_org, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', q.q_entity || ':' || q.q_id,
                   'titulo', q.q_title || COALESCE(' — ' || NULLIF(btrim(q.q_party_name), ''), ''),
                   'valor', NULLIF(q.q_amount, 0), 'dias', p_hoje - q.q_due_date, 'data', q.q_due_date,
                   'sev', CASE WHEN q.q_due_date < p_hoje THEN 'critico' ELSE 'atencao' END))
          INTO v_itens
          FROM (SELECT f.* FROM public._fila_aprovacao_itens(p_orgs) f
                 WHERE f.q_due_date IS NOT NULL AND f.q_due_date <= p_hoje + 3) q
         CROSS JOIN LATERAL (SELECT ARRAY(SELECT a.user_id
                                            FROM public.fn_alcada_aprovadores(q.q_org, q.q_entity, q.q_amount,
                                                                              public.fn_alcada_proximo_nivel(q.q_approval_chain)) a
                                           WHERE a.user_id IS NOT NULL) AS ids) ap
         CROSS JOIN LATERAL public._diretoria_resp(ap.ids, (v_areas ->> (q.q_org::text || ':financeiro'))::uuid) r;
        v_grupos := v_grupos || public._diretoria_agrupar('aprovacao_parada', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('aprovacao_parada', SQLERRM);
    END;

    -- Locação Ativa/Assinada que termina em até 30 dias (ou já terminou) sem contrato de
    -- renovação (filho). Responsável = responsible_email quando é membro; senão Comercial.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', c.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', c.id,
                   'titulo', COALESCE(NULLIF(btrim(c.number), '') || ' — ', '') || COALESCE(NULLIF(btrim(c.title), ''), '(sem título)'),
                   'valor', c.current_value, 'dias', p_hoje - c.end_date, 'data', c.end_date,
                   'sev', CASE WHEN c.end_date < p_hoje THEN 'critico'
                               WHEN c.end_date <= p_hoje + 7 THEN 'atencao' ELSE 'acompanhar' END))
          INTO v_itens
          FROM public.contracts c
          LEFT JOIN LATERAL (SELECT m.user_id FROM public.organization_members m
                              WHERE m.organization_id = c.organization_id AND m.user_id IS NOT NULL
                                AND lower(btrim(m.email)) = lower(btrim(c.responsible_email))
                              LIMIT 1) rm ON true
         CROSS JOIN LATERAL public._diretoria_resp(ARRAY[rm.user_id], (v_areas ->> (c.organization_id::text || ':comercial'))::uuid) r
         WHERE c.organization_id = ANY(p_orgs)
           AND c.domain = 'LOCACAO'
           AND c.status IN ('Ativo', 'Assinado')
           AND c.end_date IS NOT NULL
           AND c.end_date <= p_hoje + 30
           AND NOT EXISTS (SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id);
        v_grupos := v_grupos || public._diretoria_agrupar('contrato_vencendo', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('contrato_vencendo', SQLERRM);
    END;

    -- Entrega atrasada: a condição de fn_risk_sinais, menos o rascunho (não foi enviado ao
    -- fornecedor). Responsável = quem criou o pedido, quando é membro; senão Suprimentos.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', po.organization_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', po.id,
                   'titulo', 'Pedido ' || COALESCE(NULLIF(btrim(po.number), ''), left(po.id::text, 8))
                             || COALESCE(' — ' || NULLIF(btrim(s.name), ''), ''),
                   'valor', NULL, 'dias', p_hoje - po.delivery_date, 'data', po.delivery_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - po.delivery_date)))
          INTO v_itens
          FROM public.purchase_orders po
          LEFT JOIN public.suppliers s ON s.id = po.supplier_id
         CROSS JOIN LATERAL public._diretoria_resp(
                ARRAY[(SELECT m.user_id FROM public.organization_members m
                        WHERE m.organization_id = po.organization_id AND m.user_id = po.criado_por LIMIT 1)],
                (v_areas ->> (po.organization_id::text || ':suprimentos'))::uuid) r
         WHERE po.organization_id = ANY(p_orgs)
           AND po.delivery_date IS NOT NULL
           AND po.actual_delivery_date IS NULL
           AND po.status NOT IN ('Entregue', 'Recebido', 'Cancelado', 'Rascunho')
           AND po.delivery_date < p_hoje;
        v_grupos := v_grupos || public._diretoria_agrupar('entrega_atrasada', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('entrega_atrasada', SQLERRM);
    END;

    -- Documento de colaborador vencido: o critério de rh_kpis_calcular. Área RH.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', ed.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', ed.id,
                   'titulo', e.name || ' — ' || COALESCE(NULLIF(btrim(ed.title), ''), ed.category, 'documento'),
                   'valor', NULL, 'dias', p_hoje - ed.expiry_date, 'data', ed.expiry_date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - ed.expiry_date)))
          INTO v_itens
          FROM public.employee_documents ed
          JOIN public.employees e ON e.id = ed.employee_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (ed.org_id::text || ':rh'))::uuid) r
         WHERE ed.org_id = ANY(p_orgs)
           AND ed.status = 'ATIVO'
           AND ed.expiry_date IS NOT NULL
           AND ed.expiry_date < p_hoje;
        v_grupos := v_grupos || public._diretoria_agrupar('documento_vencido', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('documento_vencido', SQLERRM);
    END;

    -- Férias: período concessivo com saldo que acaba em até 60 dias ou já acabou (o critério
    -- de rh_kpis_calcular). Vencido pede decisão (paga em dobro). Área RH.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', vb.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', vb.id,
                   'titulo', e.name || ' — ' || vb.dias_restantes || ' dias a gozar',
                   'valor', NULL, 'dias', p_hoje - vb.vencimento, 'data', vb.vencimento,
                   'sev', CASE WHEN vb.vencimento < p_hoje THEN 'critico'
                               WHEN vb.vencimento <= p_hoje + 30 THEN 'atencao' ELSE 'acompanhar' END))
          INTO v_itens
          FROM public.vacation_balance vb
          JOIN public.employees e ON e.id = vb.employee_id
         CROSS JOIN LATERAL public._diretoria_resp(NULL::uuid[], (v_areas ->> (vb.org_id::text || ':rh'))::uuid) r
         WHERE vb.org_id = ANY(p_orgs)
           AND vb.dias_restantes > 0
           AND vb.vencimento IS NOT NULL
           AND vb.vencimento <= p_hoje + 60;
        v_grupos := v_grupos || public._diretoria_agrupar('ferias_vencendo', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('ferias_vencendo', SQLERRM);
    END;

    -- Tarefa vencida DE EQUIPE (com colaborador responsável ou num espaço): a agenda pessoal
    -- não é assunto da diretoria. Responsável = login do colaborador; senão o dono.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', t.org_id, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', t.id,
                   'titulo', COALESCE(NULLIF(btrim(t.title), ''), '(sem título)'),
                   'valor', NULL,
                   'dias', p_hoje - (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date,
                   'data', (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date,
                   'sev', public._diretoria_faixa_atraso(p_hoje - (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date)))
          INTO v_itens
          FROM public.tasks t
          LEFT JOIN public.employees e ON e.id = t.assignee_employee_id
         CROSS JOIN LATERAL public._diretoria_resp(ARRAY[COALESCE(e.user_id, t.user_id)], NULL::uuid) r
         WHERE t.org_id = ANY(p_orgs)
           AND t.status = 'open'
           AND t.due_date IS NOT NULL
           AND t.due_date < now()
           AND (t.assignee_employee_id IS NOT NULL OR t.space_id IS NOT NULL);
        v_grupos := v_grupos || public._diretoria_agrupar('tarefa_vencida', v_itens);
    EXCEPTION WHEN OTHERS THEN
        v_erros := v_erros || jsonb_build_object('tarefa_vencida', SQLERRM);
    END;

    RETURN jsonb_build_object('grupos', v_grupos, 'erros', v_erros);
END;
$function$;

-- Interna: continua só para o dono (postgres), chamada de dentro das RPCs SECURITY DEFINER.
REVOKE ALL ON FUNCTION public._diretoria_excecoes(uuid[], date) FROM PUBLIC, anon, authenticated;

COMMIT;
