-- aplicar_20271118980000_diretoria_ajustes.sql
-- ÒPURA CEO — ajustes das 6 perguntas de produto (decisão do usuário, 18/11).
-- Plano: docs/planos/2026-11-18-opura-ceo-ajustes.md
-- Prova: scripts/teste-diretoria-ceo.sql
--
--   2. Contagem dupla: a conta a pagar vencida que ainda espera aprovação conta UMA vez, em
--      "aprovação parada" (a causa), e sai de "conta vencida".
--   3. Quem saiu da organização não lê mais a determinação, as atualizações nem a tarefa que a
--      diretoria criou (cobrança/determinação). Gravar já exigia a permissão da Diretoria.
--   6. Cada grupo ganha `familia` = tipo · org · conta, sem faixa e sem responsável: o histórico
--      de cobrança e o vínculo da determinação seguem a família quando o grupo muda de faixa ou
--      de responsável. A `chave` continua única por grupo.
-- Aplicar: npx supabase db query --linked -f <este arquivo>   (nunca `db push`)

-- ── 6. família do grupo ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._diretoria_agrupar(p_tipo text, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    WITH b AS (
        SELECT (e->>'org')::uuid                                   AS org,
               NULLIF(e->>'grupo', '')                             AS grupo,
               NULLIF(e->>'grupo_id', '')                          AS grupo_id,
               ARRAY(SELECT DISTINCT y::uuid
                       FROM jsonb_array_elements_text(COALESCE(e->'resp', '[]'::jsonb)) y
                      ORDER BY 1)                                  AS resp,
               COALESCE(e->>'origem', 'nenhum')                    AS origem,
               e->>'sev'                                           AS sev,
               e->>'id'                                            AS id,
               left(e->>'titulo', 200)                             AS titulo,
               (e->>'valor')::numeric                              AS valor,
               (e->>'dias')::integer                               AS dias,
               (e->>'data')::date                                  AS data
          FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) e
    ), r AS (
        SELECT b.*, row_number() OVER (PARTITION BY org, grupo_id, grupo, resp, origem, sev
                                       ORDER BY valor DESC NULLS LAST, dias DESC NULLS LAST, id) AS rn
          FROM b
    ), g AS (
        SELECT org, grupo_id, grupo, resp, origem, sev,
               count(*)       AS qtd,
               sum(valor)     AS valor,
               max(dias)      AS dias,
               min(data)      AS data_ref,
               jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'valor', valor, 'dias', dias, 'data', data)
                         ORDER BY rn) FILTER (WHERE rn <= 20) AS itens
          FROM r
         GROUP BY org, grupo_id, grupo, resp, origem, sev
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'chave', md5(p_tipo || '|' || org::text || '|' || COALESCE(grupo_id, '') || '|' || COALESCE(grupo, '') || '|'
                            || array_to_string(resp, ',') || '|' || origem || '|' || sev),
               -- Ajustes (…20271118980000): a família não muda com a faixa nem com o responsável.
               'familia', md5(p_tipo || '|' || org::text || '|' || COALESCE(grupo_id, '') || '|' || COALESCE(grupo, '')),
               'tipo', p_tipo, 'org_id', org, 'grupo', grupo, 'grupo_id', grupo_id, 'severidade', sev,
               'origem_responsavel', origem, 'responsaveis', to_jsonb(resp),
               'quantidade', qtd, 'valor', valor, 'dias', dias, 'data_ref', data_ref,
               'itens', COALESCE(itens, '[]'::jsonb))
             ORDER BY CASE sev WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, valor DESC NULLS LAST, qtd DESC),
           '[]'::jsonb)
      FROM g
$function$;

