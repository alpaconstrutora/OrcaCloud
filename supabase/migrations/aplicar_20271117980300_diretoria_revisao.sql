-- aplicar_20271117980300_diretoria_revisao.sql
-- ÒPURA CEO — correções da revisão independente (17/11). Plano: docs/planos/2026-11-17-opura-ceo.md
-- Provas: scripts/teste-diretoria-ceo.sql e scripts/teste-diretoria-resumo.sql (casos "Revisão (…980300)").
--
--   #3 fn_diretoria_cobrar: um responsável que não é mais membro (aprovador velho, responsável de área
--      que saiu) fazia o create_task levantar 42501 e derrubava a cobrança INTEIRA. Agora cada um vai
--      num bloco próprio: quem não pode receber a tarefa conta em "ignorados" e os outros são cobrados.
--   #4 fn_diretoria_concluir: fechava a tarefa só se estava 'open' — adiada ('snoozed') ficava viva.
--      Agora fecha qualquer uma não concluída e acerta o status_id (como generate_payment_tasks).
--   #5 fn_diretoria_definir_chefe: exigia que a pessoa ainda fosse membro até para TIRAR da hierarquia
--      (quem saiu ficava preso); o teste de ciclo agora roda sob um lock da org (gravações simultâneas
--      A→B e B→A não passam as duas).
--   #7 extrato: o grupo é pela CONTA (id), não pelo nome — duas contas homônimas eram um grupo só.
--   #8 aprovação parada: só o que foi enviado (PENDENTE); o rascunho a submeter não é "parado na alçada".
--   #10 job semanal: net.http_post com prazo de 120 s (o padrão de 5 s cortaria a function com vários
--      destinatários e deixaria a resposta nula — a mesma lição de …20270919000025).
--
-- Aplicar: npx supabase db query --linked -f supabase/migrations/aplicar_20271117980300_diretoria_revisao.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── #7: agrupar pela conta (grupo_id) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._diretoria_agrupar(p_tipo text, p_itens jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
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
               'tipo', p_tipo, 'org_id', org, 'grupo', grupo, 'severidade', sev,
               'origem_responsavel', origem, 'responsaveis', to_jsonb(resp),
               'quantidade', qtd, 'valor', valor, 'dias', dias, 'data_ref', data_ref,
               'itens', COALESCE(itens, '[]'::jsonb))
             ORDER BY CASE sev WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, valor DESC NULLS LAST, qtd DESC),
           '[]'::jsonb)
      FROM g
$$;

-- ── #7 e #8: exceções ───────────────────────────────────────────────────────────
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

-- ── #4: concluir fecha a tarefa adiada também ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_diretoria_concluir(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_det public.diretoria_determinacoes;
BEGIN
    SELECT * INTO v_det FROM public.diretoria_determinacoes WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem acesso: determinação não encontrada' USING ERRCODE = '42501';
    END IF;
    PERFORM public._diretoria_exige_editar(v_det.organization_id);
    IF v_det.status = 'concluida' THEN
        RETURN;
    END IF;
    UPDATE public.diretoria_determinacoes
       SET status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
     WHERE id = p_id;
    -- Fecha a tarefa em qualquer estado não concluído (aberta ou adiada) e, se ela está numa
    -- coluna personalizada, leva para a 1ª coluna "concluído" da org — como generate_payment_tasks.
    UPDATE public.tasks k
       SET status    = 'done',
           status_id = CASE WHEN k.status_id IS NULL THEN NULL
                            ELSE COALESCE((SELECT s.id FROM public.task_statuses s
                                            WHERE s.org_id = k.org_id AND s.is_done
                                            ORDER BY s.position LIMIT 1), k.status_id) END
     WHERE k.id = v_det.tarefa_id AND k.status <> 'done';
END $$;

-- ── #5: tirar da hierarquia quem saiu; ciclo sob lock ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_diretoria_definir_chefe(p_org uuid, p_user uuid, p_chefe uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    IF p_user IS NULL THEN
        RAISE EXCEPTION 'informe quem responde' USING ERRCODE = '22023';
    END IF;
    IF p_chefe IS NULL THEN
        -- Tirar não exige que a pessoa ainda seja membro: quem saiu da org tem de poder sair daqui.
        DELETE FROM public.diretoria_hierarquia WHERE organization_id = p_org AND user_id = p_user;
        RETURN;
    END IF;
    PERFORM public._diretoria_exige_membro(p_org, p_user, 'quem responde');
    PERFORM public._diretoria_exige_membro(p_org, p_chefe, 'o chefe');
    IF p_chefe = p_user THEN
        RAISE EXCEPTION 'ciclo: ninguém responde a si mesmo' USING ERRCODE = '22023';
    END IF;
    -- Uma gravação de hierarquia por vez na org: sem isto, A→B e B→A simultâneas passavam as duas.
    PERFORM pg_advisory_xact_lock(hashtext('diretoria_hierarquia:' || p_org::text));
    IF EXISTS (WITH RECURSIVE acima(u) AS (
                   SELECT p_chefe
                   UNION
                   SELECT h.chefe_user_id FROM public.diretoria_hierarquia h JOIN acima a ON h.user_id = a.u
                    WHERE h.organization_id = p_org)
               SELECT 1 FROM acima WHERE u = p_user) THEN
        RAISE EXCEPTION 'ciclo: quem você escolheu como chefe já responde, direta ou indiretamente, a esta pessoa' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.diretoria_hierarquia (organization_id, user_id, chefe_user_id, atualizado_por, atualizado_em)
    VALUES (p_org, p_user, p_chefe, auth.uid(), now())
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET chefe_user_id = EXCLUDED.chefe_user_id, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
END $$;

