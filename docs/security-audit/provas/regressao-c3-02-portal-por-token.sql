-- VERIFICAÇÃO 1.5a — as variantes por token funcionam como anon, e recusam token ruim.
-- Cria um token temporário e desfaz tudo no ROLLBACK.
BEGIN;

-- Token de teste para um colaborador real (descartado no rollback).
INSERT INTO public.portal_tokens (org_id, employee_id, token, expires_at, is_active)
SELECT e.org_id, e.id, 'poc-token-verificacao-1-5a', NOW() + INTERVAL '1 day', TRUE
  FROM public.employees e ORDER BY e.id LIMIT 1;

SELECT set_config('v.nome', (SELECT coalesce(name,'?') FROM employees ORDER BY id LIMIT 1), true);

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$
DECLARE
    v_nome text := current_setting('v.nome');
    r_sum text; r_pay text; r_time text;
    r_ruim text;
BEGIN
    SELECT left(fn_colab_portal_summary('poc-token-verificacao-1-5a')::text, 110) INTO r_sum;
    SELECT left(fn_colab_portal_payroll_runs('poc-token-verificacao-1-5a')::text, 110) INTO r_pay;
    SELECT left(fn_colab_portal_time_entries('poc-token-verificacao-1-5a')::text, 60) INTO r_time;

    BEGIN
        PERFORM fn_colab_portal_payroll_runs('token-que-nao-existe');
        r_ruim := 'FALHOU — token invalido foi ACEITO';
    EXCEPTION WHEN OTHERS THEN
        r_ruim := 'recusado corretamente (' || SQLERRM || ')';
    END;

    RAISE EXCEPTION E'\n=== VERIFICACAO 1.5a (transacao abortada) ===\n'
        'Colaborador: %\n'
        'Como ANON, com TOKEN VALIDO:\n'
        '  summary      : %\n'
        '  payroll_runs : %\n'
        '  time_entries : %\n'
        'Com TOKEN INVALIDO: %\n'
        '=== fim ===', v_nome, r_sum, r_pay, r_time, r_ruim;
END $$;

ROLLBACK;
