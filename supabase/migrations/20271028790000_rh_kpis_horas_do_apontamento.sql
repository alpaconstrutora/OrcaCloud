-- ============================================================
-- RH — horas do apontamento na rh_kpis_calcular (passo 3 do plano
-- docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md)
-- OrçaCloud SaaS · Migration 20271028790000
--
-- O custo de mão de obra do Dashboard RH passa a vir da FOLHA (no front, pela
-- mesma conta do Custo por Obra). O apontamento (time_entries) fica com as HORAS:
-- devolve também horas_trabalhadas e quantos apontamentos aprovados há no mês,
-- para a tela distinguir "0h" de "não medido" e medir horas extras ÷ horas
-- trabalhadas contra a meta horas_extras_max_pct. Resto da função idêntico ao
-- de 20271028770000.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rh_kpis_calcular(p_targets uuid[], p_ref_date date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
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
    v_horas_trab        NUMERIC;
    v_apontamentos      INTEGER;
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
    v_mes_inicio := DATE_TRUNC('month', p_ref_date);
    v_mes_fim    := (DATE_TRUNC('month', p_ref_date) + INTERVAL '1 month - 1 day')::DATE;
    -- Absenteísmo mede o que já passou: o resto do mês ainda não foi trabalhado.
    v_abs_fim    := LEAST(v_mes_fim, p_ref_date);

    -- Headcount (hoje)
    SELECT COUNT(*) INTO v_total     FROM public.employees WHERE org_id = ANY(p_targets) AND status <> 'DESLIGADO';
    SELECT COUNT(*) INTO v_ativos    FROM public.employees WHERE org_id = ANY(p_targets) AND status = 'ATIVO';
    SELECT COUNT(*) INTO v_afastados FROM public.employees WHERE org_id = ANY(p_targets) AND status = 'AFASTADO';

    -- Colaboradores com férias em algum dia do mês
    SELECT COUNT(DISTINCT employee_id) INTO v_ferias
    FROM public.absences a
    JOIN public.employees e ON e.id = a.employee_id
    WHERE e.org_id = ANY(p_targets)
      AND a.tipo = 'FERIAS' AND a.status = 'APROVADO'
      AND a.data_inicio <= v_mes_fim AND a.data_fim >= v_mes_inicio;

    -- Admissões e desligamentos no mês
    SELECT COUNT(*) INTO v_admitidos_mes
    FROM public.employees
    WHERE org_id = ANY(p_targets)
      AND hire_date BETWEEN v_mes_inicio AND v_mes_fim;

    SELECT COUNT(*) INTO v_desligados_mes
    FROM public.employees
    WHERE org_id = ANY(p_targets)
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
    WHERE org_id = ANY(p_targets)
      AND NOT (status = 'DESLIGADO' AND termination_date IS NULL);

    -- Turnover (%) = ((admissões + desligamentos) / 2) / headcount médio * 100
    v_turnover := CASE WHEN v_hc_inicio + v_hc_fim > 0
        THEN ROUND(((v_admitidos_mes + v_desligados_mes) / 2.0) / ((v_hc_inicio + v_hc_fim) / 2.0) * 100, 1)
        ELSE 0 END;

    -- Apontamento aprovado no mês (Diário de Obra / ponto). É a fonte das HORAS; o
    -- CUSTO de mão de obra vem da folha (payrollService.custoDaFolhaDaCompetencia).
    -- `apontamentos` = 0 diz "não medido" — sem isso, 0h e "ninguém apontou" se confundem.
    SELECT COALESCE(SUM(te.overtime_hours), 0), COALESCE(SUM(te.total_cost), 0),
           COALESCE(SUM(te.hours_worked), 0), COUNT(*)
    INTO v_horas_extras, v_custo_mes, v_horas_trab, v_apontamentos
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE e.org_id = ANY(p_targets)
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
    WHERE e.org_id = ANY(p_targets)
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
    WHERE e.org_id = ANY(p_targets)
      AND et.data_validade IS NOT NULL
      AND et.status = 'ATIVO';

    -- Documentos: vencidos e vencendo em 30 dias
    SELECT
        COUNT(*) FILTER (WHERE ed.expiry_date < p_ref_date),
        COUNT(*) FILTER (WHERE ed.expiry_date BETWEEN p_ref_date AND p_ref_date + 30)
    INTO v_docs_vcd, v_docs_venc
    FROM public.employee_documents ed
    WHERE ed.org_id = ANY(p_targets)
      AND ed.expiry_date IS NOT NULL
      AND ed.status = 'ATIVO';

    -- EPIs com estoque abaixo do mínimo
    SELECT COUNT(*) INTO v_epis_baixo
    FROM public.epi_catalog
    WHERE org_id = ANY(p_targets)
      AND status = 'ATIVO'
      AND estoque_atual <= estoque_minimo;

    -- Férias: vencidas (pagamento em dobro) e vencendo em 60 dias
    SELECT
        COUNT(*) FILTER (WHERE vb.vencimento < p_ref_date),
        COUNT(*) FILTER (WHERE vb.vencimento BETWEEN p_ref_date AND p_ref_date + 60)
    INTO v_ferias_vcd, v_ferias_venc
    FROM public.vacation_balance vb
    WHERE vb.org_id = ANY(p_targets)
      AND vb.dias_restantes > 0;

    RETURN json_build_object(
        'organizacoes', COALESCE(array_length(p_targets, 1), 0),
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
            'custo_mes', v_custo_mes, 'horas_extras', v_horas_extras,
            'horas_trabalhadas', v_horas_trab, 'apontamentos', v_apontamentos
        ),
        'qualidade', json_build_object(
            'absenteismo_pct', v_absenteismo, 'dias_uteis', v_dias_uteis,
            'dias_ausentes', v_dias_ausentes
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

-- Recriar não mexe na ACL, mas a REGRA #7 pede o REVOKE junto de toda função.
REVOKE EXECUTE ON FUNCTION public.rh_kpis_calcular(uuid[], date) FROM PUBLIC, anon, authenticated;
