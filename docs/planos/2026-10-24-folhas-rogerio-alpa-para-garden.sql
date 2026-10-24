-- Rogério da Silva Santos: folhas para a organização em que ele é REGISTRADO (Garden)
-- Pedido (24/10/2026): "corrigir todas as folhas! Se for necesssario relanço manualmente novamente!
-- Importante é corrigir as folhas nas organizacoes corretas"
-- Regra do usuário: a folha é gerada só na organização em que o colaborador é registrado; o custo pode ser
-- alocado em outra pela aba Alocações.
-- Auditoria (24/10): só o Rogério tinha resultado numa folha de organização ≠ a dele — 11 folhas da Alpa
-- (11/2025 a 09/2026), todas com a folha correspondente na Garden; títulos dessas folhas da Alpa: nenhum pago.
-- Backups _bkp_folha_rogerio_alpa_20261024_*: NÃO apagar.
BEGIN;

CREATE TEMP TABLE mapa ON COMMIT DROP AS
SELECT ra.id AS run_alpa, rg.id AS run_garden, ra.start_date, ra.type
  FROM public.payroll_runs ra
  JOIN public.employees e ON e.id = 'cd183303-03b0-4272-9855-80546a4ed508'
  JOIN public.payroll_runs rg
    ON rg.org_id = e.org_id AND rg.start_date = ra.start_date AND rg.end_date = ra.end_date
   AND rg.type = ra.type AND coalesce(rg.subtype, '') = coalesce(ra.subtype, '')
 WHERE ra.org_id <> e.org_id
   AND ra.id IN (SELECT payroll_run_id FROM public.payroll_results WHERE employee_id = e.id);

CREATE TABLE public._bkp_folha_rogerio_alpa_20261024_results AS
    SELECT * FROM public.payroll_results WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508'
       AND payroll_run_id IN (SELECT run_alpa FROM mapa);
CREATE TABLE public._bkp_folha_rogerio_alpa_20261024_items AS
    SELECT * FROM public.payroll_items WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508'
       AND payroll_run_id IN (SELECT run_alpa FROM mapa);
CREATE TABLE public._bkp_folha_rogerio_alpa_20261024_events AS
    SELECT * FROM public.payroll_events WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508'
       AND payroll_run_id IN (SELECT run_alpa FROM mapa);
ALTER TABLE public._bkp_folha_rogerio_alpa_20261024_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_folha_rogerio_alpa_20261024_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_folha_rogerio_alpa_20261024_events  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bkp_folha_rogerio_alpa_20261024_results FROM anon, authenticated;
REVOKE ALL ON public._bkp_folha_rogerio_alpa_20261024_items   FROM anon, authenticated;
REVOKE ALL ON public._bkp_folha_rogerio_alpa_20261024_events  FROM anon, authenticated;

-- Eventos lançados à mão vão para a folha da Garden do mesmo mês/tipo — menos o que a Garden já
-- tem para ele com o mesmo código (sairia em dobro; fica só no backup).
UPDATE public.payroll_events ev
   SET payroll_run_id = m.run_garden,
       org_id = (SELECT org_id FROM public.employees WHERE id = ev.employee_id)
  FROM mapa m
 WHERE ev.payroll_run_id = m.run_alpa
   AND ev.employee_id = 'cd183303-03b0-4272-9855-80546a4ed508'
   AND NOT EXISTS (SELECT 1 FROM public.payroll_events g
                    WHERE g.payroll_run_id = m.run_garden AND g.employee_id = ev.employee_id
                      AND coalesce(g.rubric_code, g.code) = coalesce(ev.rubric_code, ev.code));

DELETE FROM public.payroll_events
 WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa);
DELETE FROM public.payroll_items
 WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa);
DELETE FROM public.payroll_results
 WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa);

-- Portão: 11 folhas mapeadas, nada dele sobrando na Alpa, todo evento do backup ou foi movido ou era
-- duplicado de um evento que a Garden já tinha.
DO $$
DECLARE folhas int; sobra int; bkp_ev int; movidos int; dup int; bkp_res int;
BEGIN
    SELECT count(*) INTO folhas FROM mapa;
    SELECT count(*) INTO bkp_res FROM public._bkp_folha_rogerio_alpa_20261024_results;
    SELECT (SELECT count(*) FROM public.payroll_results WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa))
         + (SELECT count(*) FROM public.payroll_items   WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa))
         + (SELECT count(*) FROM public.payroll_events  WHERE employee_id = 'cd183303-03b0-4272-9855-80546a4ed508' AND payroll_run_id IN (SELECT run_alpa FROM mapa))
      INTO sobra;
    SELECT count(*) INTO bkp_ev FROM public._bkp_folha_rogerio_alpa_20261024_events;
    SELECT count(*) INTO movidos FROM public.payroll_events
     WHERE id IN (SELECT id FROM public._bkp_folha_rogerio_alpa_20261024_events)
       AND payroll_run_id IN (SELECT run_garden FROM mapa);
    dup := bkp_ev - movidos;
    IF folhas <> 11 OR bkp_res <> 11 OR sobra <> 0 OR dup <> 1 THEN
        RAISE EXCEPTION 'PORTAO REPROVADO: folhas=% bkp_res=% sobra=% bkp_ev=% movidos=% dup=%',
            folhas, bkp_res, sobra, bkp_ev, movidos, dup;
    END IF;
    RAISE NOTICE 'OK folhas=% bkp_res=% bkp_ev=% movidos=% dup=%', folhas, bkp_res, bkp_ev, movidos, dup;
END $$;

COMMIT;
