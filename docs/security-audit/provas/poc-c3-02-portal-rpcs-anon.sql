-- VERIFICAÇÃO — família portal_get_*(p_employee_id) executável por anon.
-- Somente leitura.
BEGIN;

SELECT set_config('poc.emp_id', (SELECT id::text FROM employees ORDER BY id LIMIT 1), true);
SELECT set_config('poc.emp_nome', (SELECT coalesce(name,'?') FROM employees ORDER BY id LIMIT 1), true);

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$
DECLARE
    v_emp  uuid := current_setting('poc.emp_id')::uuid;
    v_nome text := current_setting('poc.emp_nome');
    v_le_employees int;
    r_sum text; r_pay text; r_doc text; r_ged text; r_abs text;
    FUNCTION_MISSING text := '(indisponivel)';
BEGIN
    -- Controle: anon consegue ler a tabela employees direto?
    v_le_employees := -1; -- anon nao tem GRANT em employees (42501)

    BEGIN SELECT left(portal_employee_summary(v_emp)::text, 130) INTO r_sum;
    EXCEPTION WHEN OTHERS THEN r_sum := 'ERRO: ' || SQLERRM; END;

    BEGIN SELECT left(portal_get_payroll_runs(v_emp)::text, 130) INTO r_pay;
    EXCEPTION WHEN OTHERS THEN r_pay := 'ERRO: ' || SQLERRM; END;

    BEGIN SELECT left(portal_get_documents(v_emp)::text, 130) INTO r_doc;
    EXCEPTION WHEN OTHERS THEN r_doc := 'ERRO: ' || SQLERRM; END;

    BEGIN SELECT left(portal_get_ged_documents(v_emp)::text, 130) INTO r_ged;
    EXCEPTION WHEN OTHERS THEN r_ged := 'ERRO: ' || SQLERRM; END;

    BEGIN SELECT left(portal_get_absences(v_emp)::text, 130) INTO r_abs;
    EXCEPTION WHEN OTHERS THEN r_abs := 'ERRO: ' || SQLERRM; END;

    RAISE EXCEPTION E'\n=== portal_get_* como ANON, so com o employee_id ===\n'
        'Colaborador alvo: % (%)\n'
        'SELECT direto em employees (controle): % linhas\n'
        '--- retorno das RPCs ---\n'
        'portal_employee_summary : %\n'
        'portal_get_payroll_runs : %\n'
        'portal_get_documents    : %\n'
        'portal_get_ged_documents: %\n'
        'portal_get_absences     : %\n'
        '=== fim ===',
        v_nome, v_emp, v_le_employees,
        coalesce(r_sum,'(null)'), coalesce(r_pay,'(null)'), coalesce(r_doc,'(null)'),
        coalesce(r_ged,'(null)'), coalesce(r_abs,'(null)');
END $$;

ROLLBACK;
