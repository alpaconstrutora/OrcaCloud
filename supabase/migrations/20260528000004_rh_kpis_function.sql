-- ============================================================
-- Sprint 5: Função RPC rh_kpis — Dashboard Executivo RH
-- ============================================================

CREATE OR REPLACE FUNCTION public.rh_kpis(
    p_org_id    UUID,
    p_ref_date  DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
    v_total             INTEGER;
    v_ativos            INTEGER;
    v_afastados         INTEGER;
    v_ferias            INTEGER;
    v_desligados_mes    INTEGER;
    v_admitidos_mes     INTEGER;
    v_turnover          NUMERIC;
    v_horas_extras      NUMERIC;
    v_custo_mes         NUMERIC;
    v_absenteismo       NUMERIC; -- % dias ausentes / dias úteis esperados
    v_mes_inicio        DATE;
    v_mes_fim           DATE;
    v_treinamentos_venc INTEGER;
    v_docs_venc         INTEGER;
    v_epis_baixo        INTEGER;
    v_ferias_venc       INTEGER;
    v_result            JSON;
BEGIN
    v_mes_inicio := DATE_TRUNC('month', p_ref_date);
    v_mes_fim    := (DATE_TRUNC('month', p_ref_date) + INTERVAL '1 month - 1 day')::DATE;

    -- Headcount
    SELECT COUNT(*) INTO v_total   FROM public.employees WHERE org_id = p_org_id AND status <> 'DESLIGADO';
    SELECT COUNT(*) INTO v_ativos  FROM public.employees WHERE org_id = p_org_id AND status = 'ATIVO';
    SELECT COUNT(*) INTO v_afastados FROM public.employees WHERE org_id = p_org_id AND status = 'AFASTADO';

    -- Colaboradores em férias no período
    SELECT COUNT(DISTINCT employee_id) INTO v_ferias
    FROM public.absences a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE e.org_id = p_org_id
      AND a.tipo = 'FERIAS' AND a.status = 'APROVADO'
      AND a.data_inicio <= v_mes_fim AND a.data_fim >= v_mes_inicio;

    -- Admissões no mês
    SELECT COUNT(*) INTO v_admitidos_mes
    FROM public.employees
    WHERE org_id = p_org_id
      AND hire_date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Desligamentos no mês
    SELECT COUNT(*) INTO v_desligados_mes
    FROM public.employees
    WHERE org_id = p_org_id
      AND termination_date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Turnover (%) = desligamentos / total * 100
    v_turnover := CASE WHEN v_total > 0 THEN ROUND(v_desligados_mes::NUMERIC / v_total * 100, 1) ELSE 0 END;

    -- Horas extras aprovadas no mês
    SELECT COALESCE(SUM(te.overtime_hours), 0) INTO v_horas_extras
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = p_org_id
      AND te.status = 'APROVADO'
      AND te.date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Custo aprovado no mês
    SELECT COALESCE(SUM(te.total_cost), 0) INTO v_custo_mes
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = p_org_id
      AND te.status = 'APROVADO'
      AND te.date BETWEEN v_mes_inicio AND v_mes_fim;

    -- Absenteísmo (dias de falta/atestado no mês / (ativos * dias úteis))
    SELECT COALESCE(SUM(
        LEAST(a.data_fim, v_mes_fim) - GREATEST(a.data_inicio, v_mes_inicio) + 1
    ), 0) INTO v_absenteismo
    FROM public.absences a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE e.org_id = p_org_id
      AND a.tipo IN ('ATESTADO','FALTA','AFASTAMENTO_INSS','LICENCA_MEDICA')
      AND a.status = 'APROVADO'
      AND a.data_inicio <= v_mes_fim AND a.data_fim >= v_mes_inicio;

    -- Converte para %: (dias ausentes / (ativos * 22 dias úteis)) * 100
    v_absenteismo := CASE WHEN v_ativos > 0
        THEN ROUND(v_absenteismo::NUMERIC / (v_ativos * 22) * 100, 1)
        ELSE 0 END;

    -- Alertas de treinamentos vencendo em 30 dias
    SELECT COUNT(*) INTO v_treinamentos_venc
    FROM public.employee_trainings et
    JOIN public.employees e ON e.id = et.employee_id
    WHERE e.org_id = p_org_id
      AND et.data_validade IS NOT NULL
      AND et.data_validade <= p_ref_date + 30
      AND et.status = 'ATIVO';

    -- Documentos vencendo em 30 dias
    SELECT COUNT(*) INTO v_docs_venc
    FROM public.employee_documents ed
    WHERE ed.org_id = p_org_id
      AND ed.expiry_date IS NOT NULL
      AND ed.expiry_date <= p_ref_date + 30
      AND ed.status = 'ATIVO';

    -- EPIs com estoque abaixo do mínimo
    SELECT COUNT(*) INTO v_epis_baixo
    FROM public.epi_catalog
    WHERE org_id = p_org_id
      AND status = 'ATIVO'
      AND estoque_atual <= estoque_minimo;

    -- Férias vencendo em 60 dias
    SELECT COUNT(*) INTO v_ferias_venc
    FROM public.vacation_balance vb
    WHERE vb.org_id = p_org_id
      AND vb.vencimento <= p_ref_date + 60
      AND vb.dias_restantes > 0;

    v_result := json_build_object(
        'headcount', json_build_object(
            'total', v_total, 'ativos', v_ativos,
            'afastados', v_afastados, 'em_ferias', v_ferias
        ),
        'periodo', json_build_object(
            'admitidos', v_admitidos_mes, 'desligados', v_desligados_mes,
            'turnover_pct', v_turnover
        ),
        'custos', json_build_object(
            'custo_mes', v_custo_mes, 'horas_extras', v_horas_extras
        ),
        'qualidade', json_build_object(
            'absenteismo_pct', v_absenteismo
        ),
        'alertas', json_build_object(
            'treinamentos_vencendo', v_treinamentos_venc,
            'docs_vencendo', v_docs_venc,
            'epis_estoque_baixo', v_epis_baixo,
            'ferias_vencendo', v_ferias_venc
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rh_kpis(UUID, DATE) TO authenticated;