-- ── 2. contagem dupla: aprovação parada antes da conta vencida ──────────────
CREATE OR REPLACE FUNCTION public._diretoria_excecoes(p_orgs uuid[], p_hoje date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_areas  jsonb;
    v_itens  jsonb;
    v_grupos jsonb := '[]'::jsonb;
    v_erros  jsonb := '{}'::jsonb;
    v_aprov      jsonb;
    v_aprov_ids  text[] := '{}';
    v_aprov_erro text;
BEGIN
    SELECT COALESCE(jsonb_object_agg(a.organization_id::text || ':' || a.area, a.user_id), '{}'::jsonb)
      INTO v_areas
      FROM public.diretoria_responsaveis_area a
     WHERE a.organization_id = ANY(p_orgs);

    -- Ajustes (…20271118980000): a aprovação parada é calculada ANTES da conta vencida. A conta
    -- vencida que ainda espera aprovação conta UMA vez, em aprovação parada (a causa).
    -- Aprovação parada: item da fila de aprovação ENVIADO (PENDENTE; o rascunho a submeter fica
    -- fora — revisão …980300) que vence em até 3 dias ou já venceu.
    -- Responsáveis = aprovadores do próximo nível (a mesma conta da fila); sem eles, Financeiro.
    BEGIN
        SELECT jsonb_agg(jsonb_build_object(
                   'org', q.q_org, 'resp', to_jsonb(r.resp), 'origem', r.origem, 'id', q.q_entity || ':' || q.q_id,
                   'titulo', q.q_title || COALESCE(' — ' || NULLIF(btrim(q.q_party_name), ''), ''),
                   'valor', NULLIF(q.q_amount, 0), 'dias', p_hoje - q.q_due_date, 'data', q.q_due_date,
                   'sev', CASE WHEN q.q_due_date < p_hoje THEN 'critico' ELSE 'atencao' END))
          INTO v_itens
          FROM (SELECT f.* FROM public._fila_aprovacao_itens(p_orgs) f
                 WHERE f.q_approval_status = 'PENDENTE'
                   AND f.q_due_date IS NOT NULL AND f.q_due_date <= p_hoje + 3) q
         CROSS JOIN LATERAL (SELECT ARRAY(SELECT a.user_id
                                            FROM public.fn_alcada_aprovadores(q.q_org, q.q_entity, q.q_amount,
                                                                              public.fn_alcada_proximo_nivel(q.q_approval_chain)) a
                                           WHERE a.user_id IS NOT NULL) AS ids) ap
         CROSS JOIN LATERAL public._diretoria_resp(ap.ids, (v_areas ->> (q.q_org::text || ':financeiro'))::uuid) r;
        v_aprov := v_itens;
        SELECT COALESCE(array_agg(substr(e->>'id', length('transaction:') + 1)), '{}')
          INTO v_aprov_ids
          FROM jsonb_array_elements(COALESCE(v_itens, '[]'::jsonb)) e
         WHERE e->>'id' LIKE 'transaction:%';
    EXCEPTION WHEN OTHERS THEN
        v_aprov_erro := SQLERRM;
        v_aprov_ids  := '{}';   -- sem a aprovação, a conta volta a contar como vencida
    END;

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
           AND v.effective_status = 'VENCIDO'
           AND NOT (v.id::text = ANY(v_aprov_ids));
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
                   'grupo_id', t.bank_account_id,
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

    -- Aprovação parada (calculada no início, ver abaixo): entra aqui, na mesma posição de antes.
    IF v_aprov_erro IS NULL THEN
        v_grupos := v_grupos || public._diretoria_agrupar('aprovacao_parada', v_aprov);
    ELSE
        v_erros := v_erros || jsonb_build_object('aprovacao_parada', v_aprov_erro);
    END IF;

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

-- ── 3. quem saiu da organização não lê decisões da diretoria ────────────────
DROP POLICY IF EXISTS diretoria_determinacoes_select ON public.diretoria_determinacoes;
CREATE POLICY diretoria_determinacoes_select ON public.diretoria_determinacoes
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public._diretoria_orgs(false))
           OR (responsavel_user_id = (SELECT auth.uid())
               AND organization_id IN (SELECT public.minhas_orgs_membro())));

DROP POLICY IF EXISTS diretoria_atualizacoes_select ON public.diretoria_determinacao_atualizacoes;
CREATE POLICY diretoria_atualizacoes_select ON public.diretoria_determinacao_atualizacoes
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT public._diretoria_orgs(false))
           OR determinacao_id IN (SELECT d.id FROM public.diretoria_determinacoes d
                                   WHERE d.responsavel_user_id = (SELECT auth.uid())
                                     AND d.organization_id IN (SELECT public.minhas_orgs_membro())));

-- A tarefa que a diretoria cria (cobrança/determinação) traz o texto da decisão: só para quem
-- ainda é membro da org dela. RESTRICTIVE = vale por cima de todas as policies de leitura de
-- tasks (dono, colaborador, gestor); as outras tarefas não mudam.
DROP POLICY IF EXISTS tasks_select_diretoria_so_membro ON public.tasks;
CREATE POLICY tasks_select_diretoria_so_membro ON public.tasks
    AS RESTRICTIVE FOR SELECT TO public
    USING (source_module IS DISTINCT FROM 'diretoria'
           OR org_id IN (SELECT public.minhas_orgs_membro()));

-- ── privilégios (funções internas: só o painel DEFINER e o resumo as chamam) ─
REVOKE ALL ON FUNCTION public._diretoria_agrupar(text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_excecoes(uuid[], date) FROM PUBLIC, anon, authenticated;
