-- Backfill: cria vacation_balance para colaboradores CLT
-- que já existiam antes da implementação do módulo de férias.
-- Usa hire_date como inicio do período aquisitivo.
-- Conflitos (já existentes) são ignorados pelo ON CONFLICT DO NOTHING.

INSERT INTO public.vacation_balance (
    org_id,
    employee_id,
    periodo_inicio,
    periodo_fim,
    dias_direito,
    status
)
SELECT
    e.org_id,
    e.id,
    e.hire_date,
    e.hire_date + INTERVAL '1 year' - INTERVAL '1 day',
    30,
    CASE
        WHEN e.hire_date + INTERVAL '1 year' - INTERVAL '1 day' < CURRENT_DATE THEN 'ABERTO'
        ELSE 'ABERTO'
    END
FROM public.employees e
WHERE e.contract_type = 'CLT'
  AND e.hire_date IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.vacation_balance vb
      WHERE vb.employee_id = e.id
        AND vb.periodo_inicio = e.hire_date
  )
ON CONFLICT (employee_id, periodo_inicio) DO NOTHING;
