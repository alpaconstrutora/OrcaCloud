-- Folha: salário base da COMPETÊNCIA gravado no resultado
-- Plano: docs/planos/2026-10-22-folha-salario-por-competencia.md
--
-- O motor passou a tirar o salário do Histórico Salarial pela competência
-- (lib/payrollSalarioCompetencia.ts). A tela da folha e o holerite mostravam
-- employees.base_salary — o salário de HOJE —, então até uma folha fechada de
-- abril exibia o reajuste de setembro. A coluna guarda o salário contratual
-- usado no cálculo; folha fechada fica com o seu.
--
-- Backfill a partir do que cada folha JÁ calculou (não do histórico): é o que
-- foi pago. Mensal: SALARIO × 30 ÷ dias (desfaz a proporção da admissão);
-- demais tipos: base_amount da verba principal. Resultado sem verba
-- reconhecível fica NULL e a tela cai para o cadastro, como antes.
-- Idempotente: só preenche o que está NULL.

ALTER TABLE public.payroll_results
    ADD COLUMN IF NOT EXISTS base_salary numeric(12,2);

COMMENT ON COLUMN public.payroll_results.base_salary IS
    'Salário contratual na competência da folha (Histórico Salarial), gravado pelo motor. NULL = resultado antigo: exibir employees.base_salary.';

WITH verba AS (
    SELECT DISTINCT ON (pi.payroll_run_id, pi.employee_id)
           pi.payroll_run_id, pi.employee_id,
           CASE
               WHEN pi.code = 'SALARIO' AND pi.reference ~ '^[0-9]+(\.[0-9]+)?$' AND pi.reference::numeric > 0
                   THEN round(pi.amount * 30 / pi.reference::numeric, 2)
               WHEN pi.code = 'SALARIO' THEN round(pi.amount, 2)
               ELSE round(pi.base_amount, 2)
           END AS salario
      FROM public.payroll_items pi
     WHERE pi.code IN ('SALARIO', 'FERIAS', 'DECIMO', 'SALDO_SALARIO', 'ADIANTAMENTO')
     ORDER BY pi.payroll_run_id, pi.employee_id,
              array_position(ARRAY['SALARIO','SALDO_SALARIO','FERIAS','DECIMO','ADIANTAMENTO'], pi.code)
)
UPDATE public.payroll_results r
   SET base_salary = v.salario
  FROM verba v
 WHERE r.payroll_run_id = v.payroll_run_id
   AND r.employee_id   = v.employee_id
   AND r.base_salary IS NULL
   AND v.salario > 0;
