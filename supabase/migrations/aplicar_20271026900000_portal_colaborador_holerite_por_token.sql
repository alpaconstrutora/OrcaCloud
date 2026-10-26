-- ============================================================
-- Migration: aplicar_20271026900000_portal_colaborador_holerite_por_token.sql
-- Plano: docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md § 1.1
--
-- PROBLEMA
-- No Portal do Colaborador, a aba Folha lista os holerites por RPC
-- (`fn_colab_portal_payroll_runs`), mas o recibo aberto ao tocar num deles
-- (`PaystubModal`) lia SEIS tabelas direto: payroll_runs, payroll_results,
-- payroll_items, rubrics, payroll_events e organizations. Pelo link a sessão é
-- `anon`, e a policy de payroll_runs é `is_org_member(org_id)` → 0 linhas →
-- `getRun().single()` falha e o colaborador vê "getRun: …".
--
-- As duas prévias do RH (aba "Prévia do Portal" e o ícone de celular na Gestão
-- de Acessos) rodam com a sessão do ADMIN, então lá o recibo abria — e o defeito
-- ficou invisível justamente para quem podia vê-lo.
--
-- A CORREÇÃO
-- Uma RPC por token que devolve, de uma vez, tudo o que o recibo usa — e só
-- isso: o cadastro do colaborador vai reduzido a nome/CPF/cargo/salário (não
-- `employees.*`), a organização a nome/CNPJ/endereço/tipo de pessoa (não o
-- `settings` inteiro), as rubricas só as que aparecem no recibo.
--
-- AUTORIZAÇÃO (dentro da função, REGRA #7)
-- 1. o token resolve o colaborador (`fn_colab_portal_employee` — expira, revoga);
-- 2. a folha só sai se existir `payroll_results` DESTE colaborador nela — o mesmo
--    critério de `portal_get_payroll_runs`, que monta a lista da aba Folha.
--    Quem chuta o id de outra folha recebe erro, não o recibo.
-- ============================================================

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
-- `anon` PRECISA executar: o portal é acesso por link, sem sessão. O REVOKE
-- nomeia PUBLIC e anon — o default do Supabase dá grant NOMINAL a anon, que
-- revogar de PUBLIC não remove — e só então o GRANT explícito.
REVOKE ALL ON FUNCTION public.fn_colab_portal_paystub(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_colab_portal_paystub(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_colab_portal_paystub(text, uuid) TO anon, authenticated;

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_colab_portal_paystub(text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_colab_portal_paystub deveria ser chamavel por anon (portal por link)';
    END IF;
    IF has_function_privilege('anon', 'public.fn_colab_portal_employee(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_colab_portal_employee (primitiva interna) nao pode ficar chamavel por anon';
    END IF;
    RAISE NOTICE 'OK: fn_colab_portal_paystub por token; primitiva interna segue fechada.';
END $$;
