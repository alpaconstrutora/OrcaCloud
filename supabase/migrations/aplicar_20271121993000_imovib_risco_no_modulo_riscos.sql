-- Fase 7.6 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md
--
-- "Levar ao Módulo Riscos": o risco do estudo passa a ser gerido em project_risks.
-- project_risk_id guarda para onde ele foi — a tela não oferece levar duas vezes e
-- mostra o código do risco no módulo. Excluir o risco no módulo solta o vínculo.
--
-- Pergunta 1 (REGRA #7): sem policy nova (as de imovib_risks e project_risks valem:
-- gravar o vínculo exige poder editar o estudo; criar o risco exige ser membro da org).
-- Pergunta 2: sem função nova.
--
-- Reversão: ALTER TABLE public.imovib_risks DROP COLUMN project_risk_id;

ALTER TABLE public.imovib_risks
    ADD COLUMN IF NOT EXISTS project_risk_id uuid
        REFERENCES public.project_risks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS imovib_risks_project_risk_idx
    ON public.imovib_risks (project_risk_id) WHERE project_risk_id IS NOT NULL;

COMMENT ON COLUMN public.imovib_risks.project_risk_id IS
    'Risco do Módulo Riscos criado a partir deste (imovibService.levarRiscoAoModulo).';
