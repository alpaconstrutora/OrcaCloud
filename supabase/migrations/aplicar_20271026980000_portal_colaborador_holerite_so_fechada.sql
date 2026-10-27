-- ============================================================
-- Migration: aplicar_20271026980000_portal_colaborador_holerite_so_fechada.sql
-- Plano: docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md (item 2b)
--
-- PEDIDO: "Lista de holerites somente fechadas" (26/10/2026).
--
-- PROBLEMA
-- A aba Folha do Portal do Colaborador listava TODA folha com resultado do
-- colaborador — inclusive PROCESSANDO/RASCUNHO, que o RH ainda recalcula. O
-- colaborador via um líquido que podia mudar (ou sumir) antes do pagamento.
-- No banco, em 26/10: 6 folhas FECHADO e 16 PROCESSANDO.
--
-- A CORREÇÃO
-- 1. `portal_get_payroll_runs` (a lista; `fn_colab_portal_payroll_runs` só a
--    repassa) filtra `status = 'FECHADO'` — o mesmo critério do app
--    (PayrollRunList/PayrollRunDetail: fechada = 'FECHADO', o resto é rascunho).
-- 2. `fn_colab_portal_paystub` (o recibo) recusa folha não fechada com o mesmo
--    PORTAL_HOLERITE_INDISPONIVEL — tirar da lista não basta, quem tiver o id
--    de uma folha em rascunho abriria o recibo.
--
-- E, DE QUEBRA, UM VAZAMENTO
-- A família `portal_get_*(p_employee_id)` + `portal_employee_summary` era
-- executável por `authenticated`: qualquer conta logada, de QUALQUER
-- organização, lia ponto, férias, documentos e LÍQUIDOS de qualquer colaborador
-- pelo UUID. O último chamador no front (a aba Prévia sem token) saiu no #189.
-- Quem ainda as chama são os wrappers `fn_colab_portal_*(p_token)`, SECURITY
-- DEFINER com dono postgres — não dependem desse grant. Revoga-se tudo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_get_payroll_runs(p_employee_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
              AND pr.status = 'FECHADO'
            ORDER BY pr.start_date DESC
        ) t
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_colab_portal_paystub(p_token text, p_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_emp    uuid := public.fn_colab_portal_employee(p_token);
    v_run    public.payroll_runs%ROWTYPE;
    v_res    public.payroll_results%ROWTYPE;
BEGIN
    SELECT * INTO v_res
      FROM public.payroll_results
     WHERE payroll_run_id = p_run_id
       AND employee_id = v_emp
       -- Só folha FECHADA: rascunho/processando ainda muda e não é holerite.
       AND EXISTS (SELECT 1 FROM public.payroll_runs pr
                    WHERE pr.id = p_run_id AND pr.status = 'FECHADO')
     ORDER BY id DESC
     LIMIT 1;

    IF v_res.id IS NULL THEN
        RAISE EXCEPTION 'PORTAL_HOLERITE_INDISPONIVEL'
            USING HINT = 'Este holerite nao esta disponivel para o seu link.';
    END IF;

    SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;

    RETURN json_build_object(
        'run', json_build_object(
            'id', v_run.id, 'org_id', v_run.org_id,
            'start_date', v_run.start_date, 'end_date', v_run.end_date,
            'status', v_run.status, 'type', v_run.type, 'subtype', v_run.subtype,
            'vacation_start', v_run.vacation_start, 'vacation_end', v_run.vacation_end
        ),
        'result', (
            SELECT json_build_object(
                'id', v_res.id, 'payroll_run_id', v_res.payroll_run_id,
                'employee_id', v_res.employee_id,
                'gross', v_res.gross, 'discounts', v_res.discounts, 'net', v_res.net,
                'base_inss', v_res.base_inss, 'base_fgts', v_res.base_fgts,
                'base_irrf', v_res.base_irrf, 'base_salary', v_res.base_salary,
                'employee', json_build_object(
                    'name', e.name, 'cpf', e.cpf, 'role', e.role,
                    'base_salary', e.base_salary
                )
            )
            FROM public.employees e WHERE e.id = v_emp
        ),
        'items', COALESCE((
            SELECT json_agg(json_build_object(
                'id', i.id, 'payroll_run_id', i.payroll_run_id, 'employee_id', i.employee_id,
                'code', i.code, 'type', i.type, 'amount', i.amount,
                'base_amount', i.base_amount, 'reference', i.reference, 'origin', i.origin
            ))
            FROM public.payroll_items i
            WHERE i.payroll_run_id = p_run_id AND i.employee_id = v_emp
        ), '[]'::json),
        'rubrics', COALESCE((
            SELECT json_agg(json_build_object('code', r.code, 'name', r.name, 'type', r.type))
            FROM public.rubrics r
            WHERE r.code IN (
                SELECT i.code FROM public.payroll_items i
                 WHERE i.payroll_run_id = p_run_id AND i.employee_id = v_emp
            )
        ), '[]'::json),
        'events', COALESCE((
            SELECT json_agg(json_build_object(
                'id', ev.id, 'employee_id', ev.employee_id, 'payroll_run_id', ev.payroll_run_id,
                'code', ev.code, 'rubric_code', ev.rubric_code, 'type', ev.type,
                'amount', ev.amount, 'description', ev.description
            ))
            FROM public.payroll_events ev
            WHERE ev.payroll_run_id = p_run_id AND ev.employee_id = v_emp
        ), '[]'::json),
        'organization', (
            SELECT json_build_object(
                'name', o.name, 'cnpj', o.cnpj, 'address', o.address,
                'settings', json_build_object('tipo_pessoa', o.settings->>'tipo_pessoa')
            )
            FROM public.organizations o WHERE o.id = v_run.org_id
        )
    );
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- O recibo continua por link (anon). CREATE OR REPLACE preserva os grants, mas
-- reafirma-se aqui para o arquivo ser a fonte da verdade.
REVOKE ALL ON FUNCTION public.fn_colab_portal_paystub(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_colab_portal_paystub(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_colab_portal_paystub(text, uuid) TO anon, authenticated;

-- As primitivas por employee_id: só os wrappers (definer, dono postgres) chamam.
REVOKE ALL ON FUNCTION public.portal_employee_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_absences(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_documents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_ged_documents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_payroll_runs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_time_entries(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_get_trainings(uuid) FROM PUBLIC, anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public.portal_employee_summary(uuid)', 'public.portal_get_absences(uuid)', 'public.portal_get_documents(uuid)', 'public.portal_get_ged_documents(uuid)', 'public.portal_get_payroll_runs(uuid)', 'public.portal_get_time_entries(uuid)', 'public.portal_get_trainings(uuid)'] LOOP
        IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
            RAISE EXCEPTION '% ainda executavel por anon/authenticated', f;
        END IF;
    END LOOP;
    IF NOT has_function_privilege('anon', 'public.fn_colab_portal_payroll_runs(text)', 'EXECUTE')
       OR NOT has_function_privilege('anon', 'public.fn_colab_portal_paystub(text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'wrappers do portal por link deveriam seguir chamaveis por anon';
    END IF;
    RAISE NOTICE 'OK: holerite so de folha FECHADA; primitivas por employee_id fechadas.';
END $$;
