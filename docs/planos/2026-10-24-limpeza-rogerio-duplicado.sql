-- Rogério da Silva Santos DUPLICADO (24/10/2026, autorizado pelo usuário: "Excluir e passar rubricas")
-- Duplicado 55c517ea-b2f5-4e22-9c1f-8c1c38209f21: criado em 22/10 19:44 UTC por "Importar Agora"
-- (laborService.migrateLegacyWorkers) com a Garden selecionada, quando o verdadeiro ainda estava na Alpa.
-- Verdadeiro cd183303-03b0-4272-9855-80546a4ed508.
-- Backups _bkp_rogerio_duplicado_20261024_*: NÃO apagar.
BEGIN;

CREATE TABLE public._bkp_rogerio_duplicado_20261024_employee AS
    SELECT * FROM public.employees WHERE id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';
CREATE TABLE public._bkp_rogerio_duplicado_20261024_results AS
    SELECT * FROM public.payroll_results WHERE employee_id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';
CREATE TABLE public._bkp_rogerio_duplicado_20261024_rubricas AS
    SELECT * FROM public.employee_automatic_rubrics
     WHERE employee_id IN ('55c517ea-b2f5-4e22-9c1f-8c1c38209f21', 'cd183303-03b0-4272-9855-80546a4ed508');

ALTER TABLE public._bkp_rogerio_duplicado_20261024_employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_rogerio_duplicado_20261024_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_rogerio_duplicado_20261024_rubricas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bkp_rogerio_duplicado_20261024_employee FROM anon, authenticated;
REVOKE ALL ON public._bkp_rogerio_duplicado_20261024_results  FROM anon, authenticated;
REVOKE ALL ON public._bkp_rogerio_duplicado_20261024_rubricas FROM anon, authenticated;

-- Rubricas do duplicado passam para o verdadeiro (na org do verdadeiro).
INSERT INTO public.employee_automatic_rubrics (employee_id, rubric_code, org_id, valor_tipo, valor)
SELECT 'cd183303-03b0-4272-9855-80546a4ed508', d.rubric_code, e.org_id, d.valor_tipo, d.valor
  FROM public.employee_automatic_rubrics d
  JOIN public.employees e ON e.id = 'cd183303-03b0-4272-9855-80546a4ed508'
 WHERE d.employee_id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21'
ON CONFLICT (employee_id, rubric_code) DO NOTHING;

DELETE FROM public.payroll_results            WHERE employee_id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';
DELETE FROM public.employee_automatic_rubrics WHERE employee_id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';
DELETE FROM public.employees                  WHERE id          = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';

-- Portão: se não bater exatamente, desfaz tudo.
DO $$
DECLARE bkp_e int; bkp_r int; bkp_rub int; resta int; rub_orig text; rogerios int;
BEGIN
    SELECT count(*) INTO bkp_e   FROM public._bkp_rogerio_duplicado_20261024_employee;
    SELECT count(*) INTO bkp_r   FROM public._bkp_rogerio_duplicado_20261024_results;
    SELECT count(*) INTO bkp_rub FROM public._bkp_rogerio_duplicado_20261024_rubricas;
    SELECT count(*) INTO resta   FROM public.employees WHERE id = '55c517ea-b2f5-4e22-9c1f-8c1c38209f21';
    SELECT string_agg(rubric_code, ',' ORDER BY rubric_code) INTO rub_orig
      FROM public.employee_automatic_rubrics WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508';
    SELECT count(*) INTO rogerios FROM public.employees WHERE name ILIKE 'rog%rio da silva santos';
    IF bkp_e <> 1 OR bkp_r <> 2 OR bkp_rub <> 3 OR resta <> 0 OR rogerios <> 1
       OR rub_orig IS DISTINCT FROM 'ADIANTAMENTO,AUXEDU,VA' THEN
        RAISE EXCEPTION 'PORTAO REPROVADO: bkp_e=% bkp_r=% bkp_rub=% resta=% rogerios=% rub_orig=%',
            bkp_e, bkp_r, bkp_rub, resta, rogerios, rub_orig;
    END IF;
END $$;

COMMIT;
