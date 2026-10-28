-- ============================================================
-- RH — uma conta só para turnover/absenteísmo (passo 2 do plano
-- docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md)
-- OrçaCloud SaaS · Migration 20271028770000
--
-- Antes havia três fórmulas de turnover: rh_kpis (corrigida em 20271028740000),
-- a recalculada no fn_bi_executive (removida lá) e a das fotos mensais do BI
-- Analytics RH (generate_hr_monthly_snapshot), que:
--   • contava desligamentos só em hr_turnover_events — lançamento à mão, 0
--     linhas em 28/10/2026 — e nunca o termination_date do colaborador;
--   • contava headcount só de quem é ATIVO HOJE: quem saiu sumia do passado;
--   • nunca preenchia absenteísmo (dias_uteis/dias_ausencia/absenteismo_rate),
--     que o BI exibe;
--   • era SECURITY DEFINER, gravava, e não checava pertencimento.
--
-- Agora:
--   rh_kpis_calcular(orgs[], data)  — A CONTA. Sem autorização própria, e por
--                                     isso ninguém de fora executa (REVOKE de
--                                     PUBLIC, anon e authenticated).
--   rh_kpis(org, data)              — autoriza (membro / "Todas") e chama a conta.
--   generate_hr_monthly_snapshot    — autoriza e grava a foto a partir da conta;
--                                     hr_turnover_events fica só como o detalhe
--                                     voluntária × involuntária.
--   e as fotos já gravadas são recalculadas pela mesma conta.
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

    -- Horas extras e custo aprovados no mês (apontamento — a fonte da folha é o passo 3 do plano)
    SELECT COALESCE(SUM(te.overtime_hours), 0), COALESCE(SUM(te.total_cost), 0)
    INTO v_horas_extras, v_custo_mes
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
            'custo_mes', v_custo_mes, 'horas_extras', v_horas_extras
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

REVOKE EXECUTE ON FUNCTION public.rh_kpis_calcular(uuid[], date) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.rh_kpis(p_org_id uuid, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_org_ids UUID[];
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

    RETURN public.rh_kpis_calcular(
        CASE WHEN p_org_id IS NULL THEN v_org_ids ELSE ARRAY[p_org_id] END,
        p_ref_date);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rh_kpis(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rh_kpis(uuid, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.generate_hr_monthly_snapshot(p_org_id uuid, p_ano_mes date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_inicio  DATE := DATE_TRUNC('month', p_ano_mes)::DATE;
    v_fim     DATE := (DATE_TRUNC('month', p_ano_mes) + INTERVAL '1 month - 1 day')::DATE;
    v_k       JSON;
    v_dem_vol INTEGER;
    v_dem_inv INTEGER;
BEGIN
    IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não pertence à organização informada';
    END IF;

    -- Mês corrente: absenteísmo até hoje (rh_kpis_calcular corta no p_ref_date).
    v_k := public.rh_kpis_calcular(ARRAY[p_org_id], LEAST(v_fim, CURRENT_DATE));

    -- Motivo do desligamento: só o detalhe. O total vem do cadastro (termination_date).
    SELECT COUNT(*) FILTER (WHERE tipo = 'DEMISSAO_VOLUNTARIA'),
           COUNT(*) FILTER (WHERE tipo = 'DEMISSAO_INVOLUNTARIA')
    INTO v_dem_vol, v_dem_inv
    FROM public.hr_turnover_events
    WHERE org_id = p_org_id AND DATE_TRUNC('month', data_evento) = v_inicio;

    INSERT INTO public.hr_monthly_snapshots (
        org_id, ano_mes,
        headcount_inicio, headcount_fim,
        admissoes, demissoes,
        turnover_rate, turnover_voluntario, turnover_involuntario,
        dias_uteis, dias_ausencia, absenteismo_rate
    ) VALUES (
        p_org_id, v_inicio,
        (v_k->'periodo'->>'headcount_inicio')::INT, (v_k->'periodo'->>'headcount_fim')::INT,
        (v_k->'periodo'->>'admitidos')::INT, (v_k->'periodo'->>'desligados')::INT,
        (v_k->'periodo'->>'turnover_pct')::NUMERIC, v_dem_vol, v_dem_inv,
        (v_k->'qualidade'->>'dias_uteis')::INT, (v_k->'qualidade'->>'dias_ausentes')::INT,
        (v_k->'qualidade'->>'absenteismo_pct')::NUMERIC
    )
    ON CONFLICT (org_id, ano_mes) DO UPDATE SET
        headcount_inicio      = EXCLUDED.headcount_inicio,
        headcount_fim         = EXCLUDED.headcount_fim,
        admissoes             = EXCLUDED.admissoes,
        demissoes             = EXCLUDED.demissoes,
        turnover_rate         = EXCLUDED.turnover_rate,
        turnover_voluntario   = EXCLUDED.turnover_voluntario,
        turnover_involuntario = EXCLUDED.turnover_involuntario,
        dias_uteis            = EXCLUDED.dias_uteis,
        dias_ausencia         = EXCLUDED.dias_ausencia,
        absenteismo_rate      = EXCLUDED.absenteismo_rate;

    RETURN json_build_object(
        'success', TRUE,
        'headcount_fim', (v_k->'periodo'->>'headcount_fim')::INT,
        'turnover_rate', (v_k->'periodo'->>'turnover_pct')::NUMERIC,
        'admissoes', (v_k->'periodo'->>'admitidos')::INT,
        'demissoes', (v_k->'periodo'->>'desligados')::INT
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_hr_monthly_snapshot(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_hr_monthly_snapshot(uuid, date) TO authenticated;


-- Fotos já gravadas: recalcula pela mesma conta (a migration roda como postgres,
-- sem sessão de usuário — por isso direto na rh_kpis_calcular, não pela função
-- que autoriza). Mantém voluntário/involuntário como estavam.
DO $recalc$
DECLARE
    s RECORD;
    k JSON;
BEGIN
    FOR s IN SELECT id, org_id, ano_mes FROM public.hr_monthly_snapshots LOOP
        k := public.rh_kpis_calcular(ARRAY[s.org_id],
               LEAST((DATE_TRUNC('month', s.ano_mes) + INTERVAL '1 month - 1 day')::DATE, CURRENT_DATE));
        UPDATE public.hr_monthly_snapshots SET
            headcount_inicio = (k->'periodo'->>'headcount_inicio')::INT,
            headcount_fim    = (k->'periodo'->>'headcount_fim')::INT,
            admissoes        = (k->'periodo'->>'admitidos')::INT,
            demissoes        = (k->'periodo'->>'desligados')::INT,
            turnover_rate    = (k->'periodo'->>'turnover_pct')::NUMERIC,
            dias_uteis       = (k->'qualidade'->>'dias_uteis')::INT,
            dias_ausencia    = (k->'qualidade'->>'dias_ausentes')::INT,
            absenteismo_rate = (k->'qualidade'->>'absenteismo_pct')::NUMERIC
        WHERE id = s.id;
    END LOOP;
END
$recalc$;
