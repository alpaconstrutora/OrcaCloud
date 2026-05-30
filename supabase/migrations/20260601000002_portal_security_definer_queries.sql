-- ============================================================
-- Portal do Colaborador: funções SECURITY DEFINER para acesso
-- sem autenticação Supabase (token-based, anon key)
-- ============================================================

-- 1. Registros de ponto do colaborador
CREATE OR REPLACE FUNCTION public.portal_get_time_entries(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
            SELECT
                te.id,
                te.date,
                te.hours_worked,
                te.overtime_hours,
                te.status,
                te.project_id,
                p.name AS project_name
            FROM public.time_entries te
            LEFT JOIN public.projects p ON p.id = te.project_id
            WHERE te.employee_id = p_employee_id
            ORDER BY te.date DESC
            LIMIT 30
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.portal_get_time_entries(UUID) TO anon, authenticated;

-- 2. Ausências e férias do colaborador
CREATE OR REPLACE FUNCTION public.portal_get_absences(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
            SELECT id, tipo, data_inicio, data_fim, dias, status
            FROM public.absences
            WHERE employee_id = p_employee_id
            ORDER BY data_inicio DESC
            LIMIT 30
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.portal_get_absences(UUID) TO anon, authenticated;

-- 3. Treinamentos do colaborador
CREATE OR REPLACE FUNCTION public.portal_get_trainings(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
            SELECT
                et.id,
                tc.nome        AS course_nome,
                tc.nr_referencia,
                et.data_realizacao,
                et.data_validade,
                et.status
            FROM public.employee_trainings et
            LEFT JOIN public.training_courses tc ON tc.id = et.course_id
            WHERE et.employee_id = p_employee_id
            ORDER BY et.data_validade DESC NULLS LAST
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.portal_get_trainings(UUID) TO anon, authenticated;

-- 4. Documentos do colaborador
CREATE OR REPLACE FUNCTION public.portal_get_documents(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
            SELECT id, title, category, expiry_date
            FROM public.employee_documents
            WHERE employee_id = p_employee_id
            ORDER BY expiry_date ASC NULLS LAST
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.portal_get_documents(UUID) TO anon, authenticated;

-- 5. Folhas de pagamento do colaborador (todas — não só FECHADO)
CREATE OR REPLACE FUNCTION public.portal_get_payroll_runs(p_employee_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
            SELECT
                pr.id,
                pr.start_date,
                pr.end_date,
                pr.type,
                pr.subtype,
                pr.status,
                res.net
            FROM public.payroll_results res
            JOIN public.payroll_runs pr ON pr.id = res.payroll_run_id
            WHERE res.employee_id = p_employee_id
            ORDER BY pr.start_date DESC
        ) t
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.portal_get_payroll_runs(UUID) TO anon, authenticated;