-- ── #3: cobrar não cai inteira por um responsável que saiu ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_diretoria_cobrar(p_org uuid, p_chave text, p_tipo text, p_titulo text,
                                                      p_responsaveis uuid[], p_view text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_titulo    text := btrim(COALESCE(p_titulo, ''));
    v_r         uuid;
    v_t         uuid;
    v_criadas   integer := 0;
    v_ja        integer := 0;
    v_ignorados integer := 0;
BEGIN
    PERFORM public._diretoria_exige_editar(p_org);
    IF NULLIF(btrim(COALESCE(p_chave, '')), '') IS NULL OR length(p_chave) > 500
       OR length(v_titulo) = 0 OR NULLIF(btrim(COALESCE(p_tipo, '')), '') IS NULL OR length(p_tipo) > 60 THEN
        RAISE EXCEPTION 'cobrança sem a exceção identificada (chave, tipo e título)' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(cardinality(array_remove(p_responsaveis, NULL)), 0) = 0 THEN
        RAISE EXCEPTION 'cobrança sem responsável: cadastre o responsável da área' USING ERRCODE = '22023';
    END IF;
    FOREACH v_r IN ARRAY ARRAY(SELECT DISTINCT u FROM unnest(p_responsaveis) u WHERE u IS NOT NULL) LOOP
        BEGIN
            v_t := public.create_task(
                v_r, p_org, left('Cobrança da diretoria: ' || v_titulo, 300), now() + interval '2 days', 'diretoria',
                jsonb_build_object('type', 'cobranca', 'id', p_chave, 'tipo', p_tipo, 'view', NULLIF(btrim(COALESCE(p_view, '')), '')),
                2::smallint, 'A diretoria pediu providência sobre: ' || v_titulo || '.');
        EXCEPTION WHEN insufficient_privilege THEN
            -- create_task recusa quem não é membro da org nem colaborador visível (saiu da org,
            -- aprovador antigo): esse fica de fora e os outros seguem.
            v_ignorados := v_ignorados + 1;
            CONTINUE;
        END;
        IF v_t IS NULL THEN v_ja := v_ja + 1; ELSE v_criadas := v_criadas + 1; END IF;
        INSERT INTO public.diretoria_cobrancas (organization_id, excecao_chave, tipo, titulo, responsavel_user_id, tarefa_id, cobrado_por)
        VALUES (p_org, p_chave, p_tipo, left(v_titulo, 300), v_r, v_t, auth.uid());
    END LOOP;
    RETURN jsonb_build_object('criadas', v_criadas, 'ja_abertas', v_ja, 'ignorados', v_ignorados);
END $$;

-- ── privilégios (REGRA #7): as recriadas acima, escritas de novo neste arquivo ─────
REVOKE ALL ON FUNCTION public._diretoria_agrupar(text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._diretoria_excecoes(uuid[], date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_concluir(uuid)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_definir_chefe(uuid, uuid, uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_diretoria_cobrar(uuid, text, text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_concluir(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_definir_chefe(uuid, uuid, uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_cobrar(uuid, text, text, text, uuid[], text)  TO authenticated;

-- ── #10: job semanal com prazo longo ────────────────────────────────────────────
-- unschedule + schedule RELIGA o job (memória do projeto): lê o estado antes e devolve depois.
DO $$
DECLARE v_ativo boolean;
BEGIN
    SELECT active INTO v_ativo FROM cron.job WHERE jobname = 'diretoria-resumo-semanal';
    IF FOUND THEN PERFORM cron.unschedule('diretoria-resumo-semanal'); END IF;
    PERFORM cron.schedule(
        'diretoria-resumo-semanal',
        '0 10 * * 1',
        $cron$
        SELECT public.fn_diretoria_registrar_semana();
        SELECT net.http_post(
            url := 'https://oxedkknreghxrgenyjiu.supabase.co/functions/v1/diretoria-resumo-semanal',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || public.fn_cron_secret()
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 120000
        );
        $cron$
    );
    IF v_ativo IS FALSE THEN
        PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'diretoria-resumo-semanal'), active := false);
    END IF;
END $$;

COMMIT;
