-- ============================================================
-- Dashboard RH — números certos (passo 1 do plano
-- docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md)
-- OrçaCloud SaaS · Migration 20271028740000
--
-- ⚠️ Nasceu como 20271028300000 e foi APLICADA com esse número em 28/10/2026;
-- colidiu com aplicar_20271028300000_conciliacao_status_unico.sql e foi
-- renomeada. Reaplicada com este número no mesmo dia. É idempotente
-- (CREATE OR REPLACE + REVOKE/GRANT): rodar de novo não estraga nada.
--
-- O que estava errado em rh_kpis (todos conferidos no banco em 28/10/2026):
--   • "Todas as organizações" chega como p_org_id = NULL e `org_id = NULL`
--     nunca casa: o painel inteiro mostrava zero ("turnover 0% Estável").
--   • SECURITY DEFINER sem checar pertencimento e com EXECUTE para PUBLIC:
--     qualquer conta lia o RH de qualquer organização pelo UUID.
--   • "vencendo em N dias" sem limite inferior: o vencido contava como a vencer
--     (férias vencidas em 15/10 — pagamento em dobro — saíam como "vencendo").
--   • Turnover = desligados ÷ não-desligados de hoje (o denominador já não tinha
--     quem saiu). Agora: ((admissões + desligamentos) ÷ 2) ÷ headcount médio.
--   • Absenteísmo somava dias corridos contra ativos × 22 dias úteis e contava
--     afastamento INSS — podia passar de 100%. Agora: dias úteis de ATESTADO,
--     FALTA e LICENCA_MEDICA, de 1º do mês até a data de referência.
--
-- E em fn_bi_executive: o bloco de RH somava rh_kpis org a org e RECALCULAVA
-- turnover (fórmula velha) e absenteísmo (média de percentuais). Agora chama
-- rh_kpis uma vez — uma fórmula só nos dois painéis.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rh_kpis(p_org_id uuid, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_org_ids           UUID[];
    v_targets           UUID[];
    v_total             INTEGER;
    v_ativos            INTEGER;
    v_afastados         INTEGER;
    v_ferias            INTEGER;
    v_desligados_mes    INTEGER;
    v_admitidos_mes     INTEGER;
    v_hc_inicio         INTEGER;
    v_hc_fim            INTEGER;
    v_turnover          NUMERIC;
    v_horas_extras      NUMERIC;
    v_custo_mes         NUMERIC;
    v_dias_ausentes     INTEGER;
    v_dias_uteis        INTEGER;
    v_absenteismo       NUMERIC;
    v_mes_inicio        DATE;
    v_mes_fim           DATE;
    v_abs_fim           DATE;
    v_treinamentos_venc INTEGER;
    v_treinamentos_vcd  INTEGER;
    v_docs_venc         INTEGER;
    v_docs_vcd          INTEGER;
    v_epis_baixo        INTEGER;
    v_ferias_venc       INTEGER;
    v_ferias_vcd        INTEGER;
BEGIN
    -- Organizações do usuário (mesma regra de public.is_org_member e de
    -- fn_bi_executive). NULL = "Todas" = todas estas, nunca organization_id NULL.
    SELECT ARRAY(
        SELECT DISTINCT organization_id FROM public.organization_members
        WHERE (user_id IS NOT NULL AND user_id = auth.uid())
           OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
        UNION
        SELECT DISTINCT organization_id FROM public.broker_profiles
        WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
    ) INTO v_org_ids;

    IF p_org_id IS NOT NULL AND NOT (p_org_id = ANY(v_org_ids)) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
    END IF;

    v_targets := CASE WHEN p_org_id IS NULL THEN v_org_ids ELSE ARRAY[p_org_id] END;

    v_mes_inicio := DATE_TRUNC('month', p_ref_date);
    v_mes_fim    := (DATE_TRUNC('month', p_ref_date) + INTERVAL '1 month - 1 day')::DATE;
    -- Absenteísmo mede o que já passou: o resto do mês ainda não foi trabalhado.
    v_abs_fim    := LEAST(v_mes_fim, p_ref_date);

    -- Headcount (hoje)
    SELECT COUNT(*) INTO v_total     FROM public.employees WHERE org_id = ANY(v_targets) AND status <> 'DESLIGADO';
    SELECT COUNT(*) INTO v_ativos    FROM public.employees WHERE org_id = ANY(v_targets) AND status = 'ATIVO';
    SELECT COUNT(*) INTO v_afastados FROM public.employees WHERE org_id = ANY(v_targets) AND status = 'AFASTADO';

    -- Colaboradores com férias em algum dia do mês
    SELECT COUNT(DISTINCT employee_id) INTO v_ferias
    FROM public.absences a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE e.org_id = ANY(v_targets)
      AND a.tipo = 'FERIAS' AND a.status = 'APROVADO'
      AND a.data_inicio <= v_mes_fim AND a.data_fim >= v_mes_inicio;

    -- Admissões e desligamentos no mês
    SELECT COUNT(*) INTO v_admitidos_mes
    FROM public.employees
    WHERE org_id = ANY(v_targets)
      AND hire_date BETWEEN v_mes_inicio AND v_mes_fim;

    SELECT COUNT(*) INTO v_desligados_mes
    FROM public.employees
    WHERE org_id = ANY(v_targets)
      AND termination_date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Headcount no início e no fim do mês, pelas datas. Sem hire_date = já
    -- estava (7 dos 13 cadastros em 28/10/2026); DESLIGADO sem data não conta.
    SELECT
        COUNT(*) FILTER (WHERE COALESCE(hire_date, '-infinity'::date) < v_mes_inicio
                           AND (termination_date IS NULL OR termination_date >= v_mes_inicio)),
        COUNT(*) FILTER (WHERE COALESCE(hire_date, '-infinity'::date) <= v_mes_fim
                           AND (termination_date IS NULL OR termination_date > v_mes_fim))
    INTO v_hc_inicio, v_hc_fim
    FROM public.employees
    WHERE org_id = ANY(v_targets)
      AND NOT (status = 'DESLIGADO' AND termination_date IS NULL);

    -- Turnover (%) = ((admissões + desligamentos) / 2) / headcount médio * 100
    v_turnover := CASE WHEN v_hc_inicio + v_hc_fim > 0
        THEN ROUND(((v_admitidos_mes + v_desligados_mes) / 2.0) / ((v_hc_inicio + v_hc_fim) / 2.0) * 100, 1)
        ELSE 0 END;

    -- Horas extras e custo aprovados no mês (apontamento — a fonte da folha é o passo 3 do plano)
    SELECT COALESCE(SUM(te.overtime_hours), 0), COALESCE(SUM(te.total_cost), 0)
    INTO v_horas_extras, v_custo_mes
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = ANY(v_targets)
      AND te.status = 'APROVADO'
      AND te.date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Absenteísmo (%) = dias úteis ausentes / (ativos * dias úteis), de 1º do mês
    -- até a data de referência. Úteis = seg–sex (feriado não descontado).
    -- Afastamento INSS e licenças legais (maternidade/paternidade) não entram.
    SELECT COUNT(*) INTO v_dias_uteis
    FROM generate_series(v_mes_inicio, v_abs_fim, INTERVAL '1 day') d
    WHERE EXTRACT(ISODOW FROM d) < 6;

    -- DISTINCT: dois registros sobrepostos no mesmo dia contam o dia uma vez.
    SELECT COUNT(DISTINCT (a.employee_id, d)) INTO v_dias_ausentes
    FROM public.absences a
    JOIN public.employees e ON e.id = a.employee_id
    CROSS JOIN LATERAL generate_series(
        GREATEST(a.data_inicio, v_mes_inicio), LEAST(a.data_fim, v_abs_fim), INTERVAL '1 day') d
    WHERE e.org_id = ANY(v_targets)
      AND a.tipo IN ('ATESTADO', 'FALTA', 'LICENCA_MEDICA')
      AND a.status = 'APROVADO'
      AND a.data_inicio <= v_abs_fim AND a.data_fim >= v_mes_inicio
      AND EXTRACT(ISODOW FROM d) < 6;

    v_absenteismo := CASE WHEN v_ativos > 0 AND v_dias_uteis > 0
        THEN ROUND(v_dias_ausentes::NUMERIC / (v_ativos * v_dias_uteis) * 100, 1)
        ELSE 0 END;

    -- Treinamentos: vencidos (antes de hoje) e vencendo em 30 dias (de hoje em diante)
    SELECT
        COUNT(*) FILTER (WHERE et.data_validade < p_ref_date),
        COUNT(*) FILTER (WHERE et.data_validade BETWEEN p_ref_date AND p_ref_date + 30)
    INTO v_treinamentos_vcd, v_treinamentos_venc
    FROM public.employee_trainings et
    JOIN public.employees e ON e.id = et.employee_id
    WHERE e.org_id = ANY(v_targets)
      AND et.data_validade IS NOT NULL
      AND et.status = 'ATIVO';

    -- Documentos: vencidos e vencendo em 30 dias
    SELECT
        COUNT(*) FILTER (WHERE ed.expiry_date < p_ref_date),
        COUNT(*) FILTER (WHERE ed.expiry_date BETWEEN p_ref_date AND p_ref_date + 30)
    INTO v_docs_vcd, v_docs_venc
    FROM public.employee_documents ed
    WHERE ed.org_id = ANY(v_targets)
      AND ed.expiry_date IS NOT NULL
      AND ed.status = 'ATIVO';

    -- EPIs com estoque abaixo do mínimo
    SELECT COUNT(*) INTO v_epis_baixo
    FROM public.epi_catalog
    WHERE org_id = ANY(v_targets)
      AND status = 'ATIVO'
      AND estoque_atual <= estoque_minimo;

    -- Férias: vencidas (pagamento em dobro) e vencendo em 60 dias
    SELECT
        COUNT(*) FILTER (WHERE vb.vencimento < p_ref_date),
        COUNT(*) FILTER (WHERE vb.vencimento BETWEEN p_ref_date AND p_ref_date + 60)
    INTO v_ferias_vcd, v_ferias_venc
    FROM public.vacation_balance vb
    WHERE vb.org_id = ANY(v_targets)
      AND vb.dias_restantes > 0;

    RETURN json_build_object(
        'organizacoes', COALESCE(array_length(v_targets, 1), 0),
        'headcount', json_build_object(
            'total', v_total, 'ativos', v_ativos,
            'afastados', v_afastados, 'em_ferias', v_ferias
        ),
        'periodo', json_build_object(
            'admitidos', v_admitidos_mes, 'desligados', v_desligados_mes,
            'headcount_inicio', v_hc_inicio, 'headcount_fim', v_hc_fim,
            'turnover_pct', v_turnover
        ),
        'custos', json_build_object(
            'custo_mes', v_custo_mes, 'horas_extras', v_horas_extras
        ),
        'qualidade', json_build_object(
            'absenteismo_pct', v_absenteismo, 'dias_uteis', v_dias_uteis
        ),
        'alertas', json_build_object(
            'treinamentos_vencidos', v_treinamentos_vcd,
            'treinamentos_vencendo', v_treinamentos_venc,
            'docs_vencidos', v_docs_vcd,
            'docs_vencendo', v_docs_venc,
            'epis_estoque_baixo', v_epis_baixo,
            'ferias_vencidas', v_ferias_vcd,
            'ferias_vencendo', v_ferias_venc
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rh_kpis(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rh_kpis(uuid, date) TO authenticated;

-- fn_bi_executive: bloco de RH chama rh_kpis uma vez (resto da função idêntico
-- ao que estava no banco em 28/10/2026). Função de invoker (sem SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.fn_bi_executive(p_organization_id uuid, p_date_from date DEFAULT (date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_date_to date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_ids     UUID[];
  v_targets     UUID[];
  v_comercial   JSONB;
  v_supply      JSONB;
  v_operacional JSONB;
  v_dre         JSONB;
  v_rh          JSONB;
BEGIN
  -- Organizações do usuário autenticado (mesma regra de public.is_org_member)
  SELECT ARRAY(
    SELECT DISTINCT organization_id FROM public.organization_members
    WHERE (user_id IS NOT NULL AND user_id = auth.uid())
       OR (user_id IS NULL AND LOWER(email) = LOWER(auth.jwt()->>'email'))
    UNION
    SELECT DISTINCT organization_id FROM public.broker_profiles
    WHERE LOWER(email) = LOWER(auth.jwt()->>'email') AND is_active = true
  ) INTO v_org_ids;

  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY(v_org_ids)) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
  END IF;

  v_targets := CASE WHEN p_organization_id IS NULL THEN v_org_ids ELSE ARRAY[p_organization_id] END;

  -- 1. Comercial
  SELECT jsonb_build_object(
    'total_deals',        COUNT(*),
    'deals_fechados',     COUNT(*) FILTER (WHERE fd.is_vgv),
    'taxa_conversao_pct', CASE
      WHEN COUNT(*) FILTER (WHERE fd.in_conversao_base) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE fd.is_vgv)::NUMERIC
        / COUNT(*) FILTER (WHERE fd.in_conversao_base) * 100, 1)
      ELSE NULL END,
    'vgv_fechado',  COALESCE(SUM(fd.value) FILTER (WHERE fd.is_vgv), 0),
    'ticket_medio', COALESCE(AVG(fd.value) FILTER (WHERE fd.is_vgv), 0)
  ) INTO v_comercial
  FROM public.vw_fact_deal fd
  WHERE fd.organization_id = ANY(v_targets)
    AND fd.deal_date BETWEEN p_date_from AND p_date_to;

  -- 2. Suprimentos
  SELECT jsonb_build_object(
    'total_pedidos',  COUNT(*),
    'recebidos',      COUNT(*) FILTER (WHERE fpo.is_recebido),
    'divergencias',   COUNT(*) FILTER (WHERE fpo.is_divergencia),
    'taxa_divergencia_pct', CASE
      WHEN COUNT(*) FILTER (WHERE fpo.is_fechado) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE fpo.is_divergencia)::NUMERIC
        / COUNT(*) FILTER (WHERE fpo.is_fechado) * 100, 1)
      ELSE NULL END,
    'lead_time_medio_dias', ROUND(AVG(fpo.lead_time_dias) FILTER (WHERE fpo.lead_time_dias IS NOT NULL), 1)
  ) INTO v_supply
  FROM public.vw_fact_purchase_order fpo
  WHERE fpo.organization_id = ANY(v_targets)
    AND fpo.created_at::DATE BETWEEN p_date_from AND p_date_to;

  -- 3. Operacional — com filtro temporal e cast defensivo de endDate
  SELECT jsonb_build_object(
    'obras_ativas', COUNT(*) FILTER (
      WHERE p.settings->>'classification' = 'OBRA'
        AND p.created_at::DATE <= p_date_to
        AND CASE
              WHEN NULLIF(p.settings->>'endDate', '') IS NULL THEN TRUE
              WHEN LEFT(p.settings->>'endDate', 10) ~ '^\d{4}-\d{2}-\d{2}$'
                THEN LEFT(p.settings->>'endDate', 10)::DATE >= p_date_from
              ELSE TRUE
            END
    ),
    'ncs_abertas',      (SELECT COUNT(*) FROM public.construction_conditions cc
                         WHERE cc.organization_id = ANY(v_targets)
                           AND cc.state NOT IN ('CLOSED','VALIDATED')),
    'garantia_abertos', (SELECT COUNT(*) FROM public.warranty_claims wc
                         WHERE wc.organization_id = ANY(v_targets)
                           AND wc.state NOT IN ('ENCERRADO','FORA_GARANTIA')),
    'nps_medio',        (SELECT ROUND(AVG(nps_nota)::NUMERIC, 1)
                         FROM public.warranty_claims
                         WHERE organization_id = ANY(v_targets)
                           AND nps_nota IS NOT NULL)
  ) INTO v_operacional
  FROM public.projects p
  WHERE p.organization_id = ANY(v_targets);

  -- 4. DRE — soma por linha entre as organizações-alvo
  --    (fn_dre_summary só aceita uma organização por chamada; a ordem das
  --    linhas é preservada via WITH ORDINALITY, já que a função sempre
  --    emite as mesmas 10 linhas na mesma ordem via UNION ALL)
  SELECT jsonb_agg(jsonb_build_object('linha', linha, 'realizado', realizado, 'previsto', previsto) ORDER BY ord)
  INTO v_dre
  FROM (
    SELECT linha, MIN(ord) AS ord, SUM(valor_realizado) AS realizado, SUM(valor_previsto) AS previsto
    FROM (
      SELECT d.linha, d.valor_realizado, d.valor_previsto, d.ord
      FROM unnest(v_targets) AS org_id
      CROSS JOIN LATERAL ROWS FROM (public.fn_dre_summary(org_id, p_date_from, p_date_to))
        WITH ORDINALITY AS d(linha, valor_realizado, valor_previsto, ord)
    ) raw
    GROUP BY linha
  ) grouped;

  -- 5. RH — rh_kpis já agrega as organizações-alvo (NULL = as do usuário) e
  --    valida pertencimento por conta própria (migration 20271028740000).
  --    Antes este bloco somava org a org e RECALCULAVA turnover e absenteísmo
  --    com fórmulas próprias — o BI e o Dashboard RH discordavam.
  BEGIN
    v_rh := public.rh_kpis(p_organization_id, CURRENT_DATE)::JSONB;
  EXCEPTION WHEN OTHERS THEN
    v_rh := '{}'::JSONB;
  END;

  RETURN jsonb_build_object(
    'period_from',  p_date_from,
    'period_to',    p_date_to,
    'comercial',    v_comercial,
    'supply',       v_supply,
    'operacional',  v_operacional,
    'dre',          v_dre,
    'rh',           v_rh
  );
END;
$function$;
