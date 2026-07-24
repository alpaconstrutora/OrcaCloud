-- ─── Ponte Vale Refeição → Folha de Pagamento ─────────────────────────────────
-- Ao aprovar o cálculo mensal de VR, o módulo passa a lançar em payroll_events:
--   • VR_DESCONTO   (desconto)    → a coparticipação do empregado bate no líquido
--   • VR_BENEFICIO  (informativa) → o valor do benefício aparece no contracheque
--                                    sem afetar o líquido (pago via cartão/ticket)
--
-- Os eventos são consumidos pelo payrollEngine da mesma forma que os incentivos
-- (payroll_events com approval_status='APROVADO' e payroll_run_id NULL entram na
-- folha do período — ver services/payrollEngine.ts passo 4 "EVENTOS MANUAIS").
--
-- Rubricas são GLOBAIS (tabela public.rubrics, PK = code) — semeadas uma vez.
-- Postura fiscal: VR sob o PAT não integra salário, logo não incide INSS/FGTS/IRRF.

INSERT INTO public.rubrics
    (code, name, type, incidence_inss, incidence_fgts, incidence_irrf,
     is_automatic, calculation_type, active)
VALUES
    ('VR_DESCONTO',  'Vale Refeição — Coparticipação', 'desconto',    false, false, false, false, 'manual', true),
    ('VR_BENEFICIO', 'Vale Refeição (informativo)',    'informativa', false, false, false, false, 'manual', true)
ON CONFLICT (code) DO UPDATE
    SET name   = EXCLUDED.name,
        type   = EXCLUDED.type,
        active = true;

NOTIFY pgrst, 'reload schema';
